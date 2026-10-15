import type { Submission } from '../types'

const GREY = 'FFA6A6A6' // gris du modèle (blanc, assombri de 35 %)
const YELLOW = 'FFFFFF00'
const thin = { style: 'thin' as const }
const medium = { style: 'medium' as const }

/** Lots à afficher en colonnes : ceux qui ont au moins un fournisseur retenu pour l'envoi. */
function gridLots(submission: Submission) {
  return submission.lots.filter((l) => l.suppliers.some((s) => s.status !== 'ignore'))
}

/** Vrai quand tous les e-mails (une ligne de suivi par fournisseur et par lot) sont marqués envoyés. */
export function allEmailsSent(submission: Submission): boolean {
  const lots = gridLots(submission)
  if (!lots.length) return false
  return lots.every((l) => {
    const active = l.suppliers.filter((s) => s.status !== 'ignore')
    return active.every((s) => l.followUp.find((f) => f.supplierId === s.supplierId)?.status === 'envoye')
  })
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('fr-CH') : '')

/** Génère la « Grille soumission » : fournisseurs en lignes, lots en colonnes, X = fournisseur consulté. */
export async function exportTrackingGrid(submission: Submission): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const lots = gridLots(submission)
  const info = submission.info

  // Fournisseurs dans l'ordre de première apparition, avec leurs lots.
  const suppliers: { id: string; name: string; lotIds: Set<string> }[] = []
  for (const lot of lots) {
    for (const s of lot.suppliers.filter((x) => x.status !== 'ignore')) {
      let row = suppliers.find((r) => r.id === s.supplierId)
      if (!row) suppliers.push((row = { id: s.supplierId, name: s.name, lotIds: new Set() }))
      row.lotIds.add(lot.id)
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
    const allSent = lots.every((l) => !l.suppliers.some((s) => s.supplierId === sup.id) ||
      l.followUp.find((f) => f.supplierId === sup.id)?.status === 'envoye')
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
