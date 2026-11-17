import { loadExcelJS } from '../lib/loadExcelJS'
/** Import d'une « Grille soumission » rédigée à la main (Excel) : fournisseurs en lignes, lots en colonnes, X = consulté. */
export interface ImportedGrid {
  /** 'pages' = colonnes de la grille = n° de pages du PDF, lots déduits des groupes de fournisseurs ; sinon colonnes = lots */
  mode?: 'lots' | 'pages'
  /** mode 'pages' : pages du PDF de chaque lot (même ordre que lotLabels) */
  lotPages?: number[][]
  lotLabels: string[]
  suppliers: { name: string; lots: boolean[] }[]
}

const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
const isX = (v: unknown) => /^(x|✓|✔|oui)$/i.test(norm(v))

function cellText(v: unknown): string {
  if (v && typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown }
    if (o.richText) return o.richText.map((r) => r.text).join('')
    if (o.text !== undefined) return String(o.text)
    if (o.result !== undefined) return String(o.result)
  }
  return norm(v)
}

export async function parseGridFile(file: File): Promise<ImportedGrid> {
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Le classeur est vide.')
  const maxCol = ws.columnCount
  const rows: string[][] = []
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const cells: string[] = []
    for (let c = 1; c <= maxCol; c++) cells[c] = norm(cellText(row.getCell(c).value))
    rows[r] = cells
  })

  // Lignes fournisseur = au moins un « X » au-delà de la colonne B ; l'en-tête = dernière ligne non vide au-dessus.
  const isSupplierRow = (r: string[] | undefined) => !!r && r.slice(3).some(isX) && !!r[2]
  const firstSupplier = rows.findIndex(isSupplierRow)
  if (firstSupplier < 0) throw new Error('Aucune ligne fournisseur avec un « X » trouvée dans la grille.')
  let headRow = -1
  for (let r = firstSupplier - 1; r >= 1; r--) {
    const cells = rows[r]
    if (cells && cells.slice(3).filter(Boolean).length >= 1 && !cells.slice(3).some(isX)) {
      headRow = r
      break
    }
  }
  if (headRow < 0) throw new Error('Ligne d\'en-tête (numéros de lot) introuvable au-dessus des fournisseurs.')

  const cols: number[] = []
  const lotLabels: string[] = []
  for (let c = 3; c <= maxCol; c++) {
    const label = rows[headRow][c]
    if (!label || /^plans?$/i.test(label)) continue
    cols.push(c)
    lotLabels.push(label)
  }
  const suppliers: ImportedGrid['suppliers'] = []
  for (let r = headRow + 1; r < rows.length; r++) {
    const cells = rows[r]
    if (!cells || !cells[2]) continue
    const lots = cols.map((c) => isX(cells[c]))
    if (!lots.some(Boolean)) continue
    suppliers.push({ name: cells[2], lots })
  }
  if (!lotLabels.length || !suppliers.length) throw new Error('Grille illisible : aucun lot ou fournisseur détecté.')
  const pageSets = lotLabels.map(parsePageLabel)
  if (looksLikePageHeader(lotLabels, pageSets, norm(rows[headRow][2]))) {
    return groupByPages(pageSets as number[][], lotLabels, suppliers)
  }
  return { lotLabels, suppliers }
}

/** « 29à30 », « 29 à 30 », « 29-30 », « 14 » -> pages ; null si le libellé n'est pas un n° de page. */
export function parsePageLabel(label: string): number[] | null {
  const m = norm(label).match(/^(\d{1,4})(?:\s*(?:à|a|-|–|—)\s*(\d{1,4}))?$/i)
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : a
  if (b < a || b - a > 200) return null
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}

/**
 * En-tête = n° de PAGES (grille d'acheteur : une colonne par page surlignée) et non n° de lot.
 * Pas de confusion avec une grille de lots numérotés 1..n (export de l'outil) : il faut que tous les
 * libellés soient des pages ET (une plage « 29à30 », ou un en-tête de ligne « pages », ou une suite
 * qui n'est pas 1,2,3… consécutive).
 */
function looksLikePageHeader(labels: string[], sets: (number[] | null)[], rowTitle: string): boolean {
  if (labels.length < 2 || sets.some((s) => !s)) return false
  if (/page/i.test(rowTitle)) return true
  if (labels.some((l) => /[^\d\s]/.test(l))) return true
  const firsts = (sets as number[][]).map((s) => s[0])
  return !firsts.every((p, i) => p === i + 1)
}

/**
 * Colonnes = pages, lignes = fournisseurs. Un LOT = un groupe de fournisseurs consultés sur exactement
 * les mêmes pages (ils reçoivent la même demande) ; ses pages = les colonnes cochées. Ordre = première
 * apparition dans la grille (lot 1 = premier fournisseur).
 */
function groupByPages(pageSets: number[][], labels: string[], suppliers: ImportedGrid['suppliers']): ImportedGrid {
  const groups = new Map<string, { pages: number[]; names: string[] }>()
  for (const s of suppliers) {
    const pages = Array.from(new Set(s.lots.flatMap((on, i) => (on ? pageSets[i] : [])))).sort((a, b) => a - b)
    const key = pages.join(',')
    const g = groups.get(key) ?? { pages, names: [] }
    g.names.push(s.name)
    groups.set(key, g)
  }
  const list = [...groups.values()]
  const lotPages = list.map((g) => g.pages)
  const lotLabels = list.map((_, i) => `Lot ${i + 1}`)
  const sup = new Map<string, boolean[]>()
  list.forEach((g, i) => g.names.forEach((n) => sup.set(n, lotLabels.map((_, j) => j === i))))
  void labels
  return {
    mode: 'pages',
    lotLabels,
    lotPages,
    suppliers: suppliers.map((s) => ({ name: s.name, lots: sup.get(s.name) ?? lotLabels.map(() => false) })),
  }
}
