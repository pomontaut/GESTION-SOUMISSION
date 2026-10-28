import type { Lot, PrestationType, SupplierRecord } from '../types'

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

/**
 * Categories that are services (lab testing), not goods: the supplier base labels their
 * suppliers "Fourniture" (BTEST, LCBE, INFRALAB, ERTEC under ESSAIS BETON) only because nothing
 * is "installed", yet the lot is usually highlighted as fourniture+pose (non-yellow). The nature
 * rule would then exclude all of them. Real error, chantier "Halle industrielle" (16.10.2026):
 * lot "simple essai de resistance a la compression" got no supplier, added by hand. For these
 * categories nature is ignored (status filtering still applies).
 */
export const NATURE_AGNOSTIC_CATEGORIES = ['essais beton', 'test labo', 'forages / sciages', 'carottage']

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
  return suppliers.filter((s) => wanted.has(norm(s.category)) &&
      (NATURE_AGNOSTIC_CATEGORIES.includes(norm(s.category)) || natureMatchesPrestation(s.nature, prestationType)),
  )
}

// Une société = son nom (sans parenthèses ni casse), quelle que soit la catégorie ou l'adresse
// renseignée sur chaque ligne de la base (Bewetec sous GOUJONS et sous ARMATURES = un seul Bewetec).
export const companyKey = (name: string) => name.toLowerCase().replace(/\(.*?\)/g, ' ').split(/\s+/).filter(Boolean).join(' ')

/**
 * Une même société ne doit figurer qu'une fois sur un lot : la base peut contenir plusieurs lignes
 * pour elle (une par catégorie, ou des doublons d'anciens imports), d'où des fournisseurs affichés
 * deux fois, notamment en groupant des lots de catégories différentes. Garde une ligne par société,
 * de préférence celle dont la consultation a déjà été envoyée, sinon celle qui a une adresse e-mail ;
 * renvoie le même lot (même référence) s'il n'y a rien à retirer.
 */
export function dedupeLotSuppliers(lot: Lot): Lot {
  const sentIds = new Set(lot.followUp.filter((f) => f.status === 'envoye').map((f) => f.supplierId))
  const keeper = new Map<string, string>()
  const byId = new Map(lot.suppliers.map((s) => [s.supplierId, s]))
  const rank = (id: string) => (sentIds.has(id) ? 2 : (byId.get(id)?.email ?? '').trim() ? 1 : 0)
  for (const s of lot.suppliers) {
    const k = companyKey(s.name)
    const current = keeper.get(k)
    if (!current || rank(s.supplierId) > rank(current)) keeper.set(k, s.supplierId)
  }
  const keep = new Set(keeper.values())
  if (keep.size === lot.suppliers.length && lot.followUp.every((f) => keep.has(f.supplierId) || !lot.suppliers.some((s) => s.supplierId === f.supplierId))) {
    return lot
  }
  const seenFollow = new Set<string>()
  return {
    ...lot,
    suppliers: lot.suppliers.filter((s) => keep.has(s.supplierId)),
    followUp: lot.followUp.filter((f) => {
      const sup = lot.suppliers.find((s) => s.supplierId === f.supplierId)
      if (sup && !keep.has(f.supplierId)) return false
      if (seenFollow.has(f.supplierId)) return false
      seenFollow.add(f.supplierId)
      return true
    }),
  }
}
