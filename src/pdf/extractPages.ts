import { PDFDocument } from 'pdf-lib'
import type { PdfRedaction } from '../types'
import { pdfjsLib } from './pdfjs'

const REDACT_RENDER_SCALE = 2
const REDACT_JPEG_QUALITY = 0.9

/**
 * Builds the PDF of a lot from the source document. Pages carrying redactions are really
 * redacted, not just covered: the page is rendered to an image with the zone painted out and
 * that image replaces the page, so the erased text can't be copied out from under a white box.
 * (Only those pages lose their selectable text; untouched pages are copied as-is.)
 */
export async function extractLotPdf(
  sourceData: ArrayBuffer,
  pages: number[],
  redactions: PdfRedaction[] = [],
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourceData.slice(0))
  const outDoc = await PDFDocument.create()
  const indices = pages.map((p) => p - 1).filter((i) => i >= 0 && i < srcDoc.getPageCount())
  const redactedPages = new Set(redactions.map((r) => r.page))
  const needsRender = indices.some((i) => redactedPages.has(i + 1))
  const pdfjsDoc = needsRender ? await pdfjsLib.getDocument({ data: sourceData.slice(0) }).promise : null

  for (const i of indices) {
    const zones = redactions.filter((r) => r.page === i + 1)
    if (zones.length === 0 || !pdfjsDoc) {
      const [copied] = await outDoc.copyPages(srcDoc, [i])
      outDoc.addPage(copied)
      continue
    }
    const page = await pdfjsDoc.getPage(i + 1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: REDACT_RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D non disponible dans ce navigateur')
    await page.render({ canvasContext: ctx, viewport }).promise
    ctx.fillStyle = '#ffffff'
    for (const z of zones) {
      const [ax, ay] = viewport.convertToViewportPoint(z.x0, z.y0)
      const [bx, by] = viewport.convertToViewportPoint(z.x1, z.y1)
      ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))
    }
    const jpeg = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Rendu de la page impossible'))), 'image/jpeg', REDACT_JPEG_QUALITY),
    )
    const image = await outDoc.embedJpg(await jpeg.arrayBuffer())
    const out = outDoc.addPage([base.width, base.height])
    out.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height })
  }
  return outDoc.save()
}
