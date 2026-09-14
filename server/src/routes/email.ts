import { Router } from 'express'
import { sendResendEmail } from '../resend'

const router = Router()

router.post('/', async (req, res) => {
  const { bcc, subject, text, attachment } = req.body ?? {}
  if (!Array.isArray(bcc) || bcc.length === 0 || !subject || !text) {
    res.status(400).json({ error: 'Requête incomplète (destinataires, objet ou corps manquant)' })
    return
  }
  const from = process.env.RESEND_FROM || 'soumissions@induni.ch'
  const attachmentParam =
    attachment?.content && attachment?.filename
      ? { filename: attachment.filename, contentBase64: attachment.content }
      : undefined
  try {
    // Bcc addresses are stripped from the delivered message for every recipient, including the
    // "to" one - that's the point of Bcc, but it also means the copy landing in soumissions@induni.ch
    // never shows who the request actually went to. A separate internal-only e-mail (no bcc, so it
    // reaches nobody else) spells out the recipient list in its own body instead.
    await sendResendEmail({
      to: [from],
      bcc: [],
      subject,
      text: `Destinataires (Cci) : ${bcc.join(', ')}\n\n${text}`,
      attachment: attachmentParam,
    })
    await sendResendEmail({
      to: [from],
      bcc,
      subject,
      text,
      attachment: attachmentParam,
    })
    res.status(204).end()
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Échec de l'envoi" })
  }
})

export default router
