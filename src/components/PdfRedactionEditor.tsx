import { useEffect, useRef, useState } from 'react'
import type { Lot, PdfRedaction } from '../types'
import { pdfjsLib } from '../pdf/pdfjs'

const DISPLAY_SCALE = 1.3

interface PageView {
  page: number
  width: number
  height: number
  /** viewport → PDF points, and back */
  toPdf: (x: number, y: number) => [number, number]
  toView: (x: number, y: number) => [number, number]
}

/** Draw rectangles over the zones to erase from the PDF that gets sent (e.g. a title). */
export default function PdfRedactionEditor({
  lot,
  pdfData,
  onSave,
  onClose,
}: {
  lot: Lot
  pdfData: ArrayBuffer
  onSave: (redactions: PdfRedaction[]) => void
  onClose: () => void
}) {
  const [views, setViews] = useState<PageView[]>([])
  const [reds, setReds] = useState<PdfRedaction[]>(lot.redactions ?? [])
  const [error, setError] = useState<string | null>(null)
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const [drag, setDrag] = useState<{ page: number; x0: number; y0: number; x1: number; y1: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const doc = await pdfjsLib.getDocument({ data: pdfData.slice(0) }).promise
        const next: PageView[] = []
        for (const p of lot.pages) {
          if (p < 1 || p > doc.numPages) continue
          const page = await doc.getPage(p)
          const viewport = page.getViewport({ scale: DISPLAY_SCALE })
          next.push({
            page: p,
            width: viewport.width,
            height: viewport.height,
            toPdf: (x, y) => viewport.convertToPdfPoint(x, y) as [number, number],
            toView: (x, y) => viewport.convertToViewportPoint(x, y) as [number, number],
          })
          if (cancelled) return
          setViews([...next])
          // wait for the canvas of this page to mount before painting it
          await new Promise((r) => requestAnimationFrame(() => r(null)))
          const canvas = canvasRefs.current.get(p)
          const ctx = canvas?.getContext('2d')
          if (canvas && ctx) {
            canvas.width = Math.ceil(viewport.width)
            canvas.height = Math.ceil(viewport.height)
            await page.render({ canvasContext: ctx, viewport }).promise
          }
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) setError('Impossible d\'afficher les pages du lot.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [lot.pages, pdfData])

  function pointerPos(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top] as const
  }

  function commit(v: PageView) {
    if (!drag || drag.page !== v.page) return
    const w = Math.abs(drag.x1 - drag.x0)
    const h = Math.abs(drag.y1 - drag.y0)
    setDrag(null)
    if (w < 4 || h < 4) return // a click, not a zone
    const [ax, ay] = v.toPdf(drag.x0, drag.y0)
    const [bx, by] = v.toPdf(drag.x1, drag.y1)
    setReds((prev) => [
      ...prev,
      { page: v.page, x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) },
    ])
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-4xl h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-slate-800 truncate">✂ Supprimer des zones du PDF — {lot.title}</h3>
            <p className="text-xs text-slate-500">
              Tracez un rectangle (clic maintenu) sur ce qu'il faut effacer, par ex. un titre. Les zones en rouge
              seront retirées du PDF envoyé aux fournisseurs ; les pages concernées sont envoyées en image.
            </p>
          </div>
          <span className="text-xs text-slate-500">{reds.length} zone(s)</span>
          <button className="btn-secondary" disabled={reds.length === 0} onClick={() => setReds([])}>
            Tout annuler
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary" onClick={() => onSave(reds)}>
            ✅ Appliquer
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-200 p-4 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {views.length === 0 && !error && <p className="text-sm text-slate-500">Chargement des pages…</p>}
          {views.map((v) => (
            <div key={v.page} className="mx-auto" style={{ width: v.width }}>
              <div className="text-xs text-slate-500 mb-1">Page {v.page}</div>
              <div
                className="relative shadow bg-white select-none touch-none cursor-crosshair"
                style={{ width: v.width, height: v.height }}
                data-redaction-page={v.page}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  const [x, y] = pointerPos(e)
                  setDrag({ page: v.page, x0: x, y0: y, x1: x, y1: y })
                }}
                onPointerMove={(e) => {
                  if (!drag || drag.page !== v.page) return
                  const [x, y] = pointerPos(e)
                  setDrag({ ...drag, x1: x, y1: y })
                }}
                onPointerUp={() => commit(v)}
              >
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(v.page, el)
                    else canvasRefs.current.delete(v.page)
                  }}
                  style={{ width: v.width, height: v.height }}
                />
                {reds.map((r, idx) => {
                  if (r.page !== v.page) return null
                  const [ax, ay] = v.toView(r.x0, r.y0)
                  const [bx, by] = v.toView(r.x1, r.y1)
                  return (
                    <div
                      key={idx}
                      className="absolute border-2 border-red-600 bg-red-500/40"
                      style={{ left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) }}
                    >
                      <button
                        title="Retirer cette zone"
                        className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-red-600 text-white text-xs leading-none"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          setReds((prev) => prev.filter((_, i) => i !== idx))
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
                {drag && drag.page === v.page && (
                  <div
                    className="absolute border-2 border-dashed border-red-600 bg-red-300/30 pointer-events-none"
                    style={{
                      left: Math.min(drag.x0, drag.x1),
                      top: Math.min(drag.y0, drag.y1),
                      width: Math.abs(drag.x1 - drag.x0),
                      height: Math.abs(drag.y1 - drag.y0),
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
