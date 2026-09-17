import fs from 'node:fs'
import path from 'node:path'

// Read fresh every call (never cached) - the whole point of grounding the prompt in this file is
// that the comparatif-tco agent keeps enriching it with new real examples over time. If this were
// cached once, every future improvement to that memory would need a server restart to take
// effect; reading it live means the generated note improves automatically as the memory does.
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
}

/**
 * Drafts the "Note Acheteur" section of a generated TCO by asking Claude to reason like the
 * professional buyer whose real comparatifs were studied to build `comparatif-tco.md` - that
 * memory (structures, recurring criteria, how the moins-disant/retenu distinction is usually
 * made) is included verbatim as system context on every call, never summarised or baked in ahead
 * of time, so the note's quality tracks whatever that memory currently knows.
 */
export async function generateTcoNote(params: {
  lotTitle: string
  cfcCode: string
  projectName: string
  suppliers: TcoSupplierInput[]
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY n'est pas configurée sur le serveur")
  }

  const memory = loadComparatifMemory()
  const system = [
    "Tu es un acheteur professionnel dans la construction (Suisse romande). Tu rédiges la note d'analyse d'un comparatif d'offres (TCO) pour un lot, dans le même esprit que les meilleurs comparatifs réels étudiés sur ce projet, résumés ci-dessous.",
    memory || '(mémoire de comparatifs réels non disponible pour cet appel - base-toi sur les bonnes pratiques générales d\'achat construction)',
    [
      'Consignes strictes :',
      "- Base-toi UNIQUEMENT sur les données fournies dans le message utilisateur. N'invente jamais un montant, un fournisseur, un délai ou un fait qui n'y figure pas.",
      '- Tous les montants fournis (estimatedAmount, offeredAmount) sont HT (hors taxe) - compare-les systématiquement sur cette base, ne les qualifie jamais de TTC et ne les mélange jamais avec de la TVA.',
      "- Distingue explicitement l'offre la moins disante du fournisseur retenu si ce sont deux entités différentes, et explique en une phrase pourquoi ce choix a du sens au vu des données (non-conformité, notes, écart de prix) - ou signale-le comme point à clarifier si rien dans les données ne le justifie.",
      '- Signale toute non-conformité relevée.',
      "- Commente aussi les aspects techniques/qualitatifs présents dans les notes des fournisseurs (réserves, variantes, écarts au cahier des charges) séparément du prix, dans l'esprit des comparatifs réels qui séparent le jugement technique du jugement prix - ne réduis jamais l'analyse au seul montant.",
      '- 150 à 250 mots, en français, ton direct et professionnel, sans markdown ni puces.',
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
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: JSON.stringify(params, null, 2) }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Échec de la génération de la note (${res.status}) : ${body}`)
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }> }
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Réponse vide du modèle')
  return text.trim()
}
