import { PDFDocument } from 'pdf-lib'

export async function extractLotPdf(sourceData: ArrayBuffer, pages: number[]): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(sourceData.slice(0))
  const outDoc = await PDFDocument.create()
  const indices = pages.map((p) => p - 1).filter((i) => i >= 0 && i < srcDoc.getPageCount())
  const copied = await outDoc.copyPages(srcDoc, indices)
  copied.forEach((page) => outDoc.addPage(page))
  return outDoc.save()
}
