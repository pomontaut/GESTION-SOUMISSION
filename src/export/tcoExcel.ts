import type { Cell } from 'exceljs'
import type { Nature, OffreTco, TcoResult } from '../agent/acheteurAgent'

const BLUE = 'FF0000FF'
const YELLOW = 'FFFFFF00'
const HEAD = 'FFD9D9D9'
const thin = { style: 'thin' as const }
const box = { top: thin, left: thin, bottom: thin, right: thin }
const CHF = '#,##0.00'
const NP = 'Non précisé'

const colName = (n: number) => {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
const key = (s: string) => s.trim().toLowerCase()

/** Génère le classeur TCO (formules actives, HT) à partir du résultat de l'agent. */
export async function exportTcoExcel(tco: TcoResult, fileName: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('TCO', { views: [{ showGridLines: false }] })

  const head = (c: Cell) => {
    c.font = { bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }
    c.border = box
    c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }
  }
  const input = (c: Cell, nature?: Nature, note?: string) => {
    c.font = { color: { argb: BLUE } }
    c.border = box
    c.numFmt = CHF
    if (nature === 'H') c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } }
    if (note) c.note = note
  }
  const calc = (c: Cell, fmt = CHF) => {
    c.border = box
    c.numFmt = fmt
  }

  ws.getCell('A1').value = tco.titre
  ws.getCell('A1').font = { bold: true, size: 16 }
  ws.getCell('A2').value =
    'Prix en CHF HT. Cellules en bleu = saisies modifiables ; fond jaune = hypothèse clé [H]. Montants HT, TVA exclue.'
  ws.getCell('A2').font = { italic: true }

  ws.getCell('A4').value = `Quantité du besoin (${tco.unite})`
  ws.getCell('B4').value = tco.quantite_besoin
  ws.getCell('A5').value = 'Unité'
  ws.getCell('B5').value = tco.unite
  const hasBudget = tco.budget_unitaire != null
  ws.getCell('A6').value = `Budget unitaire (CHF/${tco.unite})`
  ws.getCell('A7').value = 'Budget total (CHF)'
  if (hasBudget) {
    ws.getCell('B6').value = tco.budget_unitaire
    ws.getCell('B7').value = { formula: 'B4*B6' }
  } else {
    ws.getCell('B6').value = NP
    ws.getCell('B7').value = NP
  }
  for (const r of [4, 5, 6, 7]) {
    ws.getCell(`A${r}`).font = { bold: true }
    ws.getCell(`B${r}`).border = box
  }
  input(ws.getCell('B4'))
  ws.getCell('B4').numFmt = '#,##0.##'
  if (hasBudget) {
    input(ws.getCell('B6'))
    calc(ws.getCell('B7'))
  }

  let row = 9
  const totalCells: { fournisseur: string; variante: string; ref: string; offre: OffreTco; minRef: string }[] = []

  for (const variante of tco.variantes) {
    const offres = variante.offres
    ws.getCell(row, 1).value = variante.nom
    ws.getCell(row, 1).font = { bold: true, size: 13 }
    row++

    // Colonnes dynamiques : union des composantes et des forfaits, dans l'ordre d'apparition.
    const comps: string[] = []
    const forfs: string[] = []
    for (const o of offres) {
      for (const c of o.composantes) if (!comps.some((x) => key(x) === key(c.libelle))) comps.push(c.libelle)
      for (const f of o.forfaits) if (!forfs.some((x) => key(x) === key(f.libelle))) forfs.push(f.libelle)
    }
    let col = 1
    const cFour = col++
    const cRef = col++
    const cComp0 = col
    col += comps.length
    const cFranco = col++
    const cForf0 = col
    col += forfs.length
    const cRabais = col++
    const cEscompte = col++
    const cTotal = col++
    const cEcart = col++
    const cEcartPct = col++
    const cRang = col++
    const cQte = col++
    const cBud = hasBudget ? col : 0
    if (hasBudget) col += 3
    const cRem = col++

    const headers: [number, string][] = [
      [cFour, 'Fournisseur'],
      [cRef, 'Offre n° (date)'],
      ...comps.map((c, i): [number, string] => [cComp0 + i, `${c} /${tco.unite}`]),
      [cFranco, `Franco /${tco.unite} (somme)`],
      ...forfs.map((f, i): [number, string] => [cForf0 + i, `${f} (CHF)`]),
      [cRabais, 'Rabais (%)'],
      [cEscompte, 'Escompte (CHF)'],
      [cTotal, 'Total HT (CHF)'],
      [cEcart, 'Écart vs meilleur (CHF)'],
      [cEcartPct, 'Écart (%)'],
      [cRang, 'Rang'],
      [cQte, 'Qté offerte'],
      ...(hasBudget
        ? ([
            [cBud, `Écart budget /${tco.unite}`],
            [cBud + 1, 'Écart budget (CHF)'],
            [cBud + 2, 'Écart budget (%)'],
          ] as [number, string][])
        : []),
      [cRem, 'Remarque'],
    ]
    for (const [c, label] of headers) {
      ws.getCell(row, c).value = label
      head(ws.getCell(row, c))
    }
    ws.getRow(row).height = 45
    row++

    const first = row
    const last = row + offres.length - 1
    const totalRange = `${colName(cTotal)}${first}:${colName(cTotal)}${last}`
    for (const o of offres) {
      ws.getCell(row, cFour).value = o.fournisseur
      ws.getCell(row, cRef).value = `${o.offre_ref} (${o.date_offre})`
      for (const c of [cFour, cRef, cRem]) ws.getCell(row, c).border = box

      comps.forEach((label, i) => {
        const cell = ws.getCell(row, cComp0 + i)
        const found = o.composantes.find((x) => key(x.libelle) === key(label))
        if (found) {
          cell.value = found.montant_unitaire
          input(cell, found.nature, `[${found.nature}] ${found.source}`)
        } else {
          cell.value = NP
          cell.font = { italic: true, color: { argb: 'FF808080' } }
          cell.border = box
        }
      })
      const fr = ws.getCell(row, cFranco)
      fr.value = comps.length
        ? { formula: `SUM(${colName(cComp0)}${row}:${colName(cComp0 + comps.length - 1)}${row})` }
        : 0
      calc(fr)
      fr.font = { bold: true }

      forfs.forEach((label, i) => {
        const cell = ws.getCell(row, cForf0 + i)
        const found = o.forfaits.find((x) => key(x.libelle) === key(label))
        if (found) {
          cell.value = found.montant
          input(cell, found.nature, `[${found.nature}] ${found.source}`)
        } else {
          cell.value = NP
          cell.font = { italic: true, color: { argb: 'FF808080' } }
          cell.border = box
        }
      })

      const rab = ws.getCell(row, cRabais)
      rab.value = o.rabais_pct
      input(rab)
      rab.numFmt = '0.0"%"'
      const esc = ws.getCell(row, cEscompte)
      esc.value = o.escompte
      input(esc)

      const forfSum = forfs.length
        ? `+SUM(${colName(cForf0)}${row}:${colName(cForf0 + forfs.length - 1)}${row})`
        : ''
      const tot = ws.getCell(row, cTotal)
      tot.value = {
        formula: `(${colName(cFranco)}${row}*$B$4${forfSum})*(1-${colName(cRabais)}${row}/100)-${colName(cEscompte)}${row}`,
      }
      calc(tot)
      tot.font = { bold: true }
      const T = `${colName(cTotal)}${row}`
      calc(ws.getCell(row, cEcart))
      ws.getCell(row, cEcart).value = { formula: `${T}-MIN(${totalRange})` }
      calc(ws.getCell(row, cEcartPct), '0.0%')
      ws.getCell(row, cEcartPct).value = { formula: `IF(MIN(${totalRange})=0,"",${T}/MIN(${totalRange})-1)` }
      calc(ws.getCell(row, cRang), '0')
      ws.getCell(row, cRang).value = { formula: `RANK(${T},${totalRange},1)` }
      const q = ws.getCell(row, cQte)
      q.value = o.quantite_offerte ?? NP
      q.border = box
      q.numFmt = '#,##0.##'

      if (hasBudget) {
        calc(ws.getCell(row, cBud))
        ws.getCell(row, cBud).value = { formula: `${colName(cFranco)}${row}-$B$6` }
        calc(ws.getCell(row, cBud + 1))
        ws.getCell(row, cBud + 1).value = { formula: `${T}-$B$7` }
        calc(ws.getCell(row, cBud + 2), '0.0%')
        ws.getCell(row, cBud + 2).value = { formula: `IF($B$7=0,"",${T}/$B$7-1)` }
      }
      const rem = ws.getCell(row, cRem)
      rem.value = o.remarque
      rem.alignment = { wrapText: true, vertical: 'top' }
      totalCells.push({ fournisseur: o.fournisseur, variante: variante.nom, ref: T, offre: o, minRef: totalRange })
      row++
    }
    if (hasBudget) {
      for (const c of [cBud, cBud + 1, cBud + 2]) {
        const rng = `${colName(c)}${first}:${colName(c)}${last}`
        ws.addConditionalFormatting({
          ref: rng,
          rules: [
            { type: 'cellIs', operator: 'greaterThan', formulae: [0], priority: 1, style: { font: { color: { argb: 'FFC00000' } } } },
            { type: 'cellIs', operator: 'lessThan', formulae: [0], priority: 2, style: { font: { color: { argb: 'FF007A33' } } } },
          ],
        })
      }
    }
    row += 2
  }

  // Contrôle de capacité (offres plafonnées).
  const capped = totalCells.filter((t) => t.offre.plafond_mensuel != null || t.offre.quantite_offerte != null)
  if (capped.some((t) => t.offre.plafond_mensuel != null)) {
    ws.getCell(row, 1).value = 'Contrôle de capacité'
    ws.getCell(row, 1).font = { bold: true, size: 13 }
    row++
    ;['Fournisseur', 'Qté offerte', 'Qté du besoin', 'Qté manquante', 'Plafond mensuel', 'Durée mini (mois)', 'Surcoût vs moins-disant (CHF)'].forEach(
      (h, i) => {
        ws.getCell(row, i + 1).value = h
        head(ws.getCell(row, i + 1))
      },
    )
    row++
    for (const t of capped.filter((x) => x.offre.plafond_mensuel != null)) {
      ws.getCell(row, 1).value = `${t.fournisseur} — ${t.variante}`
      ws.getCell(row, 2).value = t.offre.quantite_offerte ?? NP
      ws.getCell(row, 3).value = { formula: '$B$4' }
      ws.getCell(row, 4).value = { formula: `IF(ISNUMBER(B${row}),MAX(0,C${row}-B${row}),"${NP}")` }
      ws.getCell(row, 5).value = t.offre.plafond_mensuel
      ws.getCell(row, 6).value = { formula: `IF(E${row}>0,C${row}/E${row},"")` }
      ws.getCell(row, 7).value = { formula: `${t.ref}-MIN(${t.minRef})` }
      for (let c = 1; c <= 7; c++) {
        ws.getCell(row, c).border = box
        if (c > 1) ws.getCell(row, c).numFmt = c === 6 ? '0.0' : CHF
      }
      row++
    }
    row += 2
  }

  ws.getCell(row, 1).value = 'Hypothèses & points à clarifier'
  ws.getCell(row, 1).font = { bold: true, size: 13 }
  row++
  for (const h of tco.hypotheses) {
    ws.getCell(row, 1).value = `${h.id} [${h.nature}]`
    ws.getCell(row, 2).value = h.texte
    ws.getCell(row, 2).alignment = { wrapText: true, vertical: 'top' }
    if (h.nature === 'H') ws.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } }
    row++
  }
  ws.getColumn(1).width = 38
  ws.getColumn(2).width = 28
  for (let c = 3; c <= 20; c++) ws.getColumn(c).width = 18
  ws.getColumn(20).width = 60

  // Feuille Conditions
  const wc = wb.addWorksheet('Conditions')
  const names = [...new Set(tco.conditions.flatMap((c) => c.valeurs.map((v) => v.fournisseur)))]
  wc.getCell(1, 1).value = 'Critère'
  names.forEach((n, i) => (wc.getCell(1, i + 2).value = n))
  for (let c = 1; c <= names.length + 1; c++) head(wc.getCell(1, c))
  tco.conditions.forEach((cond, r) => {
    wc.getCell(r + 2, 1).value = cond.critere
    wc.getCell(r + 2, 1).font = { bold: true }
    names.forEach((n, i) => {
      const cell = wc.getCell(r + 2, i + 2)
      cell.value = cond.valeurs.find((v) => key(v.fournisseur) === key(n))?.valeur || NP
      cell.alignment = { wrapText: true, vertical: 'top' }
    })
    for (let c = 1; c <= names.length + 1; c++) wc.getCell(r + 2, c).border = box
  })
  wc.getColumn(1).width = 34
  for (let c = 2; c <= names.length + 1; c++) wc.getColumn(c).width = 38

  // Feuille Analyse
  const wa = wb.addWorksheet('Analyse')
  let r = 1
  const title = (t: string) => {
    wa.getCell(r, 1).value = t
    wa.getCell(r, 1).font = { bold: true, size: 13 }
    r++
  }
  const line = (t: string) => {
    wa.mergeCells(r, 1, r, 6)
    wa.getCell(r, 1).value = t
    wa.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' }
    wa.getRow(r).height = Math.max(18, Math.ceil(t.length / 130) * 16)
    r++
  }
  title('Points à clarifier avant analyse')
  ;['Gravité', 'Offre', 'Donnée', 'Nature du doute', 'Impact', 'Question au fournisseur'].forEach((h, i) => {
    wa.getCell(r, i + 1).value = h
    head(wa.getCell(r, i + 1))
  })
  r++
  for (const p of tco.points_a_clarifier) {
    ;[p.gravite, p.offre, p.donnee, p.nature_du_doute, p.impact, p.question].forEach((v, i) => {
      wa.getCell(r, i + 1).value = v
      wa.getCell(r, i + 1).border = box
      wa.getCell(r, i + 1).alignment = { wrapText: true, vertical: 'top' }
    })
    r++
  }
  r++
  title('Synthèse')
  tco.synthese.forEach(line)
  r++
  title('Incohérences de chiffrage')
  tco.incoherences.forEach(line)
  r++
  title('Leviers de négociation')
  ;['Fournisseur', 'Levier', 'Gain estimé', 'Certitude'].forEach((h, i) => {
    wa.getCell(r, i + 1).value = h
    head(wa.getCell(r, i + 1))
  })
  r++
  for (const l of tco.leviers) {
    ;[l.fournisseur, l.levier, l.gain_estime, l.certitude].forEach((v, i) => {
      wa.getCell(r, i + 1).value = v
      wa.getCell(r, i + 1).border = box
      wa.getCell(r, i + 1).alignment = { wrapText: true, vertical: 'top' }
    })
    r++
  }
  r++
  title('Recommandation (aide à la décision — l\'attribution appartient à l\'acheteur)')
  line(tco.recommandation)
  r++
  title('Sources')
  tco.sources.forEach(line)
  ;[20, 26, 34, 34, 34, 40].forEach((w, i) => (wa.getColumn(i + 1).width = w))

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

