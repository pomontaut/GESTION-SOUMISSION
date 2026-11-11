import { useEffect, useState } from 'react'
import type { Lot, PdfRedaction } from '../types'
import { PDFDocument } from 'pdf-lib'
import { extractLotPdf } from '../pdf/extractPages'
import PdfRedactionEditor from './PdfRedactionEditor'

export default function PdfPreviewModal({
  lot,
  pdfData,
  onClose,
  onRedactionsChange,
  onPagesChange,
}: {
  lot: Lot
  pdfData: ArrayBuffer
  onClose: () => void
  /** When provided, the preview offers to erase zones (e.g. a title) from the PDF that gets sent. */
  onRedactionsChange?: (redactions: PdfRedaction[]) => void
  /** When provided, the preview offers to add/remove source pages of the lot by hand. */
  onPagesChange?: (pages: number[]) => void
}) {
  const [pageInput, setPageInput] = useState('')
  const [pageError, setPageError] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState<number | null>(null)
  useEffect(() => {
    PDFDocument.load(pdfData.slice(0))
      .then((d) => setTotalPages(d.getPageCount()))
      .catch(() => setTotalPages(null))
  }, [pdfData])

  function addPages() {
    if (!onPagesChange) return
    const added = new Set<number>()
    for (const part of pageInput.split(/[,;\s]+/).filter(Boolean)) {
      const m = part.match(/^(\d+)(?:\s*[-–àa]\s*(\d+))?$/)
      if (!m) {
        setPageError(`« ${part} » n'est pas un numéro de page (ex. 12, 14-16)`)
        return
      }
      const a = Number(m[1])
      const b = m[2] ? Number(m[2]) : a
      for (let n = Math.min(a, b); n <= Math.max(a, b); n++) added.add(n)
    }
    if (added.size === 0) return
    const bad = [...added].filter((n) => n < 1 || (totalPages !== null && n > totalPages))
    if (bad.length) {
      setPageError(`Page(s) hors du PDF (1${totalPages ? `–${totalPages}` : ''}) : ${bad.join(', ')}`)
      return
    }
    setPageError(null)
    setPageInput('')
    onPagesChange(Array.from(new Set([...lot.pages, ...added])).sort((a, b) => a - b))
  }

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
        {onPagesChange && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-200 text-sm">
            <span className="text-slate-600">Pages du lot :</span>
            {lot.pages.map((n) => (
              <span key={n} className="inline-flex items-center gap-1 bg-slate-100 rounded px-2 py-0.5">
                {n}
                {lot.pages.length > 1 && (
                  <button
                    title={`Retirer la page ${n}`}
                    className="text-slate-400 hover:text-red-600"
                    onClick={() => onPagesChange(lot.pages.filter((x) => x !== n))}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
            <input
              className="input w-40 ml-2"
              placeholder="Ajouter : 12, 14-16"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPages()}
            />
            <button className="btn-secondary" onClick={addPages}>
              ＋ Ajouter des pages
            </button>
            {totalPages && <span className="text-slate-400">(PDF : {totalPages} pages)</span>}
            {pageError && <span className="text-red-600">{pageError}</span>}
          </div>
        )}
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
