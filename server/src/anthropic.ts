import fs from 'node:fs'
import path from 'node:path'

// Read fresh every call (never cached) - the whole point of grounding the prompt in this file is
// that the comparatif-tco agent keeps enriching it with new real examples over time. If this were
// cached once, every future improvement to that memory would need a server restart to take
// effect; reading it live means the generated analysis improves automatically as the memory does.
function loadComparatifMemory(): string {
  try {
    const filePath = path.join(__dirname, '..', '.claude', 'agents', 'comparatif-tco.md')
    const raw = fs.readFileSync(filePath, 'utf-8')
    return raw.replace(/^---[\s\S]*?---\n/, '').trim()
  } catch {
    return ''
  }
}

export interface TcoSupplierInput {
  name: string
  estimatedAmount?: string
  offeredAmount?: string
  conforme: boolean
  notes?: string
  retained: boolean
  deliveryTime?: string
  offerValidUntil?: string
  paymentTerms?: string
  nonConformityReason?: string
}

export interface TcoTechnicalCriterion {
  criterion: string
  values: Record<string, string>
  analysis?: string
}

export interface TcoAnalysis {
  note: string
  technical: TcoTechnicalCriterion[]
}

/**
 * Drafts the "Note acheteur" and, when the fournisseurs' free-text notes actually contain
 * technical substance, a structured "Comparatif technique" (one row per criterion actually
 * mentioned, one column per fournisseur) - by asking Claude to reason like the professional buyer
 * whose real comparatifs were studied to build `comparatif-tco.md`. That memory (structures,
 * recurring criteria, how technical criteria are extracted and separated from price in the real
 * corpus) is included verbatim as system context on every call, never summarised or baked in
 * ahead of time, so quality tracks whatever that memory currently knows.
 *
 * Per that memory's explicit recommendation: there is no fixed universal set of technical fields
 * across trades (a caniveau's EN124 load class has nothing in common with a fenêtre's Ug/Uf/Uw
 * coefficients) - so the technical criteria are extracted dynamically from what's actually present
 * in this lot's supplier notes, never a fixed list, and never invented when notes are thin/absent.
 */
export async function generateTcoAnalysis(params: {
  lotTitle: string
  cfcCode: string
  projectName: string
  suppliers: TcoSupplierInput[]
  positions?: Array<{ code: string; title: string; prices: Record<string, string> }>
}): Promise<TcoAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY n'est pas configurée sur le serveur")
  }

  const memory = loadComparatifMemory()
  const system = [
    "Tu es un acheteur professionnel dans la construction (Suisse romande). Tu produis l'analyse d'un comparatif d'offres (TCO) pour un lot, dans le même esprit que les meilleurs comparatifs réels étudiés sur ce projet, résumés ci-dessous.",
    memory || '(mémoire de comparatifs réels non disponible pour cet appel - base-toi sur les bonnes pratiques générales d\'achat construction)',
    [
      'Consignes strictes :',
      "- Base-toi UNIQUEMENT sur les données fournies dans le message utilisateur. N'invente jamais un montant, un fournisseur, un délai, une valeur technique ou un fait qui n'y figure pas.",
      '- Tous les montants fournis (estimatedAmount, offeredAmount, et les prix de la grille "positions" le cas échéant) sont HT (hors taxe) - compare-les systématiquement sur cette base, ne les qualifie jamais de TTC et ne les mélange jamais avec de la TVA.',
      "- Distingue explicitement l'offre la moins disante du fournisseur retenu si ce sont deux entités différentes, et explique en une phrase pourquoi ce choix a du sens au vu des données (non-conformité, notes, écart de prix) - ou signale-le comme point à clarifier si rien dans les données ne le justifie.",
      '- Signale toute non-conformité relevée (voir conforme/nonConformityReason).',
      '- Pour le "technical" : liste UNIQUEMENT les critères techniques réellement mentionnés dans les champs "notes" des fournisseurs de ce lot (jamais une liste générique imposée a priori - un caniveau et une fenêtre n\'ont pas les mêmes critères). Si un fournisseur ne précise rien sur un critère qu\'un autre mentionne, mets "non précisé" pour lui plutôt que de deviner. Si aucune note ne contient de contenu technique substantiel, retourne un tableau "technical" vide - ne fabrique jamais un tableau technique creux ou générique.',
      '- Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, de la forme exacte : {"note": "...", "technical": [{"criterion": "...", "values": {"<nom exact du fournisseur>": "..."}, "analysis": "..."}]}. "note" : 150 à 250 mots, en français, ton direct et professionnel, sans markdown ni puces - commente aussi brièvement les aspects techniques/qualitatifs séparément du prix, sans dupliquer le détail déjà dans "technical". "analysis" par critère technique (optionnel) : une phrase expliquant en quoi ce critère influence ou non la recommandation.',
    ].join('\n'),
  ].join('\n\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: JSON.stringify(params, null, 2) }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Échec de la génération de l'analyse (${res.status}) : ${body}`)
  }
  const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> }
  // Don't assume content[0] is the text block - a "thinking" block (or any other block type) can
  // come first in the array, which silently produced an empty note before this fix.
  const textBlock = data.content?.find((block) => block.type === 'text' && block.text)
  const text = textBlock?.text
  if (!text) {
    console.error('generateTcoAnalysis: pas de bloc texte dans la réponse Claude', JSON.stringify(data))
    throw new Error('Réponse vide du modèle')
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('generateTcoAnalysis: JSON invalide reçu du modèle', text)
    throw new Error('Réponse JSON invalide du modèle')
  }
  const obj = parsed as { note?: unknown; technical?: unknown }
  const note = typeof obj.note === 'string' ? obj.note.trim() : ''
  if (!note) throw new Error('Note absente de la réponse du modèle')
  const technical: TcoTechnicalCriterion[] = Array.isArray(obj.technical)
    ? obj.technical
        .filter(
          (t): t is { criterion: unknown; values: unknown; analysis?: unknown } =>
            typeof t === 'object' && t !== null,
        )
        .map((t) => ({
          criterion: typeof t.criterion === 'string' ? t.criterion : '',
          values:
            typeof t.values === 'object' && t.values !== null
              ? Object.fromEntries(
                  Object.entries(t.values as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
                )
              : {},
          analysis: typeof t.analysis === 'string' ? t.analysis : undefined,
        }))
        .filter((t) => t.criterion)
    : []

  return { note, technical }
}
