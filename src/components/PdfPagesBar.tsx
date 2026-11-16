import { useEffect, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import type { Lot } from '../types'

/** Barre « Pages du lot » : ajout (12, 14-16) / retrait manuel de pages du PDF d'origine. */
export default function PdfPagesBar({
  lot,
  pdfData,
  onPagesChange,
  compact = false,
}: {
  lot: Lot
  pdfData: ArrayBuffer
  onPagesChange: (pages: number[]) => void
  compact?: boolean
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

  return (

          <div className={`flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white text-sm ${compact ? 'px-3 py-2' : 'px-4 py-2'}`}>
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
        
  )
}
