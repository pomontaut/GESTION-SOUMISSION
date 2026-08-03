import type { RasterLike } from './highlightRegions'

export interface LineBand {
  y0: number
  y1: number
}

const INK_LUMA_THRESHOLD = 400 // r+g+b sum below this counts as "dark ink" (excludes yellow highlight & white bg)
const MIN_INK_PIXELS_PER_ROW = 15 // ignores thin vertical table gridlines crossing every row
const MAX_GAP_PX = 10 // rows of blank space allowed within a single paragraph/line band
const GRIDLINE_COLUMN_RATIO = 0.5 // a column dark in more than this fraction of rows is a ruling line, not text

/**
 * Segments a rendered page image into horizontal text-line bands using a row ink-density
 * projection - the pixel equivalent of grouping text by y-coordinate when no PDF text layer
 * exists (scanned/flattened/screenshotted submissions with no extractable text).
 */
export function detectTextLineBands(image: RasterLike): LineBand[] {
  const { data, width, height } = image
  const isDark = (x: number, y: number): boolean => {
    const idx = (y * width + x) * 4
    return data[idx] + data[idx + 1] + data[idx + 2] < INK_LUMA_THRESHOLD
  }

  // Vertical table borders are dark on nearly every row - unlike text, which is only dark within
  // its own line height. Mask those columns out first so a table's borders don't look like an
  // unbroken wall of "ink" spanning the whole page and swallowing every row into one band.
  const columnDarkCount = new Uint32Array(width)
  for (let x = 0; x < width; x++) {
    let count = 0
    for (let y = 0; y < height; y++) if (isDark(x, y)) count++
    columnDarkCount[x] = count
  }
  const isGridlineColumn = new Uint8Array(width)
  const gridlineThreshold = height * GRIDLINE_COLUMN_RATIO
  for (let x = 0; x < width; x++) {
    isGridlineColumn[x] = columnDarkCount[x] > gridlineThreshold ? 1 : 0
  }

  const rowInk = new Uint32Array(height)
  for (let y = 0; y < height; y++) {
    let count = 0
    for (let x = 0; x < width; x++) {
      if (isGridlineColumn[x]) continue
      if (isDark(x, y)) count++
    }
    rowInk[y] = count
  }

  const bands: LineBand[] = []
  let start: number | null = null
  let gap = 0
  for (let y = 0; y < height; y++) {
    const hasInk = rowInk[y] > MIN_INK_PIXELS_PER_ROW
    if (hasInk) {
      if (start === null) start = y
      gap = 0
    } else if (start !== null) {
      gap++
      if (gap > MAX_GAP_PX) {
        bands.push({ y0: start, y1: y - gap })
        start = null
        gap = 0
      }
    }
  }
  if (start !== null) bands.push({ y0: start, y1: height - gap })

  return bands
}
