import type { FollowUpEntry, Lot, Submission } from '../types'

// Swiss/French amounts come in as free text ("150'000.00", "150 000,50", "150000") - strip
// everything but digits/separators/sign, then treat a trailing 3-digit group after a dot/comma as
// a thousands separator (never a decimal, since a real decimal group is 1-2 digits) before
// normalising the remaining separator to a dot. Not a full parser, just enough to rank offers.
function parseAmount(raw?: string): number | null {
  if (!raw) return null
  // "160'000.-" (round francs, no cents) is common Swiss notation - normalise before stripping,
  // since a bare trailing "-" would otherwise just get read as part of the digit string.
  const withZeroCents = raw.replace(/\.-\s*$/, '.00')
  const cleaned = withZeroCents.replace(/[^\d.,-]/g, '')
  if (!cleaned) return null
  const normalized = cleaned.replace(/[.,](\d{3})(?!\d)/g, '$1').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function formatAmount(n: number): string {
  return n.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface TcoTechnicalCriterion {
  criterion: string
  values: Record<string, string>
  analysis?: string
}

interface TcoAnalysisResult {
  note: string | null
  technical: TcoTechnicalCriterion[]
}

// Best-effort: the AI-drafted note and technical comparison are a bonus on top of the
// deterministic tabular comparatif above, never a requirement for it. If the API key isn't
// configured, the call fails, or the server is unreachable, the workbook still generates
// correctly without this section - just surfaced as a one-line note in the sheet itself, so the
// gap isn't silently invisible.
async function fetchTcoAnalysis(lot: Lot, submission: Submission): Promise<TcoAnalysisResult> {
  try {
    const res = await fetch('/api/tco/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lotTitle: lot.title,
        cfcCode: lot.cfcCode,
        projectName: submission.info.projectName,
        suppliers: lot.followUp.map((f) => ({
          name: f.name,
          estimatedAmount: f.estimatedAmount,
          offeredAmount: f.offeredAmount,
          conforme: f.conforme,
          notes: f.notes,
          retained: f.retained,
          deliveryTime: f.deliveryTime,
          offerValidUntil: f.offerValidUntil,
          paymentTerms: f.paymentTerms,
          nonConformityReason: f.nonConformityReason,
        })),
        positions: lot.positions?.map((p) => ({
          code: p.code,
          title: p.title,
          quantity: p.quantity,
          unit: p.unit,
          unitPrices: Object.fromEntries(
            Object.entries(p.unitPrices ?? {}).map(([supplierId, amount]) => [
              lot.followUp.find((f) => f.supplierId === supplierId)?.name ?? supplierId,
              amount,
            ]),
          ),
        })),
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return { note: `Note IA indisponible (${body?.error ?? res.status}).`, technical: [] }
    }
    const data = await res.json()
    return {
      note: typeof data.note === 'string' ? data.note : null,
      technical: Array.isArray(data.technical) ? data.technical : [],
    }
  } catch {
    return { note: 'Note IA indisponible (serveur injoignable).', technical: [] }
  }
}

const HEADER_FILL = 'FF1E293B'
const LOWEST_FILL = 'FF92D050' // green - lowest offer / retained supplier, same convention seen across the real comparatifs studied
const NONCONFORME_FILL = 'FFFCDCDC' // pale red - non-conformity flag
const LABEL_FILL = 'FFF1F5F9'

/**
 * Builds a "Structure B" comparatif (one row per criterion, one column per fournisseur, last
 * column-less - the whole sheet reads left to right) - the pattern that best fits what this app
 * actually tracks per fournisseur (a single net amount + conformité + notes, not a full CAN-métré
 * breakdown), and the one confirmed on real INDUNI comparatifs to read well without a huge grid.
 * See `.claude/agents/comparatif-tco.md` for the corpus this is modelled on, including the
 * criteria (délai, garantie, conditions de paiement...) that real comparatifs use but this app
 * doesn't collect yet - deliberately left out here rather than shown as empty columns.
 */
export async function generateTcoWorkbook(lot: Lot, submission: Submission): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'GESTION-SOUMISSION'
  wb.created = new Date()

  const sheet = wb.addWorksheet('TCO', { views: [{ state: 'frozen', xSplit: 1, ySplit: 5 }] })
  const suppliers = lot.followUp
  const colCount = suppliers.length + 1

  const amounts = suppliers.map((f) => parseAmount(f.offeredAmount))
  const validAmounts = amounts.filter((a): a is number => a !== null)
  const minAmount = validAmounts.length ? Math.min(...validAmounts) : null
  const retainedIdx = suppliers.findIndex((f) => f.retained)

  sheet.getColumn(1).width = 26
  for (let i = 2; i <= colCount; i++) sheet.getColumn(i).width = 22
  sheet.getColumn(colCount + 1).width = 40 // "Analyse / Recommandation" column of the technical section, if any

  sheet.mergeCells(1, 1, 1, colCount)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = `Comparatif d'offres — CFC ${lot.cfcCode} — ${lot.title}`
  titleCell.font = { bold: true, size: 14 }

  sheet.mergeCells(2, 1, 2, colCount)
  const subtitleCell = sheet.getCell(2, 1)
  const projectBits = [submission.info.projectName, submission.info.siteLocation].filter(Boolean).join(' — ')
  subtitleCell.value = `${projectBits ? projectBits + ' · ' : ''}Généré le ${new Date().toLocaleDateString('fr-CH')} · Tous les montants sont hors taxe (HT)`
  subtitleCell.font = { italic: true, color: { argb: 'FF64748B' } }

  const headerRowIdx = 4
  const headerRow = sheet.getRow(headerRowIdx)
  headerRow.getCell(1).value = 'Critère'
  suppliers.forEach((f, i) => {
    headerRow.getCell(i + 2).value = f.name
  })
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })

  let r = headerRowIdx + 1

  function addRow(
    label: string,
    values: (f: FollowUpEntry, i: number) => string,
    highlight?: (f: FollowUpEntry, i: number) => 'lowest' | 'nonconforme' | undefined,
  ) {
    const row = sheet.getRow(r)
    const labelCell = row.getCell(1)
    labelCell.value = label
    labelCell.font = { bold: true }
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LABEL_FILL } }
    suppliers.forEach((f, i) => {
      const cell = row.getCell(i + 2)
      cell.value = values(f, i)
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      const h = highlight?.(f, i)
      if (h === 'lowest') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOWEST_FILL } }
        cell.font = { bold: true }
      } else if (h === 'nonconforme') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NONCONFORME_FILL } }
      }
    })
    r++
  }

  addRow('Statut', (f) => (f.offeredAmount ? 'Offre reçue' : f.status === 'envoye' ? 'Envoyé, en attente' : 'À envoyer'))
  addRow('Montant estimé (CHF HT)', (f) => f.estimatedAmount || '—')
  addRow(
    'Montant offert (CHF HT)',
    (f, i) => (amounts[i] !== null ? formatAmount(amounts[i]!) : f.offeredAmount || '—'),
    (_f, i) => (amounts[i] !== null && minAmount !== null && amounts[i] === minAmount ? 'lowest' : undefined),
  )
  addRow('Écart vs. moins-disant (%)', (_f, i) => {
    if (amounts[i] === null || minAmount === null) return '—'
    if (amounts[i] === minAmount) return 'Moins-disant'
    const pct = ((amounts[i]! - minAmount) / minAmount) * 100
    return `+${pct.toFixed(1)}%`
  })
  addRow('Écart vs. moins-disant (CHF HT)', (_f, i) => {
    if (amounts[i] === null || minAmount === null) return '—'
    if (amounts[i] === minAmount) return '—'
    return `+${formatAmount(amounts[i]! - minAmount)}`
  })
  addRow('Délai', (f) => f.deliveryTime || '—')
  addRow('Validité offre', (f) => {
    if (!f.offerValidUntil) return '—'
    const expired = new Date(f.offerValidUntil) < new Date()
    return expired ? `${f.offerValidUntil} ⚠ expirée` : f.offerValidUntil
  })
  addRow('Conditions de paiement', (f) => f.paymentTerms || '—')
  addRow(
    'Conforme',
    (f) => (f.conforme ? 'Oui' : `Non${f.nonConformityReason ? ` — ${f.nonConformityReason}` : ''}`),
    (f) => (f.conforme ? undefined : 'nonconforme'),
  )
  addRow('Date de retour', (f) => f.returnDate || '—')
  addRow('Notes / Réserves', (f) => f.notes || '—')
  addRow(
    'Fournisseur retenu',
    (_f, i) => (i === retainedIdx ? '✓' : '—'),
    (_f, i) => (i === retainedIdx ? 'lowest' : undefined),
  )

  r++
  const minSupplierName = validAmounts.length
    ? suppliers[amounts.findIndex((a) => a === minAmount)]?.name
    : undefined
  if (minSupplierName && minAmount !== null) {
    sheet.mergeCells(r, 1, r, colCount)
    const cell = sheet.getCell(r, 1)
    cell.value = `Offre la moins disante : ${minSupplierName} — CHF ${formatAmount(minAmount)} HT`
    cell.font = { bold: true }
    r++
  }
  if (retainedIdx >= 0) {
    sheet.mergeCells(r, 1, r, colCount)
    const cell = sheet.getCell(r, 1)
    cell.value = `Fournisseur retenu : ${suppliers[retainedIdx].name}`
    cell.font = { bold: true, color: { argb: 'FF1F7A3D' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOWEST_FILL } }
  }
  r++

  // `unitPrices` defaults to {} defensively - a position saved before this field existed must
  // never crash generation, just show empty PU cells.
  const positions = lot.positions?.map((p) => ({ ...p, unitPrices: p.unitPrices ?? {} }))
  if (positions && positions.length > 0) {
    r++
    const posColCount = suppliers.length + 4
    sheet.mergeCells(r, 1, r, Math.max(colCount, posColCount))
    const posTitleCell = sheet.getCell(r, 1)
    posTitleCell.value = 'Comparatif par article CAN'
    posTitleCell.font = { bold: true, size: 12 }
    r++

    const posHeaderRow = sheet.getRow(r)
    posHeaderRow.getCell(1).value = 'Code'
    posHeaderRow.getCell(2).value = 'Désignation'
    posHeaderRow.getCell(3).value = 'Quantité'
    posHeaderRow.getCell(4).value = 'Unité'
    suppliers.forEach((f, i) => {
      posHeaderRow.getCell(i + 5).value = `${f.name} (Total HT)`
    })
    posHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    })
    r++

    const supplierTotals = new Array(suppliers.length).fill(0)
    const pricedCount = new Array(suppliers.length).fill(0)

    for (const pos of positions) {
      const row = sheet.getRow(r)
      row.getCell(1).value = pos.code || '—'
      row.getCell(2).value = pos.title || '—'
      row.getCell(3).value = pos.quantity || '—'
      row.getCell(4).value = pos.unit || '—'
      // The quantity is the buyer's own métré, shared across every fournisseur - a fournisseur who
      // only gave a PU (no total, no quantity of their own) is still fully priced here, since the
      // total is always computed as qty × PU rather than read directly from the fournisseur.
      const qty = parseAmount(pos.quantity)
      const rowTotals = suppliers.map((f) => {
        const pu = parseAmount(pos.unitPrices[f.supplierId])
        return pu !== null && qty !== null ? pu * qty : null
      })
      const rowValid = rowTotals.filter((a): a is number => a !== null)
      const rowMin = rowValid.length ? Math.min(...rowValid) : null
      suppliers.forEach((f, i) => {
        const cell = row.getCell(i + 5)
        const pu = parseAmount(pos.unitPrices[f.supplierId])
        const total = rowTotals[i]
        if (total !== null) {
          cell.value = `${formatAmount(total)} (PU ${formatAmount(pu!)})`
        } else if (pu !== null) {
          cell.value = `PU ${formatAmount(pu)} (quantité manquante)`
        } else {
          cell.value = pos.unitPrices[f.supplierId] || '—'
        }
        cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true }
        if (total !== null) {
          supplierTotals[i] += total
          pricedCount[i]++
          if (rowMin !== null && total === rowMin) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOWEST_FILL } }
            cell.font = { bold: true }
          }
        }
      })
      r++
    }

    const totalRow = sheet.getRow(r)
    totalRow.getCell(1).value = 'Total'
    totalRow.getCell(1).font = { bold: true }
    totalRow.getCell(2).value = `${positions.length} article(s)`
    const completeTotals = suppliers
      .map((_, i) => (pricedCount[i] === positions.length ? supplierTotals[i] : null))
      .filter((v): v is number => v !== null)
    const minTotal = completeTotals.length ? Math.min(...completeTotals) : null
    suppliers.forEach((f, i) => {
      const cell = totalRow.getCell(i + 5)
      const complete = pricedCount[i] === positions.length
      cell.value = complete
        ? `${formatAmount(supplierTotals[i])} HT`
        : pricedCount[i] > 0
          ? `${formatAmount(supplierTotals[i])} HT (partiel, ${pricedCount[i]}/${positions.length})`
          : '—'
      cell.font = { bold: true }
      cell.alignment = { horizontal: 'center', wrapText: true }
      if (complete && minTotal !== null && supplierTotals[i] === minTotal) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOWEST_FILL } }
      }
    })
    r++
  }

  const { note, technical } = await fetchTcoAnalysis(lot, submission)

  if (technical.length > 0) {
    r++
    sheet.mergeCells(r, 1, r, colCount + 1)
    const techTitleCell = sheet.getCell(r, 1)
    techTitleCell.value = 'Comparatif technique'
    techTitleCell.font = { bold: true, size: 12 }
    r++

    const techHeaderRow = sheet.getRow(r)
    techHeaderRow.getCell(1).value = 'Critère'
    suppliers.forEach((f, i) => {
      techHeaderRow.getCell(i + 2).value = f.name
    })
    techHeaderRow.getCell(colCount + 1).value = 'Analyse / Recommandation'
    techHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    })
    r++

    for (const tech of technical) {
      const row = sheet.getRow(r)
      row.getCell(1).value = tech.criterion
      row.getCell(1).font = { bold: true }
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LABEL_FILL } }
      suppliers.forEach((f, i) => {
        const cell = row.getCell(i + 2)
        cell.value = tech.values[f.name] ?? 'non précisé'
        cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true }
      })
      const analysisCell = row.getCell(colCount + 1)
      analysisCell.value = tech.analysis || '—'
      analysisCell.alignment = { wrapText: true, vertical: 'top' }
      r++
    }
  }

  if (note) {
    r++
    sheet.mergeCells(r, 1, r, colCount)
    const noteHeaderCell = sheet.getCell(r, 1)
    noteHeaderCell.value = 'Note acheteur'
    noteHeaderCell.font = { bold: true, size: 12 }
    r++
    const noteRowStart = r
    sheet.mergeCells(r, 1, r, colCount)
    const noteCell = sheet.getCell(r, 1)
    noteCell.value = note
    noteCell.alignment = { wrapText: true, vertical: 'top' }
    // exceljs can't autosize a wrapped merged row - estimate a line count from the text length
    // against the sheet's total width so the note doesn't get clipped.
    const charsPerLine = 14 * colCount
    const lines = Math.max(1, Math.ceil(note.length / charsPerLine))
    sheet.getRow(noteRowStart).height = lines * 15 + 10
  }

  sheet.getRow(1).height = 22
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function tcoFilename(lot: Lot): string {
  const base = `${lot.cfcCode}-${lot.chapterCode}${lot.subChapterCode ? '-' + lot.subChapterCode : ''}`
  return `TCO-${base}.xlsx`
}
