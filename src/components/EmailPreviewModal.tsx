import { useEffect, useState } from 'react'
import type { Lot, Submission } from '../types'
import { extractLotPdf } from '../pdf/extractPages'
import { sendLotEmailNow } from '../email/sendLotNow'

export default function EmailPreviewModal({
  lot,
  submission,
  bcc,
  onClose,
  onSent,
}: {
  lot: Lot
  submission: Submission
  bcc: string[]
  onClose: () => void
  onSent: (subject: string, body: string) => void
}) {
  const [subject, setSubject] = useState(lot.emailSubject ?? '')
  const [body, setBody] = useState(lot.emailBody ?? '')
  // Editable as free text (not just the read-only bcc prop) - lets you add a second address for
  // a fournisseur that has several, or fix a typo, without leaving this modal.
  const [bccText, setBccText] = useState(bcc.join(', '))
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const bccList = bccText
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  useEffect(() => {
    if (!submission.pdfData) return
    let objectUrl: string | null = null
    extractLotPdf(submission.pdfData, lot.pages)
      .then((bytes) => {
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
        objectUrl = URL.createObjectURL(blob)
        setPdfUrl(objectUrl)
      })
      .catch(() => setPdfError('Impossible de générer la pièce jointe.'))
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [lot, submission.pdfData])

  async function handleSend() {
    setSending(true)
    setSendError(null)
    try {
      await sendLotEmailNow({ submission, lot, bcc: bccList, subject, body })
      onSent(subject, body)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Échec de l'envoi")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-medium text-slate-800 truncate">Prévisualiser l'e-mail — {lot.title}</h3>
          <button className="btn-secondary" onClick={onClose}>
            ✕ Fermer
          </button>
        </div>
        <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
          <div className="md:w-1/2 p-4 overflow-y-auto space-y-3 border-b md:border-b-0 md:border-r border-slate-200">
            <div>
              <label className="label">Destinataires (Cci)</label>
              <textarea
                className="input h-16 text-sm"
                placeholder="adresse@exemple.ch, autre@exemple.ch"
                value={bccText}
                onChange={(e) => setBccText(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-0.5">Séparez plusieurs adresses par une virgule.</p>
            </div>
            <div>
              <label className="label">Objet</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="label">Corps du message</label>
              <textarea
                className="input h-64 font-mono text-xs"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            {sendError && <p className="text-sm text-red-600">⚠ {sendError}</p>}
            <button className="btn-primary w-full" disabled={sending || bccList.length === 0} onClick={handleSend}>
              🚀 {sending ? 'Envoi...' : 'Envoyer'}
            </button>
          </div>
          <div className="md:w-1/2 bg-slate-100 min-h-[300px]">
            {pdfError && <p className="p-4 text-sm text-red-600">{pdfError}</p>}
            {pdfUrl && <iframe title="Pièce jointe" src={pdfUrl} className="w-full h-full border-0" />}
            {!pdfUrl && !pdfError && <p className="p-4 text-sm text-slate-500">Génération de la pièce jointe…</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
