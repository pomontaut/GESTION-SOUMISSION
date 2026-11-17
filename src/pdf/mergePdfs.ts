import { PDFDocument } from 'pdf-lib'
import type { DetectedZone, Lot } from '../types'

/** Concatène plusieurs PDF (dans l'ordre) en un seul ; renvoie aussi le nombre de pages de chacun. */
export async function concatPdfs(buffers: ArrayBuffer[]): Promise<{ data: ArrayBuffer; pageCounts: number[] }> {
  const out = await PDFDocument.create()
  const pageCounts: number[] = []
  for (const b of buffers) {
    const src = await PDFDocument.load(b.slice(0), { ignoreEncryption: true })
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
    pageCounts.push(pages.length)
  }
  const bytes = await out.save()
  return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, pageCounts }
}

export const shiftZones = (zones: DetectedZone[], offset: number): DetectedZone[] =>
  zones.map((z) => ({ ...z, page: z.page + offset }))

export const shiftLot = (lot: Lot, offset: number): Lot => ({ ...lot, pages: lot.pages.map((p) => p + offset) })

const normTitle = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Même lot dans deux soumissions (même CFC, même sous-chapitre, même intitulé) = un seul lot. */
export const lotKey = (l: Lot) => `${l.cfcCode}|${l.subChapterCode || l.chapterCode}|${normTitle(l.title)}`

/** Fusionne dans `base` les lots de `extra` ; ceux qui existent déjà (même clé) sont regroupés, les autres ajoutés. */
export function mergeLotLists(base: Lot[], extra: Lot[]): Lot[] {
  const out = base.map((l) => ({ ...l }))
  for (const e of extra) {
    const hit = out.find((l) => lotKey(l) === lotKey(e) && l.prestationType === e.prestationType)
    if (!hit) {
      out.push(e)
      continue
    }
    hit.pages = Array.from(new Set([...hit.pages, ...e.pages])).sort((a, b) => a - b)
    hit.zoneIds = [...hit.zoneIds, ...e.zoneIds]
    hit.positionCount += e.positionCount
  }
  return out
}
