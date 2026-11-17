export type HighlightColor = 'jaune' | 'autre'

export interface RasterLike {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array // RGBA, 4 bytes/pixel
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const SAMPLE_STEP = 3
// Text glyphs punch black/white holes through a highlighted background, so the coverage
// threshold has to stay low - it only needs to catch that *some* of the box sits on color.
const MIN_COVERAGE = 0.12

function classifyPixel(r: number, g: number, b: number): HighlightColor | null {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 40) return null // grayscale: page background, black text, table gridlines
  if (r > 200 && g > 200 && b < 100) return 'jaune'
  return 'autre'
}

/**
 * Classifies a text line's bounding box as highlighted or not by sampling the rendered page
 * pixels underneath it - the raster equivalent of a native PDF Highlight annotation, for pages
 * with no such annotations (flattened/scanned/screenshotted submissions).
 */
export function classifyLineHighlight(image: RasterLike, box: Box): HighlightColor | null {
  const { width, height, data } = image
  const x0 = Math.max(0, Math.floor(box.x0))
  const y0 = Math.max(0, Math.floor(box.y0))
  const x1 = Math.min(width, Math.ceil(box.x1))
  const y1 = Math.min(height, Math.ceil(box.y1))
  if (x1 <= x0 || y1 <= y0) return null

  let jaune = 0
  let autre = 0
  let total = 0
  for (let y = y0; y < y1; y += SAMPLE_STEP) {
    for (let x = x0; x < x1; x += SAMPLE_STEP) {
      const idx = (y * width + x) * 4
      const cls = classifyPixel(data[idx], data[idx + 1], data[idx + 2])
      total++
      if (cls === 'jaune') jaune++
      else if (cls === 'autre') autre++
    }
  }
  if (total === 0) return null
  const jauneFrac = jaune / total
  const autreFrac = autre / total
  if (jauneFrac < MIN_COVERAGE && autreFrac < MIN_COVERAGE) return null
  return jauneFrac >= autreFrac ? 'jaune' : 'autre'
}

export interface ColorBand {
  y0: number
  y1: number
  x0: number
  x1: number
  color: HighlightColor
}

const BAND_MIN_COLOR_RATIO = 0.04 // a row counts as highlighted if >4% of its width is colored
const BAND_MAX_GAP_PX = 14 // blank rows tolerated between lines of one highlighted paragraph (at 2x scale)
const BAND_MIN_HEIGHT_PX = 6

/**
 * Finds highlighted regions in a rendered page (flattened PDFs where the highlighter was baked
 * into the page content, so there is a text layer but no native Highlight annotation). Rows with
 * enough colored pixels are grouped into vertical bands; each band is classified yellow/other by
 * its dominant color. Coordinates are in image pixels.
 */
export function detectColorBands(image: RasterLike): ColorBand[] {
  const { width, height, data } = image
  const rowCount = new Uint32Array(height)
  const rowYellow = new Uint32Array(height)
  const rowMinX = new Int32Array(height).fill(width)
  const rowMaxX = new Int32Array(height).fill(-1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4
      const cls = classifyPixel(data[i], data[i + 1], data[i + 2])
      if (!cls) continue
      rowCount[y]++
      if (cls === 'jaune') rowYellow[y]++
      if (x < rowMinX[y]) rowMinX[y] = x
      if (x > rowMaxX[y]) rowMaxX[y] = x
    }
  }
  const minCount = (width / 2) * BAND_MIN_COLOR_RATIO
  const bands: ColorBand[] = []
  let cur: { y0: number; y1: number; x0: number; x1: number; n: number; yellow: number } | null = null
  const close = () => {
    if (cur && cur.y1 - cur.y0 >= BAND_MIN_HEIGHT_PX)
      bands.push({ y0: cur.y0, y1: cur.y1, x0: cur.x0, x1: cur.x1, color: cur.yellow >= cur.n / 2 ? 'jaune' : 'autre' })
    cur = null
  }
  for (let y = 0; y < height; y++) {
    if (rowCount[y] >= minCount) {
      if (cur && y - cur.y1 > BAND_MAX_GAP_PX) close()
      if (!cur) cur = { y0: y, y1: y, x0: width, x1: 0, n: 0, yellow: 0 }
      cur.y1 = y
      cur.x0 = Math.min(cur.x0, rowMinX[y])
      cur.x1 = Math.max(cur.x1, rowMaxX[y])
      cur.n += rowCount[y]
      cur.yellow += rowYellow[y]
    }
  }
  close()
  return bands
}
