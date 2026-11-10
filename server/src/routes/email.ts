import { Router } from 'express'
import { pool } from '../db'
import { sendResendEmail } from '../resend'

// Resend refuse un e-mail de plus de 40 Mo (base64 inclus, soit ~30 Mo de fichiers).
const MAX_ATTACHMENT_BYTES = 28 * 1024 * 1024

const router = Router()

router.post('/', async (req, res) => {
  const { bcc, subject, text, html, attachment, submissionId, planIds } = req.body ?? {}
  if (!Array.isArray(bcc) || bcc.length === 0 || !subject || !text) {
    res.status(400).json({ error: 'Requête incomplète (destinataires, objet ou corps manquant)' })
    return
  }
  const from = process.env.RESEND_FROM || 'soumissions@induni.ch'
  const attachmentParam =
    attachment?.content && attachment?.filename
      ? { filename: attachment.filename, contentBase64: attachment.content }
      : undefined
  // Plans de la soumission, annexés comme le PDF du lot (lus en base : pas de re-téléversement).
  const extraAttachments: Array<{ filename: string; contentBase64: string }> = []
  try {
    if (typeof submissionId === 'string' && Array.isArray(planIds) && planIds.length > 0) {
      let total = attachment?.content ? Math.ceil((attachment.content.length * 3) / 4) : 0
      for (const planId of planIds as string[]) {
        const r = await pool.query('SELECT file_name, file_data FROM offer_files WHERE id = $1 AND submission_id = $2', [planId, submissionId])
        if (!r.rows[0]) throw new Error('Un plan joint est introuvable sur le serveur : retirez-le puis ré-ajoutez-le dans l\'onglet 1.')
        total += (r.rows[0].file_data as Buffer).length
        extraAttachments.push({ filename: r.rows[0].file_name, contentBase64: (r.rows[0].file_data as Buffer).toString('base64') })
      }
      if (total > MAX_ATTACHMENT_BYTES) {
        throw new Error(`Pièces jointes trop lourdes (${(total / 1048576).toFixed(0)} Mo, maximum ~28 Mo) : retirez des plans ou utilisez le lien vers les documents.`)
      }
    }
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
        extraAttachments,
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
      extraAttachments,
    })
    res.status(204).end()
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Échec de l'envoi" })
  }
})

export default router
