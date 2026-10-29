import { useEffect, useState } from 'react'
import type { Lot, PdfRedaction } from '../types'
import { extractLotPdf } from '../pdf/extractPages'
import PdfRedactionEditor from './PdfRedactionEditor'

export default function PdfPreviewModal({
  lot,
  pdfData,
  onClose,
  onRedactionsChange,
}: {
  lot: Lot
  pdfData: ArrayBuffer
  onClose: () => void
  /** When provided, the preview offers to erase zones (e.g. a title) from the PDF that gets sent. */
  onRedactionsChange?: (redactions: PdfRedaction[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    extractLotPdf(pdfData, lot.pages, lot.redactions)
      .then((bytes) => {
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((err) => {
        console.error(err)
        setError('Impossible de générer la prévisualisation.')
      })
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [lot.pages, lot.redactions, pdfData])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-[1400px] h-[94vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-medium text-slate-800 truncate">
            CFC {lot.cfcCode} — {lot.title} · pages {lot.pages.join(', ')}
          </h3>
          <div className="flex gap-2">
            {onRedactionsChange && (
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                ✂ Supprimer une zone{lot.redactions?.length ? ` (${lot.redactions.length})` : ''}
              </button>
            )}
            <button className="btn-secondary" onClick={onClose}>
              ✕ Fermer
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100">
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {url && <iframe title="Prévisualisation du lot" src={url} className="w-full h-full border-0" />}
          {!url && !error && <p className="p-4 text-sm text-slate-500">Génération de la prévisualisation…</p>}
        </div>
      </div>
      {editing && onRedactionsChange && (
        <PdfRedactionEditor
          lot={lot}
          pdfData={pdfData}
          onClose={() => setEditing(false)}
          onSave={(reds) => {
            onRedactionsChange(reds)
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}
