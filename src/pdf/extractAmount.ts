import { pdfjsLib } from './pdfjs'

const AMOUNT_NUM = String.raw`\d{1,3}(?:[' ]?\d{3})*(?:[.,]\d{2})?`
// Looks for a total-like keyword ("Total", "Net à payer", "Montant TTC", ...) followed
// within a short distance by a number - picks the last such match in the document, since
// a quote's grand total is almost always the final "total" line on the last page.
const TOTAL_NEAR_AMOUNT_RE = new RegExp(
  String.raw`(?:total(?:\s*(?:ttc|ht|net))?|net\s*à\s*payer|montant\s*(?:total|net|ttc)|prix\s*total|somme\s*totale)[^\d]{0,25}(${AMOUNT_NUM})`,
  'gi',
)

export async function extractAmountFromPdf(data: ArrayBuffer): Promise<string | null> {
  try {
    const doc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise
    let fullText = ''
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const textContent = await page.getTextContent()
      fullText += textContent.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n'
    }
    let lastMatch: string | null = null
    for (const m of fullText.matchAll(TOTAL_NEAR_AMOUNT_RE)) {
      lastMatch = m[1]
    }
    return lastMatch ? lastMatch.replace(/[\s']/g, '') : null
  } catch {
    return null
  }
}
