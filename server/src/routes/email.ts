import { Router } from 'express'
import { sendResendEmail } from '../resend'

const router = Router()

router.post('/', async (req, res) => {
  const { bcc, subject, text, html, attachment } = req.body ?? {}
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
    // Chaque fournisseur reçoit son propre message (il n'y voit que lui-même, jamais les autres) ;
    // soumissions@induni.ch reçoit UN seul e-mail, identique mais avec en tête la ligne
    // « Destinataires (Cci) » (Outlook n'affiche jamais le Cci réel) : visible de soumissions seulement.
    for (const supplier of bcc as string[]) {
      await sendResendEmail({
        to: [supplier],
        bcc: [],
        subject,
        text,
        html: typeof html === 'string' ? html : undefined,
        attachment: attachmentParam,
      })
    }
    const cciLine = `Destinataires (Cci) : ${(bcc as string[]).join(', ')}`
    const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    await sendResendEmail({
      to: [from],
      bcc: [],
      subject,
      text: `${cciLine}\n\n${text}`,
      html:
        typeof html === 'string'
          ? `<p style="margin:0 0 12px;font-weight:bold;">${escapeHtml(cciLine)}</p>${html}`
          : undefined,
      attachment: attachmentParam,
    })
    res.status(204).end()
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Échec de l'envoi" })
  }
})

export default router
