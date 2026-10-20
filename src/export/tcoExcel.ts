import type { Cell, Workbook } from 'exceljs'
import type { OffreTco, Parametre, ScenarioTco, TcoResult } from '../agent/acheteurTypes'

// Format cible : « TCO synthétique » d'une seule feuille, 6 sections (paramètres, détail des
// positions, synthèse financière, comparaison par lot, conditions commerciales, points à
// clarifier), formules actives. Texte bleu = saisie [F] modifiable, noir = calcul, jaune = [H].
const BLUE = 'FF0000FF'
const GREY = 'FF666666'
const RED = 'FFC00000'
const NAVY = 'FF1F3864'
const SECTION = 'FFD9E1F2'
const HYPOTHESIS = 'FFFFFF00'
const BEST = 'FFE2EFDA'
const TINTS = ['FFEAF3FB', 'FFFDF1E6', 'FFE8F4E6', 'FFF3E8F7', 'FFFFF8E1', 'FFEDEDED']
const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } }
const box = { top: thin, left: thin, bottom: thin, right: thin }
const CHF = '#,##0.00'
const PCT = '0.00%'
const LAST_COL = 13 // M

const colName = (n: number) => {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
const q = (s: string) => `"${s.replace(/"/g, '""')}"`
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const lineHeight = (text: string, charsPerLine: number) => Math.max(1, Math.ceil(text.length / charsPerLine)) * 15

export function buildTcoWorkbook(tco: TcoResult, ExcelJS: typeof import('exceljs')): Workbook {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('TCO', { views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }] })
  ;[16, 20, 6, 26, 26, 26, 30, 11, 16, 11, 14, 11, 13].forEach((w, i) => (ws.getColumn(i + 1).width = w))

  const offres = tco.offres
  const tint = (i: number) => TINTS[i % TINTS.length]
  const fill = (c: Cell, argb: string) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } })
  const header = (r: number, labels: Record<number, string>) => {
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = ws.getCell(r, c)
      if (labels[c] === undefined && c > Math.max(...Object.keys(labels).map(Number))) continue
      cell.value = labels[c] ?? null
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      fill(cell, NAVY)
      cell.alignment = { wrapText: true, vertical: 'middle' }
      cell.border = box
    }
  }
  const section = (r: number, title: string) => {
    for (let c = 1; c <= LAST_COL; c++) fill(ws.getCell(r, c), SECTION)
    ws.getCell(r, 1).value = title
    ws.getCell(r, 1).font = { bold: true }
  }
  const note = (c: Cell, text: string) => {
    c.value = text
    c.font = { color: { argb: GREY } }
  }

  ws.getCell('A1').value = tco.titre
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = `Chantier : ${tco.chantier}`
  ws.getCell('A3').value = `Demandeur : ${tco.demandeur}   |   Montants en CHF hors TVA sauf mention`
  note(ws.getCell('A4'), 'Légende : texte bleu = valeurs saisies depuis les offres (modifiables) · texte noir = formules · fond jaune = hypothèse [H] à confirmer')

  // ---------- 1. Paramètres ----------
  let r = 6
  section(r, '1. Paramètres')
  r++
  const paramCell = new Map<string, string>()
  const addParam = (key: string, p: Parametre) => {
    ws.getCell(r, 1).value = p.libelle
    const c = ws.getCell(r, 4)
    c.value = p.valeur
    c.font = { color: { argb: BLUE } }
    c.numFmt = p.format === 'pct' ? PCT : p.format === 'chf' ? CHF : '#,##0.####'
    if (p.nature === 'H') fill(c, HYPOTHESIS)
    note(ws.getCell(r, 5), p.source ? `Source : ${p.source}` : '')
    paramCell.set(key, `$D$${r}`)
    r++
  }
  if (tco.taux_tva != null) {
    addParam('tva', { libelle: 'Taux TVA', valeur: tco.taux_tva, format: 'pct', source: tco.tva_source, nature: 'F' })
  }
  if (tco.budget_total != null) {
    addParam('budget', { libelle: 'Budget total (CHF HT)', valeur: tco.budget_total, format: 'chf', source: 'Budget communiqué', nature: 'F' })
  }
  for (const o of offres) {
    const t = o.transport
    const src = t.source || `Offre ${o.fournisseur}`
    if (t.seuil_franco != null && t.surtaxe_sous_seuil > 0) {
      addParam(`${o.fournisseur}|seuil`, { libelle: `${o.fournisseur} – seuil franco (valeur nette)`, valeur: t.seuil_franco, format: 'chf', source: src, nature: 'F' })
      addParam(`${o.fournisseur}|surtaxe`, { libelle: `${o.fournisseur} – surtaxe transport sous seuil`, valeur: t.surtaxe_sous_seuil, format: 'chf', source: src, nature: 'F' })
    }
    if (t.pct_valeur > 0) {
      addParam(`${o.fournisseur}|pct`, { libelle: `${o.fournisseur} – supplément transport (% valeur nette)`, valeur: t.pct_valeur, format: 'pct', source: src, nature: 'F' })
    }
    if (t.fixe > 0) {
      addParam(`${o.fournisseur}|fixe`, { libelle: `${o.fournisseur} – frais fixes de livraison`, valeur: t.fixe, format: 'chf', source: src, nature: 'F' })
    }
    if (o.rabais_pct > 0) {
      addParam(`${o.fournisseur}|rabais`, { libelle: `${o.fournisseur} – rabais`, valeur: o.rabais_pct, format: 'pct', source: `Offre ${o.fournisseur}`, nature: 'F' })
    }
  }
  for (const p of tco.parametres) addParam(`p|${p.libelle}`, p)

  // ---------- 2. Détail des positions ----------
  r++
  section(r, '2. Détail des positions')
  r++
  header(r, {
    1: 'Fournisseur', 2: 'Offre / date', 3: 'Pos.', 4: 'Article', 5: 'Produit', 6: 'Matériau', 7: 'Caractéristiques',
    8: 'Quantité', 9: 'Conditionnement', 10: 'Prix brut CHF/unité', 11: 'Supplément % (renchér. / énergie)',
    12: 'Prix net CHF/unité', 13: 'Montant CHF',
  })
  ws.getRow(r).height = 45
  const firstPos = r + 1
  const lotUnit = new Map<string, string>()
  offres.forEach((o, i) => {
    for (const p of o.positions) {
      r++
      const vals: Record<number, string | number> = {
        1: o.fournisseur, 2: `${o.offre_ref} – ${o.date_offre}`, 3: p.pos, 4: p.article, 5: p.produit, 6: p.lot,
        7: p.caracteristiques, 8: p.quantite, 9: p.conditionnement, 10: p.prix_brut, 11: p.supplement_pct,
      }
      for (let c = 1; c <= LAST_COL; c++) {
        const cell = ws.getCell(r, c)
        fill(cell, tint(i))
        cell.border = box
        cell.alignment = { wrapText: true, vertical: 'top' }
        if (vals[c] !== undefined) cell.value = vals[c]
      }
      ws.getCell(r, 8).numFmt = `#,##0.00 "${p.unite}"`
      ws.getCell(r, 10).numFmt = CHF
      ws.getCell(r, 11).numFmt = PCT
      ws.getCell(r, 12).value = { formula: `J${r}*(1+K${r})`, result: p.prix_brut * (1 + p.supplement_pct) }
      ws.getCell(r, 12).numFmt = CHF
      ws.getCell(r, 13).value = { formula: `H${r}*J${r}*(1+K${r})`, result: p.quantite * p.prix_brut * (1 + p.supplement_pct) }
      ws.getCell(r, 13).numFmt = CHF
      for (const c of [8, 10, 11]) ws.getCell(r, c).font = { color: { argb: BLUE } }
      ws.getRow(r).height = lineHeight(`${p.caracteristiques}${p.produit}`, 40) > 30 ? 45 : 30
      if (!lotUnit.has(p.lot)) lotUnit.set(p.lot, p.unite)
    }
  })
  const lastPos = r
  const rng = (col: string) => `$${col}$${firstPos}:$${col}$${Math.max(lastPos, firstPos)}`
  const lots = [...lotUnit.keys()]

  // Expressions de formules ------------------------------------------------------------------
  const offre = (name: string) => offres.find((o) => same(o.fournisseur, name))
  const netExpr = (name: string, lot: string | null) => {
    const sum = lot === null
      ? `SUMIFS(${rng('M')},${rng('A')},${q(name)})`
      : `SUMIFS(${rng('M')},${rng('A')},${q(name)},${rng('F')},${q(lot)})`
    const rabais = paramCell.get(`${offre(name)?.fournisseur ?? name}|rabais`)
    return rabais ? `${sum}*(1-${rabais})` : sum
  }
  const partNet = (name: string, partLots: string[]) =>
    partLots.length === 0 ? netExpr(name, null) : partLots.map((l) => netExpr(name, l)).join('+')
  const transportExpr = (name: string, net: string) => {
    const key = offre(name)?.fournisseur ?? name
    const parts: string[] = []
    const seuil = paramCell.get(`${key}|seuil`)
    const surtaxe = paramCell.get(`${key}|surtaxe`)
    if (seuil && surtaxe) parts.push(`IF((${net})<${seuil},${surtaxe},0)`)
    const pct = paramCell.get(`${key}|pct`)
    if (pct) parts.push(`(${net})*${pct}`)
    const fixe = paramCell.get(`${key}|fixe`)
    if (fixe) parts.push(fixe)
    return parts.length ? parts.join('+') : '0'
  }

  // ---------- 3. Synthèse financière ----------
  r += 2
  section(r, '3. Synthèse financière')
  r++
  type Col = { label: string; complet: boolean; remarque: string; parts: { fournisseur: string; lots: string[] }[] }
  const cols: Col[] = [
    ...offres.map((o: OffreTco) => ({
      label: o.complet ? `${o.fournisseur} (offre complète)` : `${o.fournisseur} (offre partielle)`,
      complet: o.complet,
      remarque: '',
      parts: [{ fournisseur: o.fournisseur, lots: [] as string[] }],
    })),
    ...tco.scenarios.map((s: ScenarioTco) => ({ label: s.nom, complet: s.complet, remarque: s.remarque, parts: s.parts })),
  ]
  const firstValCol = 4
  const remarkCol = firstValCol + cols.length
  const labels: Record<number, string> = { 1: 'Poste', [remarkCol]: 'Remarque' }
  cols.forEach((c, i) => (labels[firstValCol + i] = c.label))
  header(r, labels)
  ws.getRow(r).height = 45
  const bold = (rowNum: number) => (ws.getCell(rowNum, 1).font = { bold: true })
  const money = (cell: Cell) => (cell.numFmt = CHF)
  const rowOf: Record<string, number> = {}
  const lotRows: number[] = []
  for (const lot of lots) {
    r++
    lotRows.push(r)
    ws.getCell(r, 1).value = `Marchandise nette – ${lot}`
    cols.forEach((c, i) => {
      const exprs = c.parts
        .filter((p) => offre(p.fournisseur) && (p.lots.length === 0 || p.lots.some((l) => same(l, lot))))
        .map((p) => netExpr(p.fournisseur, lot))
      const cell = ws.getCell(r, firstValCol + i)
      cell.value = exprs.length ? { formula: exprs.join('+') } : 0
      if (!exprs.length) cell.font = { color: { argb: BLUE } }
      money(cell)
    })
    if (cols.some((c) => !c.parts.some((p) => p.lots.length === 0 || p.lots.some((l) => same(l, lot))))) {
      const missing = cols.filter((c) => !c.parts.some((p) => p.lots.length === 0 || p.lots.some((l) => same(l, lot))))
      note(ws.getCell(r, remarkCol), `Non offert / hors périmètre : ${missing.map((m) => m.label).join(', ')}`)
    }
  }
  r++
  rowOf.net = r
  ws.getCell(r, 1).value = 'Valeur nette marchandise'
  bold(r)
  r++
  rowOf.transport = r
  ws.getCell(r, 1).value = 'Frais de transport'
  r++
  rowOf.total = r
  ws.getCell(r, 1).value = 'Total HT'
  bold(r)
  const hasTva = paramCell.has('tva')
  if (hasTva) {
    r++
    rowOf.tva = r
    ws.getCell(r, 1).value = 'TVA'
    r++
    rowOf.ttc = r
    ws.getCell(r, 1).value = 'Total TTC'
    bold(r)
  }
  cols.forEach((c, i) => {
    const L = colName(firstValCol + i)
    const netCell = ws.getCell(rowOf.net, firstValCol + i)
    netCell.value = lotRows.length ? { formula: `SUM(${L}${lotRows[0]}:${L}${lotRows[lotRows.length - 1]})` } : 0
    money(netCell)
    const exprs = c.parts.filter((p) => offre(p.fournisseur)).map((p) => transportExpr(p.fournisseur, partNet(p.fournisseur, p.lots)))
    const tr = c.parts.length === 1 && c.parts[0].lots.length === 0
      ? transportExpr(c.parts[0].fournisseur, `${L}${rowOf.net}`)
      : exprs.join('+') || '0'
    ws.getCell(rowOf.transport, firstValCol + i).value = { formula: tr }
    money(ws.getCell(rowOf.transport, firstValCol + i))
    const tot = ws.getCell(rowOf.total, firstValCol + i)
    tot.value = { formula: `${L}${rowOf.net}+${L}${rowOf.transport}` }
    tot.font = { bold: true }
    money(tot)
    if (hasTva) {
      ws.getCell(rowOf.tva, firstValCol + i).value = { formula: `${L}${rowOf.total}*${paramCell.get('tva')}` }
      money(ws.getCell(rowOf.tva, firstValCol + i))
      const ttc = ws.getCell(rowOf.ttc, firstValCol + i)
      ttc.value = { formula: `${L}${rowOf.total}+${L}${rowOf.tva}` }
      ttc.font = { bold: true }
      money(ttc)
    }
  })
  // Remarques de colonne (scénarios) et transport
  const transportNotes = offres.map((o) => o.transport.source).filter(Boolean)
  if (transportNotes.length) note(ws.getCell(rowOf.transport, remarkCol), transportNotes.join(' · '))
  const scenarioNotes = cols.filter((c) => c.remarque).map((c) => `${c.label} : ${c.remarque}`)
  if (scenarioNotes.length) note(ws.getCell(rowOf.net, remarkCol), scenarioNotes.join(' · '))

  // Écart vs moins-disant (offres/scénarios de périmètre complet seulement)
  const completeCols = cols.map((c, i) => (c.complet ? colName(firstValCol + i) : null)).filter(Boolean) as string[]
  r++
  ws.getCell(r, 1).value = 'Écart vs moins-disant (HT, périmètres complets)'
  bold(r)
  const ecartRow = r
  r++
  ws.getCell(r, 1).value = 'Écart en %'
  bold(r)
  const minExpr = completeCols.length ? `MIN(${completeCols.map((c) => `${c}${rowOf.total}`).join(',')})` : ''
  cols.forEach((c, i) => {
    const L = colName(firstValCol + i)
    if (!c.complet || !minExpr) {
      ws.getCell(ecartRow, firstValCol + i).value = 'Périmètre partiel'
      ws.getCell(ecartRow, firstValCol + i).font = { color: { argb: GREY } }
      return
    }
    ws.getCell(ecartRow, firstValCol + i).value = { formula: `${L}${rowOf.total}-${minExpr}` }
    money(ws.getCell(ecartRow, firstValCol + i))
    ws.getCell(r, firstValCol + i).value = { formula: `(${L}${rowOf.total}-${minExpr})/${minExpr}` }
    ws.getCell(r, firstValCol + i).numFmt = PCT
  })
  if (paramCell.has('budget')) {
    r++
    ws.getCell(r, 1).value = 'Écart vs budget (HT)'
    bold(r)
    cols.forEach((c, i) => {
      const cell = ws.getCell(r, firstValCol + i)
      if (!c.complet) {
        cell.value = 'Périmètre partiel'
        cell.font = { color: { argb: GREY } }
        return
      }
      cell.value = { formula: `${colName(firstValCol + i)}${rowOf.total}-${paramCell.get('budget')}` }
      money(cell)
    })
  } else {
    r++
    ws.getCell(r, 1).value = 'Écart vs budget'
    cols.forEach((_, i) => (ws.getCell(r, firstValCol + i).value = 'Budget non communiqué'))
    for (let i = 0; i < cols.length; i++) ws.getCell(r, firstValCol + i).font = { color: { argb: GREY } }
  }
  // fond vert sur le total TTC/HT du moins-disant : conditionnel
  if (completeCols.length > 1) {
    ws.addConditionalFormatting({
      ref: `${colName(firstValCol)}${rowOf.total}:${colName(firstValCol + cols.length - 1)}${rowOf.total}`,
      rules: [
        {
          type: 'expression',
          priority: 1,
          formulae: [`AND(ISNUMBER(${colName(firstValCol)}${ecartRow}),${colName(firstValCol)}${ecartRow}=0)`],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: BEST } } },
        },
      ],
    })
  }

  // ---------- 4. Comparaison par lot ----------
  r += 2
  section(r, '4. Comparaison par lot (périmètres comparables)')
  r++
  const oCols = offres.length
  const cmpLabels: Record<number, string> = { 1: 'Lot' }
  offres.forEach((o, i) => (cmpLabels[firstValCol + i] = o.fournisseur))
  cmpLabels[firstValCol + oCols] = 'Écart max – min'
  cmpLabels[firstValCol + oCols + 1] = 'Écart % vs min'
  header(r, cmpLabels)
  for (const lot of lots) {
    const unit = lotUnit.get(lot) ?? ''
    const qtyRow = r + 1
    const amtRow = r + 2
    const avgRow = r + 3
    ws.getCell(qtyRow, 1).value = `${lot} – quantité ${unit}`
    ws.getCell(amtRow, 1).value = `${lot} – montant CHF HT`
    ws.getCell(avgRow, 1).value = `${lot} – prix moyen CHF/${unit}`
    offres.forEach((o, i) => {
      const L = colName(firstValCol + i)
      ws.getCell(qtyRow, firstValCol + i).value = {
        formula: `IF(SUMIFS(${rng('H')},${rng('A')},${q(o.fournisseur)},${rng('F')},${q(lot)})=0,"Non offert",SUMIFS(${rng('H')},${rng('A')},${q(o.fournisseur)},${rng('F')},${q(lot)}))`,
      }
      ws.getCell(qtyRow, firstValCol + i).numFmt = '#,##0.00'
      ws.getCell(amtRow, firstValCol + i).value = { formula: `IF(ISNUMBER(${L}${qtyRow}),${netExpr(o.fournisseur, lot)},"Non offert")` }
      money(ws.getCell(amtRow, firstValCol + i))
      ws.getCell(avgRow, firstValCol + i).value = { formula: `IF(ISNUMBER(${L}${qtyRow}),${L}${amtRow}/${L}${qtyRow},"Non offert")` }
      money(ws.getCell(avgRow, firstValCol + i))
    })
    if (oCols > 1) {
      const a = colName(firstValCol)
      const b = colName(firstValCol + oCols - 1)
      for (const rowN of [amtRow, avgRow]) {
        ws.getCell(rowN, firstValCol + oCols).value = { formula: `IF(COUNT(${a}${rowN}:${b}${rowN})>1,MAX(${a}${rowN}:${b}${rowN})-MIN(${a}${rowN}:${b}${rowN}),"n/a")` }
        money(ws.getCell(rowN, firstValCol + oCols))
        ws.getCell(rowN, firstValCol + oCols + 1).value = { formula: `IF(COUNT(${a}${rowN}:${b}${rowN})>1,(MAX(${a}${rowN}:${b}${rowN})-MIN(${a}${rowN}:${b}${rowN}))/MIN(${a}${rowN}:${b}${rowN}),"n/a")` }
        ws.getCell(rowN, firstValCol + oCols + 1).numFmt = PCT
        ws.getCell(rowN, firstValCol + oCols).font = { bold: true }
        ws.getCell(rowN, firstValCol + oCols + 1).font = { bold: true }
      }
    }
    r += 3
  }

  // ---------- 5. Conditions commerciales ----------
  r += 2
  section(r, '5. Conditions commerciales')
  r++
  const condLabels: Record<number, string> = { 1: 'Critère' }
  offres.forEach((o, i) => (condLabels[firstValCol + i] = o.fournisseur))
  header(r, condLabels)
  for (const cond of tco.conditions) {
    r++
    ws.getCell(r, 1).value = cond.critere
    ws.getCell(r, 1).font = { bold: true }
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' }
    let longest = 0
    offres.forEach((o, i) => {
      const v = cond.valeurs.find((x) => same(x.fournisseur, o.fournisseur))
      const cell = ws.getCell(r, firstValCol + i)
      cell.value = v?.valeur ?? 'Non précisé'
      cell.alignment = { wrapText: true, vertical: 'top' }
      if (v?.alerte) cell.font = { bold: true, color: { argb: RED } }
      longest = Math.max(longest, lineHeight(String(cell.value), 28))
    })
    ws.getRow(r).height = longest
  }

  // ---------- 6. Points à clarifier ----------
  r += 2
  section(r, '6. Points à clarifier avant adjudication')
  const order = { Bloquant: 0, Majeur: 1, Mineur: 2 }
  const points = [...tco.points_a_clarifier].sort((a, b) => order[a.gravite] - order[b.gravite])
  points.forEach((p, i) => {
    r++
    ws.getCell(r, 1).value = `${i + 1}.`
    ws.getCell(r, 1).alignment = { vertical: 'top', horizontal: 'right' }
    ws.mergeCells(r, 2, r, LAST_COL)
    const text = `${p.gravite === 'Mineur' ? '' : `[${p.gravite}] `}${p.texte}`
    ws.getCell(r, 2).value = text
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: 'top' }
    if (p.gravite === 'Bloquant') ws.getCell(r, 2).font = { bold: true, color: { argb: RED } }
    ws.getRow(r).height = lineHeight(text, 170)
  })
  for (const h of tco.hypotheses) {
    r++
    ws.getCell(r, 1).value = '[H]'
    ws.getCell(r, 1).alignment = { vertical: 'top', horizontal: 'right' }
    ws.mergeCells(r, 2, r, LAST_COL)
    ws.getCell(r, 2).value = h
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: 'top' }
    fill(ws.getCell(r, 2), HYPOTHESIS)
    ws.getRow(r).height = lineHeight(h, 170)
  }
  if (tco.recommandation) {
    r += 2
    section(r, '7. Recommandation provisoire')
    r++
    ws.mergeCells(r, 1, r, LAST_COL)
    ws.getCell(r, 1).value = tco.recommandation
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' }
    ws.getRow(r).height = lineHeight(tco.recommandation, 190)
  }

  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  return wb
}

/** Génère et télécharge le classeur TCO (formules actives, HT). */
export async function exportTcoExcel(tco: TcoResult, fileName: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = buildTcoWorkbook(tco, ExcelJS as unknown as typeof import('exceljs'))
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
