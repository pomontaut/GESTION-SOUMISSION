import type { DetectedZone, Lot, Submission, SupplierRecord } from '../types'
import { uid } from '../types'
import type { ImportedGrid } from '../import/gridImport'
import { buildLotEmail } from '../email/draftEmail'
import { dedupeLotSuppliers } from '../data/matching'

type Assignment = { lot: string; titre: string; zoneIds: string[] }

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Repli sans IA : un lot = les positions dont le n° CFC / sous-chapitre / chapitre figure dans le libellé de colonne. */
function byCode(grid: ImportedGrid, zones: DetectedZone[]): Assignment[] {
  return grid.lotLabels.map((label) => {
    const words = norm(label).split(' ')
    const ids = zones
      .filter((z) => [z.cfcCode, z.subChapterCode, z.chapterCode].filter(Boolean).some((c) => words.includes(norm(c))))
      .map((z) => z.id)
    return { lot: label, titre: label, zoneIds: ids }
  })
}

async function askAgent(grid: ImportedGrid, zones: DetectedZone[], projectName: string): Promise<Assignment[]> {
  const res = await fetch('/api/lots-from-grid', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectName,
      grid: {
        lots: grid.lotLabels,
        fournisseurs: grid.suppliers.map((s) => ({ nom: s.name, lots_consultes: grid.lotLabels.filter((_, i) => s.lots[i]) })),
      },
      zones: zones.map((z) => ({
        id: z.id,
        page: z.page,
        cfc: z.cfcCode,
        chapitre: `${z.chapterCode} ${z.chapterTitle}`.trim(),
        sous_chapitre: `${z.subChapterCode} ${z.subChapterTitle}`.trim(),
        texte: z.text.slice(0, 600),
      })),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.lots as Assignment[]
}

export interface RebuildReport {
  lots: Lot[]
  unassignedZones: number
  usedAgent: boolean
  warning?: string
}

/** Refait les lots (positions du PDF + grille importée) ; fournisseurs de chaque lot = les X de la grille. */
export async function rebuildLotsFromGrid(
  submission: Submission,
  grid: ImportedGrid,
  knownSuppliers: SupplierRecord[],
): Promise<RebuildReport> {
  const zones = submission.zones
  let assignments: Assignment[]
  let usedAgent = false
  let warning: string | undefined
  try {
    if (!zones.length) throw new Error('aucune position détectée dans le PDF')
    assignments = await askAgent(grid, zones, submission.info.projectName || submission.name)
    usedAgent = true
  } catch (e) {
    warning = `Agent indisponible (${e instanceof Error ? e.message : e}) : répartition par n° CFC seulement.`
    assignments = byCode(grid, zones)
  }

  const zoneById = new Map(zones.map((z) => [z.id, z]))
  const taken = new Set<string>()
  const byName = new Map(knownSuppliers.map((s) => [norm(s.name), s]))
  const lots: Lot[] = grid.lotLabels.map((label, i) => {
    const a = assignments.find((x) => norm(x.lot) === norm(label))
    const ids = (a?.zoneIds ?? []).filter((id) => zoneById.has(id) && !taken.has(id))
    ids.forEach((id) => taken.add(id))
    const lz = ids.map((id) => zoneById.get(id)!)
    const first = lz[0]
    const suppliers = grid.suppliers
      .filter((s) => s.lots[i])
      .map((s) => {
        const k = byName.get(norm(s.name))
        return {
          supplierId: k?.id ?? `grille-${norm(s.name).replace(/ /g, '-')}`,
          name: k?.name ?? s.name,
          email: k?.email ?? '',
          status: 'valide' as const,
        }
      })
    const base: Lot = {
      id: uid(),
      title: a?.titre || label,
      cfcCode: first?.cfcCode || label,
      chapterCode: first?.chapterCode ?? '',
      chapterTitle: first?.chapterTitle ?? '',
      subChapterCode: first?.subChapterCode ?? '',
      subChapterTitle: first?.subChapterTitle ?? '',
      prestationType: lz.length > 0 && lz.every((z) => z.color === 'jaune') ? 'fourniture' : 'fourniture_pose',
      pages: Array.from(new Set(lz.map((z) => z.page))).sort((x, y) => x - y),
      positionCount: lz.length,
      zoneIds: ids,
      validated: false,
      categories: Array.from(new Set(suppliers.map((s) => byName.get(norm(s.name))?.category).filter(Boolean) as string[])),
      suppliers,
      followUp: suppliers.map((s) => ({ supplierId: s.supplierId, name: s.name, email: s.email, status: 'a_envoyer' as const, conforme: true, retained: false })),
    }
    const { subject, body } = buildLotEmail(base, submission.info)
    return dedupeLotSuppliers({ ...base, emailSubject: subject, emailBody: body, emailGeneratedAt: new Date().toISOString() })
  })
  return { lots, unassignedZones: zones.length - taken.size, usedAgent, warning }
}
