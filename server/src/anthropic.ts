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
  offerFileId?: string
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

/** A supplier's own uploaded offer file (PDF or image), read as base64 - passed to Claude as a
 *  real document/image content block so it can extract line items itself, the same way a plain
 *  Claude.ai chat reads an uploaded PDF directly instead of only seeing a hand-typed summary. */
export interface TcoOfferDocument {
  supplierName: string
  mediaType: string
  base64: string
}

export interface TcoTechnicalCriterion {
  criterion: string
  values: Record<string, string>
  analysis?: string
}

export interface TcoOfferLineValue {
  unitPrice?: string
  currency?: string
  amount?: string
  matchStatus: 'exact' | 'assumed' | 'none'
  note?: string
}

export interface TcoOfferLine {
  label: string
  quantity?: string
  unit?: string
  values: Record<string, TcoOfferLineValue>
}

/** Only produced when at least one offer document was attached and readable - a line-by-line
 *  match across the fournisseurs' own offers, extracted directly from the documents rather than
 *  from hand-typed summary fields. See comparatif-tco.md for why transparency about assumed
 *  matches/exchange rates matters as much as the numbers themselves. */
export interface TcoOffersComparison {
  lines: TcoOfferLine[]
  exchangeRates: Record<string, number>
  assumptions: string[]
}

export interface TcoAnalysis {
  note: string
  technical: TcoTechnicalCriterion[]
  offersComparison?: TcoOffersComparison
}

/**
 * Drafts the "Note acheteur", a "Comparatif technique" when fournisseur notes carry technical
 * substance, and - when actual offer documents are attached - a full line-by-line
 * "offersComparison" extracted directly from those documents, by asking Claude to reason like the
 * professional buyer whose real comparatifs were studied to build `comparatif-tco.md`. That memory
 * is included verbatim as system context on every call, never summarised or baked in ahead of
 * time, so quality tracks whatever that memory currently knows.
 *
 * The offer documents are the key difference from earlier versions of this function: previously
 * the model only ever saw hand-typed summary fields (a single lump `offeredAmount` per fournisseur)
 * - it could comment on them but never actually read a fournisseur's own PDF, match its line items
 * against another fournisseur's differently-formatted offer, or catch a currency it needs to
 * convert. Passing the real documents through (as `document`/`image` content blocks, exactly what
 * a plain Claude.ai chat does when a PDF is uploaded directly) closes that gap.
 */
