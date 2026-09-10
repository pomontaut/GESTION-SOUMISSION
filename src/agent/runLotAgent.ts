import type { Lot, SubmissionInfo, SupplierRecord } from '../types'
import { isSupplierActive, matchSuppliersForCategories } from '../data/matching'
import { buildLotEmail } from '../email/draftEmail'

/**
 * Runs, for every lot at once, the same detection→matching→drafting pipeline that used to be a
 * manual per-lot click-through (pick a category, add each matching supplier, hit "generate
 * email"): matches suppliers by category + nature/prestation, seeds the follow-up tracker, and
 * drafts the group e-mail. Lots are still freely editable afterwards (add/remove a supplier,
 * rewrite the e-mail) - this just removes the mandatory manual pass for the common case where the
 * automatic match is already right.
 */
export function runLotAgent(lots: Lot[], suppliers: SupplierRecord[], info: SubmissionInfo): Lot[] {
  return lots.map((lot) => {
    const matches = matchSuppliersForCategories(suppliers, lot.categories, lot.prestationType).filter(
      isSupplierActive,
    )
    const lotSuppliers = matches.map((s) => ({
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
      suppliers: lotSuppliers,
      followUp,
      emailSubject: subject,
      emailBody: body,
      emailGeneratedAt: new Date().toISOString(),
    }
  })
}
