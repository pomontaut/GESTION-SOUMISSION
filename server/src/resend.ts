interface EmailAttachment {
  filename: string
  content: string // base64
  contentType: string
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Sends through Resend's HTTPS API rather than SMTP - Railway (like many hosts) blocks outbound
 * SMTP ports, which makes SMTP delivery hang until it times out. The API runs over plain HTTPS.
 *
 * Resend requires a non-empty `to`; a Cci-only request (every real recipient in `bcc`, so
 * suppliers never see each other) sends a copy to the sender address as `to` instead of leaving
 * it empty.
 */
export async function sendEmail(opts: {
  bcc: string[]
  subject: string
  text: string
  attachments?: EmailAttachment[]
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error("RESEND_API_KEY n'est pas configuré")
  const from = process.env.RESEND_FROM || 'commande@induni.ch'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [from],
      bcc: opts.bcc,
      subject: opts.subject,
      text: opts.text,
      html: opts.text.split('\n').map(escapeHtml).join('<br>'),
      attachments: opts.attachments,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error: ${res.status} ${body}`)
  }
}