export async function generateTcoAnalysis(params: {
  lotTitle: string
  cfcCode: string
  projectName: string
  suppliers: TcoSupplierInput[]
  positions?: Array<{ code: string; title: string; quantity?: string; unit?: string; unitPrices: Record<string, string> }>
  offerDocuments?: TcoOfferDocument[]
}): Promise<TcoAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY n'est pas configurée sur le serveur")
  }

  const hasDocuments = (params.offerDocuments?.length ?? 0) > 0
  const memory = loadComparatifMemory()
  const system = [
    "Tu es un acheteur professionnel dans la construction (Suisse romande). Tu produis l'analyse d'un comparatif d'offres (TCO) pour un lot, dans le même esprit que les meilleurs comparatifs réels étudiés sur ce projet, résumés ci-dessous.",
    memory || '(mémoire de comparatifs réels non disponible pour cet appel - base-toi sur les bonnes pratiques générales d\'achat construction)',
    [
      'Consignes strictes :',
      "- Base-toi UNIQUEMENT sur les données et documents fournis. N'invente jamais un montant, un fournisseur, un délai, une valeur technique ou une ligne de prix qui n'y figure pas.",
      '- Tous les montants HT (hors taxe) - compare-les systématiquement sur cette base, ne les qualifie jamais de TTC et ne les mélange jamais avec de la TVA. Dans "positions", "quantity"/"unit" sont communs à tous les fournisseurs (le métré de l\'acheteur) - le total d\'un article pour un fournisseur se calcule en multipliant sa valeur dans "unitPrices" par "quantity", même si ce fournisseur n\'a donné qu\'un prix unitaire sans total ni quantité propre.',
      "- Distingue explicitement l'offre la moins disante du fournisseur retenu si ce sont deux entités différentes, et explique en une phrase pourquoi ce choix a du sens au vu des données (non-conformité, notes, écart de prix) - ou signale-le comme point à clarifier si rien dans les données ne le justifie.",
      '- Signale toute non-conformité relevée (voir conforme/nonConformityReason).',
      '- Pour le "technical" : liste UNIQUEMENT les critères techniques réellement mentionnés dans les champs "notes" des fournisseurs de ce lot (jamais une liste générique imposée a priori - un caniveau et une fenêtre n\'ont pas les mêmes critères). Si un fournisseur ne précise rien sur un critère qu\'un autre mentionne, mets "non précisé" pour lui plutôt que de deviner. Si aucune note ne contient de contenu technique substantiel, retourne un tableau "technical" vide - ne fabrique jamais un tableau technique creux ou générique.',
      ...(hasDocuments
        ? [
            '- Des documents d\'offre (PDF/image) sont joints, chacun précédé d\'une ligne indiquant à quel fournisseur il appartient. LIS-LES intégralement toi-même : extrais chaque position/ligne de chaque offre jointe (désignation, quantité, unité, prix unitaire, montant, devise), même si les fournisseurs utilisent des formats, langues ou systèmes de codes totalement différents (traduis mentalement si besoin, ex. italien "raggio" = français "rayon").',
            '- Mets en correspondance les lignes qui décrivent le MÊME article/la même prestation d\'un fournisseur à l\'autre. Une correspondance évidente (même désignation ou code) est "exact". Une correspondance déduite du libellé/contexte (pas certaine) est "assumed" et DOIT avoir une "note" expliquant le rapprochement fait - ne présente jamais un rapprochement incertain comme une certitude. Une ligne sans correspondance chez un fournisseur donné est "none" pour lui, jamais devinée ou approximée sans le signaler.',
            '- La quantité d\'une ligne est celle du métré de l\'acheteur (visible dans l\'offre qui la détaille le plus précisément, ou dans "positions" si fourni) - reprends-la pour calculer le montant d\'un fournisseur qui n\'a donné qu\'un prix unitaire sans détailler sa propre quantité.',
            '- Si une offre est dans une devise autre que CHF, indique le taux de change utilisé dans "exchangeRates" (ex. {"EUR": 0.945}) et précise dans "assumptions" qu\'il s\'agit d\'un taux indicatif à confirmer par l\'acheteur au jour de la commande - ne calcule jamais un montant CHF sans que ce taux soit traçable dans "exchangeRates".',
            '- Remplis "offersComparison.assumptions" avec CHAQUE hypothèse ou rapprochement incertain fait (correspondance de produit supposée, quantité reprise d\'un autre fournisseur, taux de change utilisé, poste sans correspondance, frais annexes non chiffrés comme transport/emballage/dédouanement...) - cette transparence est ce qui rend le comparatif utilisable par l\'acheteur, pas seulement le tableau de chiffres.',
          ]
        : [
            '- Aucun document d\'offre n\'est joint pour cet appel : omets entièrement le champ "offersComparison" (ne le déduis jamais des seules données résumées, qui ont leur propre affichage séparé dans l\'app).',
          ]),
      `- Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown, de la forme exacte : {"note": "...", "technical": [{"criterion": "...", "values": {"<nom exact du fournisseur>": "..."}, "analysis": "..."}]${hasDocuments ? ', "offersComparison": {"lines": [{"label": "...", "quantity": "...", "unit": "...", "values": {"<nom exact du fournisseur>": {"unitPrice": "...", "currency": "CHF", "amount": "...", "matchStatus": "exact", "note": "..."}}}], "exchangeRates": {"EUR": 0.945}, "assumptions": ["..."]}' : ''}}. "note" : 150 à 250 mots, en français, ton direct et professionnel, sans markdown ni puces - commente aussi brièvement les aspects techniques/qualitatifs séparément du prix, sans dupliquer le détail déjà dans "technical"${hasDocuments ? '/"offersComparison"' : ''}. "analysis" par critère technique (optionnel) : une phrase expliquant en quoi ce critère influence ou non la recommandation.`,
    ].join('\n'),
  ].join('\n\n')

  const userContent: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: JSON.stringify(
        {
          lotTitle: params.lotTitle,
          cfcCode: params.cfcCode,
          projectName: params.projectName,
          suppliers: params.suppliers,
          positions: params.positions,
        },
        null,
        2,
      ),
    },
  ]
  for (const doc of params.offerDocuments ?? []) {
    userContent.push({ type: 'text', text: `Offre du fournisseur "${doc.supplierName}" (document ci-dessous) :` })
    userContent.push({
      type: doc.mediaType.startsWith('image/') ? 'image' : 'document',
      source: { type: 'base64', media_type: doc.mediaType, data: doc.base64 },
    })
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      // Reading several real offer documents and extracting/matching every line item across all
      // of them (5 fournisseurs confirmed to genuinely need this in production) produces a much
      // longer JSON response than a short note - 4096 was cutting the response off before any
      // complete text block came out, surfacing as a misleading "Réponse vide du modèle" rather
      // than a token-limit error. Scale the budget with how many documents are actually attached.
      max_tokens: hasDocuments ? Math.min(2000 + (params.offerDocuments?.length ?? 0) * 2000, 16000) : 1500,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Échec de la génération de l'analyse (${res.status}) : ${body}`)
  }
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>
    stop_reason?: string
  }
  // Don't assume content[0] is the text block - a "thinking" block (or any other block type) can
  // come first in the array, which silently produced an empty note before this fix.
  const textBlock = data.content?.find((block) => block.type === 'text' && block.text)
  const text = textBlock?.text
  if (!text) {
    console.error(
      `generateTcoAnalysis: pas de bloc texte dans la réponse Claude (stop_reason=${data.stop_reason})`,
      JSON.stringify(data),
    )
    throw new Error(
      data.stop_reason === 'max_tokens'
        ? 'Réponse du modèle coupée (trop de contenu à traiter pour ce lot) - réessayez ou réduisez le nombre de documents joints'
        : 'Réponse vide du modèle',
    )
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error(
      `generateTcoAnalysis: JSON invalide reçu du modèle (stop_reason=${data.stop_reason})`,
      text,
    )
    throw new Error(
      data.stop_reason === 'max_tokens'
        ? 'Réponse du modèle coupée (trop de contenu à traiter pour ce lot) - réessayez ou réduisez le nombre de documents joints'
        : 'Réponse JSON invalide du modèle',
    )
  }
  const obj = parsed as { note?: unknown; technical?: unknown; offersComparison?: unknown }
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

  let offersComparison: TcoOffersComparison | undefined
  const oc = obj.offersComparison as
    | { lines?: unknown; exchangeRates?: unknown; assumptions?: unknown }
    | undefined
  if (oc && typeof oc === 'object') {
    const lines: TcoOfferLine[] = Array.isArray(oc.lines)
      ? oc.lines
          .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
          .map((l) => ({
            label: typeof l.label === 'string' ? l.label : '',
            quantity: typeof l.quantity === 'string' ? l.quantity : undefined,
            unit: typeof l.unit === 'string' ? l.unit : undefined,
            values:
              typeof l.values === 'object' && l.values !== null
                ? Object.fromEntries(
                    Object.entries(l.values as Record<string, unknown>).map(([supplier, v]) => {
                      const val = v as Record<string, unknown>
                      const matchStatus =
                        val?.matchStatus === 'exact' || val?.matchStatus === 'assumed' || val?.matchStatus === 'none'
                          ? val.matchStatus
                          : 'none'
                      return [
                        supplier,
                        {
                          unitPrice: typeof val?.unitPrice === 'string' ? val.unitPrice : undefined,
                          currency: typeof val?.currency === 'string' ? val.currency : undefined,
                          amount: typeof val?.amount === 'string' ? val.amount : undefined,
                          matchStatus,
                          note: typeof val?.note === 'string' ? val.note : undefined,
                        } satisfies TcoOfferLineValue,
                      ]
                    }),
                  )
                : {},
          }))
          .filter((l) => l.label)
      : []
    const exchangeRates: Record<string, number> =
      typeof oc.exchangeRates === 'object' && oc.exchangeRates !== null
        ? Object.fromEntries(
            Object.entries(oc.exchangeRates as Record<string, unknown>)
              .map(([k, v]) => [k, Number(v)])
              .filter(([, v]) => Number.isFinite(v)),
          )
        : {}
    const assumptions: string[] = Array.isArray(oc.assumptions)
      ? oc.assumptions.filter((a): a is string => typeof a === 'string')
      : []
    if (lines.length > 0) offersComparison = { lines, exchangeRates, assumptions }
  }

  return { note, technical, offersComparison }
}
