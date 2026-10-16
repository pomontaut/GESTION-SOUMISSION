import type { Submission } from '../types'

const GREY = 'FFA6A6A6' // gris du modèle (blanc, assombri de 35 %)
const YELLOW = 'FFFFFF00'
const thin = { style: 'thin' as const }
const medium = { style: 'medium' as const }

type LotT = Submission['lots'][number]

/** Fournisseurs sollicités sur un lot : ceux dont l'e-mail est marqué envoyé, plus tous ceux
 *  cochés « Envoi » (un envoi fait hors de l'outil n'est pas marqué « envoyé » mais compte). */
function contacted(l: LotT): { name: string; sent: boolean }[] {
  const out: { name: string; sent: boolean }[] = []
  for (const f of l.followUp) if (f.status === 'envoye') out.push({ name: f.name, sent: true })
  for (const s of l.suppliers) {
    if (s.status === 'ignore') continue
    if (!out.some((o) => o.name.trim().toLowerCase() === s.name.trim().toLowerCase())) {
      out.push({ name: s.name, sent: false })
    }
  }
  return out
}

/** Lots à afficher en colonnes : ceux qui ont au moins un fournisseur sollicité. */
function gridLots(submission: Submission) {
  return submission.lots.filter((l) => contacted(l).length > 0)
}

export function hasGridData(submission: Submission): boolean {
  return gridLots(submission).length > 0
}

/** [53, 54, 60] -> "53-54, 60" */
function fmtPages(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    out.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]))
    i = j + 1
  }
  return out.join(', ')
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('fr-CH') : '')

/** Génère la « Grille soumission » : fournisseurs en lignes, lots en colonnes, X = fournisseur consulté. */
export async function exportTrackingGrid(submission: Submission): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const lots = gridLots(submission)
  const info = submission.info

  // Fournisseurs sollicités, dans l'ordre de première apparition. Une même société rattachée à
  // plusieurs catégories (plusieurs supplierId) n'occupe qu'une ligne.
  const norm = (n: string) => n.trim().toLowerCase()
  const suppliers: { name: string; lotIds: Set<string>; sent: boolean }[] = []
  for (const lot of lots) {
    for (const c of contacted(lot)) {
      let row = suppliers.find((r) => norm(r.name) === norm(c.name))
      if (!row) suppliers.push((row = { name: c.name, lotIds: new Set(), sent: true }))
      row.lotIds.add(lot.id)
      if (!c.sent) row.sent = false
    }
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Feuil1', {
    views: [{ zoomScale: 85 }],
    pageSetup: { orientation: 'landscape', horizontalCentered: true, verticalCentered: true },
  })
  const lastCol = 2 + lots.length + 1 // A, B, lots, Plans
  ws.getColumn(1).width = 5.9
  ws.getColumn(2).width = 65.9
  for (let c = 3; c <= lastCol; c++) ws.getColumn(c).width = 8.5

  const sentDates = lots.flatMap((l) => l.followUp.map((f) => f.sentDate).filter(Boolean) as string[]).sort()
  const header: [string, string][] = [
    ['ACHETEUR', ''],
    ['NOM DU PROJET', [info.projectName, info.siteLocation, info.siteNumber].filter(Boolean).join(' - ')],
    ['DATE DE LA DEMANDE', fmtDate(sentDates[0])],
    ['DATE DE RETOUR', fmtDate(info.deadline)],
    ['NOM DU CALCULATEUR', info.calculatorName.toUpperCase()],
    ['REMARQUES', ''],
  ]
  header.forEach(([label, value], i) => {
    const r = i + 1
    ws.getRow(r).height = 25.8
    ws.mergeCells(r, 3, r, lastCol)
    const b = ws.getCell(r, 2)
    b.value = label
    b.font = { name: 'Calibri', size: 20, bold: true }
    b.border = { top: medium, left: medium, bottom: thin, right: thin }
    const c = ws.getCell(r, 3)
    c.value = value
    c.font = { name: 'Calibri', size: 20, bold: true }
    c.alignment = { horizontal: 'left' }
    for (let col = 3; col <= lastCol; col++) ws.getCell(r, col).border = { top: thin, bottom: thin, right: col === lastCol ? medium : undefined }
  })

  // Ligne 7 : numéros de page de la soumission, au-dessus des numéros de CAN
  const pagesRow = 7
  const pageTexts = lots.map((l) => fmtPages(l.pages))
  ws.getRow(pagesRow).height = Math.max(19.95, ...pageTexts.map((t) => Math.ceil(t.length / 5) * 18))
  for (let c = 2; c <= lastCol; c++) {
    const cell = ws.getCell(pagesRow, c)
    if (c === 2) cell.value = 'PAGES DE LA SOUMISSION'
    else if (c < lastCol) cell.value = pageTexts[c - 3]
    cell.font = { name: 'Calibri', size: c === 2 ? 14 : 12, bold: true }
    cell.alignment = { horizontal: c === 2 ? 'right' : 'center', vertical: 'middle', wrapText: true }
    cell.border = { top: thin, bottom: thin, left: thin, right: c === lastCol ? medium : thin }
  }

  // Ligne 8 : numéros de lot + « Plans »
  const headRow = 8
  ws.getRow(headRow).height = 19.95
  const style = (cell: import('exceljs').Cell, grey: boolean, align: 'left' | 'center' | undefined) => {
    cell.font = { name: 'Calibri', size: 14, bold: true }
    cell.alignment = { horizontal: align, vertical: 'middle' }
    if (grey) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } }
  }
  const labels = [...lots.map((l) => l.cfcCode || l.subChapterCode || l.title), 'Plans']
  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(headRow, c)
    if (c >= 3) cell.value = labels[c - 3]
    style(cell, true, c === 1 ? undefined : c === 2 ? 'left' : 'center')
    cell.border = { top: thin, bottom: thin, left: c === 1 ? medium : thin, right: c === lastCol ? medium : thin }
  }

  // Une ligne par fournisseur, une ligne sur deux grisée (comme le modèle).
  suppliers.forEach((sup, i) => {
    const r = headRow + 1 + i
    const grey = i % 2 === 1
    const allSent = sup.sent
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c)
      if (c === 1) cell.value = i + 1
      else if (c === 2) cell.value = sup.name
      else if (c < lastCol && sup.lotIds.has(lots[c - 3].id)) cell.value = 'X'
      style(cell, grey, c === 1 ? undefined : c === 2 ? 'left' : 'center')
      if (c === 2 && allSent) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } }
      cell.border = { top: thin, bottom: thin, left: c === 1 ? medium : thin, right: c === lastCol ? medium : thin }
    }
  })

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `Grille soumission ${info.projectName || submission.name || ''}.xlsx`.trim()
  a.click()
  URL.revokeObjectURL(url)
}
