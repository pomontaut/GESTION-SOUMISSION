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
    // soumissions@induni.ch reçoit UN seul e-mail, identique, dont l'en-tête « Cci » liste les
    // fournisseurs (rien n'est ajouté dans le corps) : en cas de contact absent, on renvoie
    // l'e-mail tel quel sans rien supprimer dans le texte.
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
    const copy = {
      to: [from],
      bcc: [] as string[],
      subject,
      text,
      html: typeof html === 'string' ? html : undefined,
      attachment: attachmentParam,
    }
    try {
      await sendResendEmail({ ...copy, headers: { Bcc: (bcc as string[]).join(', ') } })
    } catch {
      // En-tête Cci refusé par le prestataire : la copie interne part quand même, sans lui.
      await sendResendEmail(copy)
    }
    res.status(204).end()
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Échec de l'envoi" })
  }
})

export default router
