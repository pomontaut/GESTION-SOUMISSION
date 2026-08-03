import { pdfjsLib } from './pdfjs'
import type { DetectedZone, Lot, PrestationType } from '../types'
import { uid } from '../types'
import { suggestCategories } from '../data/categorize'
import { classifyLineHighlight, type HighlightColor } from './highlightRegions'
import { detectTextLineBands } from './textLineBands'
import { recognizeBand } from './ocrWorker'
import type { AnalyzeResult } from './analyze'

/**
 * Fallback detection path for submission PDFs with no extractable text and no native
 * annotations at all (flattened exports, or chapters pasted in as screenshots/scans - see the
 * "Annexe" tab). Since there is no text layer to read chapter/CFC banners from and no PDF
 * Highlight objects to read, each page is rendered to a bitmap and both text and highlighting
 * are recovered from the pixels: OCR for the text, color sampling for the highlight.
 *
 * This targets the "soumission privée" layout observed in the field: a numbered chapter header
 * ("4 ARMATURES ET ELEMENTS METALLIQUES", no dashed rule, no CAN/CFC banner) followed directly by
 * numbered article rows ("4.1 Aciers spéciaux...") - flatter than the CAN chapitre/sous-chapitre
 * hierarchy, so lots are grouped by (color, chapterCode) alone, mirroring the CAN L1 grouping.
 */

const RENDER_SCALE = 3.0
const BAND_PADDING = 4

// OCR often injects a stray noise glyph (a misread border/artifact fragment) right after the
// chapter number - \W{0,3} absorbs that without requiring the title to start exactly on it.
const CHAPTER_RE = /^(\d{1,3})\s+\W{0,3}([A-ZÀ-Þ].{2,})$/
const ARTICLE_RE = /^(\d{1,3}\.\d+)\s*(.*)$/

interface RawEntry {
  color: HighlightColor
  chapterCode: string
  chapterTitle: string
  articleCode: string
  articleTitle: string
  page: number
  text: string
}

export async function analyzeSubmissionPdfOcr(
  data: ArrayBuffer,
  onProgress?: (page: number, totalPages: number) => void,
): Promise<AnalyzeResult> {
  const doc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise

  const zones: DetectedZone[] = []
  const entries: RawEntry[] = []

  let currentChapterCode = ''
  let currentChapterTitle = ''
  let currentArticleCode = ''
  let currentArticleTitle = ''
  let currentColor: HighlightColor | null = null
  let currentTextParts: string[] = []
  let currentPage = 0

  function flush() {
    if (currentColor && currentChapterCode) {
      const id = uid()
      const text = currentTextParts.join(' ').trim()
      zones.push({
        id,
        page: currentPage,
        chapterCode: currentChapterCode,
        chapterTitle: currentChapterTitle,
        subChapterCode: currentArticleCode,
        subChapterTitle: currentArticleTitle,
        cfcCode: '',
        text,
        color: currentColor,
      })
      entries.push({
        color: currentColor,
        chapterCode: currentChapterCode,
        chapterTitle: currentChapterTitle,
        articleCode: currentArticleCode,
        articleTitle: currentArticleTitle,
        page: currentPage,
        text,
      })
    }
    currentArticleCode = ''
    currentArticleTitle = ''
    currentColor = null
    currentTextParts = []
  }

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D non disponible dans ce navigateur')
    await page.render({ canvasContext: ctx, viewport }).promise
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    const bands = detectTextLineBands(imageData)

    for (const band of bands) {
      const color = classifyLineHighlight(imageData, { x0: 0, y0: band.y0, x1: canvas.width, y1: band.y1 })

      const y0 = Math.max(0, band.y0 - BAND_PADDING)
      const y1 = Math.min(canvas.height, band.y1 + BAND_PADDING)
      const bandCanvas = document.createElement('canvas')
      bandCanvas.width = canvas.width
      bandCanvas.height = y1 - y0
      const bandCtx = bandCanvas.getContext('2d')
      if (!bandCtx) continue
      bandCtx.drawImage(canvas, 0, y0, canvas.width, y1 - y0, 0, 0, canvas.width, y1 - y0)

      const rawText = await recognizeBand(bandCanvas)
      const line = rawText.replace(/\s*\n\s*/g, ' ').trim()
      if (!line) continue

      const articleMatch = line.match(ARTICLE_RE)
      // Chapter titles are printed fully upper-case ("ARMATURES ET ELEMENTS METALLIQUES"); article
      // descriptions are sentence-case. That distinction is what actually separates a real chapter
      // header from an article whose ".N" suffix OCR dropped (eg. "4.20" misread as "420") - without
      // it, every such misread looks exactly like a new chapter header would.
      const chapterCandidate = !articleMatch ? line.match(CHAPTER_RE) : null
      const chapterMatch = chapterCandidate && !/[a-zà-ÿ]/.test(chapterCandidate[2]) ? chapterCandidate : null

      if (articleMatch) {
        flush()
        currentArticleCode = articleMatch[1]
        currentArticleTitle = articleMatch[2].trim()
        currentPage = p
        currentTextParts = currentArticleTitle ? [currentArticleTitle] : []
        currentColor = color
      } else if (chapterMatch) {
        flush()
        currentChapterCode = chapterMatch[1]
        currentChapterTitle = chapterMatch[2].trim()
        currentPage = p
        currentColor = color
      } else if (currentChapterCode) {
        currentTextParts.push(line)
        if (color && !currentColor) currentColor = color
      }
    }

    onProgress?.(p, doc.numPages)
  }
  flush()

  // ---- Build lots: group by (color, chapterCode) ----
  interface LotGroup {
    color: HighlightColor
    chapterCode: string
    chapterTitle: string
    pages: Set<number>
    zoneIds: string[]
    textSample: string
  }
  const lotGroups = new Map<string, LotGroup>()
  entries.forEach((e, idx) => {
    const zoneId = zones[idx].id
    const key = `${e.color}|${e.chapterCode}`
    const existing = lotGroups.get(key)
    if (existing) {
      existing.pages.add(e.page)
      existing.zoneIds.push(zoneId)
      if (existing.textSample.length < 800) existing.textSample += ' ' + e.text.slice(0, 200)
    } else {
      lotGroups.set(key, {
        color: e.color,
        chapterCode: e.chapterCode,
        chapterTitle: e.chapterTitle,
        pages: new Set([e.page]),
        zoneIds: [zoneId],
        textSample: e.text.slice(0, 200),
      })
    }
  })

  const lots: Lot[] = Array.from(lotGroups.values()).map((g): Lot => {
    const title = `${g.chapterCode} ${g.chapterTitle}`.trim()
    const categories = suggestCategories(`${title} ${g.textSample}`)
    return {
      id: uid(),
      title,
      cfcCode: '',
      chapterCode: g.chapterCode,
      chapterTitle: g.chapterTitle,
      subChapterCode: '',
      subChapterTitle: '',
      prestationType: (g.color === 'jaune' ? 'fourniture' : 'fourniture_pose') as PrestationType,
      pages: Array.from(g.pages).sort((a, b) => a - b),
      positionCount: g.zoneIds.length,
      zoneIds: g.zoneIds,
      validated: false,
      categories,
      suppliers: [],
      followUp: [],
    }
  })
  lots.sort((a, b) => a.pages[0] - b.pages[0])

  return { zones, lots, numPages: doc.numPages }
}
