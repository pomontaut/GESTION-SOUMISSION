import { pdfjsLib } from './pdfjs'

const AMOUNT_NUM = String.raw`\d{1,3}(?:[' ]?\d{3})*(?:[.,]\d{2})?`

// Prefer an explicitly HT-labelled grand total - "Somme des positions" is the pre-tax subtotal
// wording used by several real quote software (confirmed on a real HGC Commerce SA offer where it
// precedes a separate TVA line and a "Total avec TVA" TTC figure), alongside the more common
// "Total HT"/"Montant HT"/"hors TVA" phrasings.
const HT_TOTAL_RE = new RegExp(
  String.raw`(?:total\s*(?:net\s*)?ht|montant\s*(?:net\s*)?ht|somme\s*des\s*positions|somme\s*totale\s*ht|(?:total|montant)?\s*hors\s*tva)[^\d]{0,25}(${AMOUNT_NUM})`,
  'gi',
)
// Looks for a total-like keyword ("Total", "Net à payer", "Montant TTC", ...) followed within a
// short distance by a number - picks the last such match in the document, since a quote's grand
// total is almost always the final "total" line on the last page. Used only as a fallback when no
// HT-labelled total is found, and only for matches that don't also carry a TVA/TTC signal nearby
// (see below) - inserting a TTC figure as if it were HT would silently break the "always HT"
// comparison rule the app is built around, which is worse than not auto-filling at all.
const TOTAL_NEAR_AMOUNT_RE = new RegExp(
  String.raw`(?:total(?:\s*(?:ttc|ht|net))?|net\s*à\s*payer|montant\s*(?:total|net|ttc)|prix\s*total|somme\s*totale)[^\d]{0,25}(${AMOUNT_NUM})`,
  'gi',
)
const TAX_SIGNAL_RE = /tva|ttc|toutes\s*taxes/i

export async function extractAmountFromPdf(data: ArrayBuffer): Promise<string | null> {
  try {
    const doc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise
    let fullText = ''
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const textContent = await page.getTextContent()
      fullText += textContent.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n'
    }

    let htMatch: string | null = null
    for (const m of fullText.matchAll(HT_TOTAL_RE)) htMatch = m[1]
    if (htMatch) return htMatch.replace(/[\s']/g, '')

    let fallbackMatch: string | null = null
    for (const m of fullText.matchAll(TOTAL_NEAR_AMOUNT_RE)) {
      if (TAX_SIGNAL_RE.test(m[0])) continue
      fallbackMatch = m[1]
    }
    return fallbackMatch ? fallbackMatch.replace(/[\s']/g, '') : null
  } catch {
    return null
  }
}
