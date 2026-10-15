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
