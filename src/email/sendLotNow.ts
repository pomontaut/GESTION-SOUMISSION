import type { Lot, Submission } from '../types'
import { extractLotPdf } from '../pdf/extractPages'
import { toBase64 } from '../pdf/base64'
import { sendLotEmail } from '../storage'
import { buildEmailHtml } from './htmlEmail'

export async function sendLotEmailNow(params: {
  submission: Submission
  lot: Lot
  bcc: string[]
  subject: string
  body: string
}): Promise<void> {
  if (params.bcc.length === 0) throw new Error('Aucun destinataire pour ce lot')
  let attachment: { filename: string; content: string } | undefined
  if (params.submission.pdfData) {
    const bytes = await extractLotPdf(params.submission.pdfData, params.lot.pages)
    const filenameBase = `${params.lot.cfcCode}-${params.lot.chapterCode}${params.lot.subChapterCode ? '-' + params.lot.subChapterCode : ''}-p${params.lot.pages[0]}`
    attachment = { filename: `${filenameBase}.pdf`, content: toBase64(bytes) }
  }
  // The HTML alternative is rendered from the same edited plain-text body the acheteur just
  // reviewed/edited (not regenerated from lot/info) - so a manual tweak to the wording is never
  // silently dropped from what a real HTML-rendering mail client actually displays.
  await sendLotEmail({
    bcc: params.bcc,
    subject: params.subject,
    text: params.body,
    html: buildEmailHtml(params.body),
    attachment,
  })
}
