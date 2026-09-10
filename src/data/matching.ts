import type { PrestationType, SupplierRecord } from '../types'

export const INACTIVE_STATUSES = ['Ne pas consulter', 'Inactif / à exclure']

/**
 * "Nature" in the supplier base tells apart pure material suppliers from subcontractors:
 * "Fourniture" only supplies goods, "Sous-traitance" both supplies and installs, and "Mixte" does
 * either depending on the job. A fourniture-only lot has no business going to a pure
 * sous-traitant (they don't just deliver), and a fourniture+pose lot needs someone who installs.
 * Suppliers with no nature on file are never excluded - missing data shouldn't hide a match.
 */
export function natureMatchesPrestation(nature: string | undefined, prestationType: PrestationType): boolean {
  const n = (nature ?? '').trim().toLowerCase()
  if (!n || n === 'mixte') return true
  return prestationType === 'fourniture' ? n === 'fourniture' : n === 'sous-traitance'
}

export function isSupplierActive(s: SupplierRecord): boolean {
  return !INACTIVE_STATUSES.includes(s.status ?? '')
}

/** Suppliers whose category is one of the lot's and whose nature fits the prestation type. */
export function matchSuppliersForCategories(
  suppliers: SupplierRecord[],
  categories: string[],
  prestationType: PrestationType,
): SupplierRecord[] {
  if (!categories.length) return []
  const norm = (s: string) => s.trim().toLowerCase()
  const wanted = new Set(categories.map(norm))
  return suppliers.filter((s) => wanted.has(norm(s.category)) && natureMatchesPrestation(s.nature, prestationType))
}
