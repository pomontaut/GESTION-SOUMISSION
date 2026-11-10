// Renders the plain-text e-mail body (see draftEmail.ts) as a styled HTML alternative matching
// INDUNI's own Outlook template (yellow-highlighted deadline, bold/red reference line, clickable
// links, signature block) - sent alongside the plain-text version (see resend.ts) so a real e-mail
// client shows the branded formatting while text-only clients still get a readable fallback.
//
// The styling is applied by recognizing the exact lines this app's own template generates (the
// deadline line, the reference line, the contact line, the signature) rather than by guessing at
// arbitrary formatting - so a fournisseur-facing acheteur's free-text edits to the body (a typo
// fix, an added sentence) still come through unstyled-but-intact instead of being silently
// dropped in favor of a version regenerated from the lot/info fields alone.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const URL_RE = /(https?:\/\/[^\s<]+)/g
const EMAIL_RE = /([\w.+-]+@[\w-]+\.[\w.-]+)/g

function linkify(escapedLine: string): string {
  return escapedLine.replace(URL_RE, '<a href="$1" style="color:#1a56db;">$1</a>').replace(
    EMAIL_RE,
    '<a href="mailto:$1" style="color:#1a56db;">$1</a>',
  )
}

function boldWord(line: string, word: string): string {
  return line.replace(new RegExp(`\\b${word}\\b`, 'g'), `<strong>${word}</strong>`)
}

export function buildEmailHtml(plainBody: string): string {
  const lines = plainBody.split('\n')
  const htmlLines: string[] = []

  for (const rawLine of lines) {
    const line = escapeHtml(rawLine)
    if (line.trim() === '') {
      htmlLines.push('<div style="height:12px;"></div>')
      continue
    }

    if (/^DATE DE REPONSE SOUHAITEE/i.test(rawLine)) {
      htmlLines.push(
        `<p style="margin:0 0 12px;"><span style="background:#ffff00;color:#c00000;font-weight:bold;text-decoration:underline;">${line}</span></p>`,
      )
      continue
    }
    if (/^MERCI DE MENTIONNER LES REFERENCES/i.test(rawLine)) {
      htmlLines.push(`<p style="margin:0 0 4px;color:#c00000;font-weight:bold;">${line}</p>`)
      continue
    }
    if (/^Contact en cas de questions/i.test(rawLine)) {
      htmlLines.push(`<p style="margin:0 0 4px;font-weight:bold;">${linkify(line)}</p>`)
      continue
    }
    if (rawLine.trim() === 'Service achats') {
      htmlLines.push(`<p style="margin:0;font-weight:bold;">${line}</p>`)
      continue
    }
    if (rawLine.trim() === 'Avenue des Grandes-Communes 6 | 1213 Petit-Lancy') {
      htmlLines.push(`<p style="margin:0;color:#666666;font-size:13px;">${line}</p>`)
      continue
    }
    if (rawLine.trim() === 'www.induni.ch') {
      htmlLines.push(
        `<p style="margin:0 0 12px;font-size:13px;"><a href="https://www.induni.ch" style="color:#1a56db;">${line}</a></p>`,
      )
      continue
    }

    htmlLines.push(`<p style="margin:0 0 4px;">${boldWord(linkify(line), 'variantes')}</p>`)
  }

  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.5;">',
    ...htmlLines,
    '</div>',
  ].join('')
}
