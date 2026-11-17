import { loadExcelJS } from '../lib/loadExcelJS'
/** Import d'une « Grille soumission » rédigée à la main (Excel) : fournisseurs en lignes, lots en colonnes, X = consulté. */
export interface ImportedGrid {
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
  return { lotLabels, suppliers }
}
