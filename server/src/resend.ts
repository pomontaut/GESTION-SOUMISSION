export async function sendResendEmail(params: {
  to: string[]
  bcc: string[]
  subject: string
  text: string
  attachment?: { filename: string; contentBase64: string }
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error("RESEND_API_KEY n'est pas configurée sur le serveur")
  }
  const from = process.env.RESEND_FROM || 'soumissions@induni.ch'

  const payload: Record<string, unknown> = {
    from,
    to: params.to,
    bcc: params.bcc,
    subject: params.subject,
    text: params.text,
  }
  if (params.attachment) {
    payload.attachments = [
      { filename: params.attachment.filename, content: params.attachment.contentBase64 },
    ]
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Échec de l'envoi (${res.status}) : ${body}`)
  }
}
