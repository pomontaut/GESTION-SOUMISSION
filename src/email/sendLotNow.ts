import type { Lot, Submission } from '../types'
import { extractLotPdf } from '../pdf/extractPages'
import { toBase64 } from '../pdf/base64'
import { sendLotEmail } from '../storage'

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
  await sendLotEmail({ bcc: params.bcc, subject: params.subject, text: params.body, attachment })
}
