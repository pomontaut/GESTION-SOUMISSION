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
  try {
    await sendResendEmail({
      to: [from],
      bcc,
      subject,
      text,
      attachment:
        attachment?.content && attachment?.filename
          ? { filename: attachment.filename, contentBase64: attachment.content }
          : undefined,
    })
    res.status(204).end()
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Échec de l'envoi" })
  }
})

export default router
