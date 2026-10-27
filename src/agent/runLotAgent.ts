import type { Lot, SubmissionInfo, SupplierRecord } from '../types'
import { lotTitleKey, type LotSupplierLearning } from '../storage'
import { isSupplierActive, matchSuppliersForCategories } from '../data/matching'
import { buildLotEmail } from '../email/draftEmail'
import { applyRulesToLot, type AgentRule } from './rules'

/**
 * Runs, for every lot at once, the same detection→matching→drafting pipeline that used to be a
 * manual per-lot click-through (pick a category, add each matching supplier, hit "generate
 * email"): matches suppliers by category + nature/prestation, seeds the follow-up tracker, and
 * drafts the group e-mail. Lots are still freely editable afterwards (add/remove a supplier,
 * rewrite the e-mail) - this just removes the mandatory manual pass for the common case where the
 * automatic match is already right.
 *
 * `learnings` are past manual supplier picks recorded per (CFC code, chapter code) - CAN codes
 * are a national standard, not project-specific, so "chapter 172 under CFC 211.5" means the same
 * thing on every submission. They're applied on top of the category match, not instead of it, so
 * a chapter that categorize.ts still handles fine keeps working exactly as before.
 */
export function runLotAgent(
  lots: Lot[],
  suppliers: SupplierRecord[],
  info: SubmissionInfo,
  learnings: LotSupplierLearning[] = [],
  rules: AgentRule[] = [],
): Lot[] {
  const suppliersById = new Map(suppliers.map((s) => [s.id, s]))
  return lots.map((lot) => {
    const matches = matchSuppliersForCategories(suppliers, lot.categories, lot.prestationType).filter(
      isSupplierActive,
    )
    const titleKey = lotTitleKey(lot.title)
    const learnedMatches = learnings
      .filter((l) =>
        l.titleKey
          ? titleKey !== '' && l.titleKey === titleKey
          : l.chapterCode !== '' && l.cfcCode === lot.cfcCode && l.chapterCode === lot.chapterCode,
      )
      .map((l) => suppliersById.get(l.supplierId))
      .filter((s): s is SupplierRecord => s !== undefined)
      .filter(isSupplierActive)
    const learned = [...matches, ...learnedMatches.filter((s) => !matches.some((m) => m.id === s.id))]
    // Règles créées via le chat : ajouts/exclusions de fournisseurs et de catégories.
    const { suppliers: allMatches, categories } = applyRulesToLot(lot, learned, suppliers, rules)
    const lotSuppliers = allMatches.map((s) => ({
      supplierId: s.id,
      name: s.name,
      email: s.email,
      status: 'valide' as const,
    }))
    const followUp = lotSuppliers.map((s) => ({
      supplierId: s.supplierId,
      name: s.name,
      email: s.email,
      status: 'a_envoyer' as const,
      conforme: true,
      retained: false,
    }))
    const { subject, body } = buildLotEmail(lot, info)
    return {
      ...lot,
      categories,
      suppliers: lotSuppliers,
      followUp,
      emailSubject: subject,
      emailBody: body,
      emailGeneratedAt: new Date().toISOString(),
    }
  })
}
