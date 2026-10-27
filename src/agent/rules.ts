import type { Lot, SupplierRecord } from '../types'
import { isSupplierActive, matchSuppliersForCategories } from '../data/matching'

/** Règle exécutable créée via le chat (table agent_consignes, colonne rule). */
export interface AgentRule {
  id: string
  action: 'ajouter_fournisseur' | 'exclure_fournisseur' | 'ajouter_categorie'
  fournisseur?: string
  categorie?: string
  motsCles: string[]
  prestation?: 'fourniture' | 'fourniture_pose'
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Une règle vise un lot si le type de prestation convient et si un de ses mots-clés figure dans
 *  le libellé du lot / chapitre / sous-chapitre (sans mots-clés = tous les lots). */
export function ruleApplies(rule: AgentRule, lot: Lot): boolean {
  if (rule.prestation && rule.prestation !== lot.prestationType) return false
  if (!rule.motsCles?.length) return true
  const text = norm([lot.title, lot.chapterTitle, lot.subChapterTitle].join(' '))
  return rule.motsCles.some((k) => k && text.includes(norm(k)))
}

function findSupplier(suppliers: SupplierRecord[], name: string): SupplierRecord | undefined {
  const wanted = norm(name)
  return suppliers.find((s) => norm(s.name) === wanted)
}

/**
 * Applique les règles à la liste de fournisseurs d'un lot : ajouts (fournisseur ou catégorie
 * entière), puis exclusions. Les fournisseurs inactifs ne sont jamais ajoutés. `current` est la
 * liste déjà trouvée (matching par catégorie, apprentissages) ; renvoie aussi les catégories
 * du lot enrichies.
 */
export function applyRulesToLot(
  lot: Lot,
  current: SupplierRecord[],
  suppliers: SupplierRecord[],
  rules: AgentRule[],
): { suppliers: SupplierRecord[]; categories: string[] } {
  const active = rules.filter((r) => ruleApplies(r, lot))
  const result = [...current]
  const categories = [...lot.categories]
  const add = (s: SupplierRecord) => {
    if (isSupplierActive(s) && !result.some((x) => x.id === s.id)) result.push(s)
  }
  for (const r of active) {
    if (r.action === 'ajouter_categorie' && r.categorie) {
      if (!categories.some((c) => norm(c) === norm(r.categorie!))) categories.push(r.categorie)
      matchSuppliersForCategories(suppliers, [r.categorie], lot.prestationType).forEach(add)
    } else if (r.action === 'ajouter_fournisseur' && r.fournisseur) {
      const s = findSupplier(suppliers, r.fournisseur)
      if (s) add(s)
    }
  }
  const excluded = new Set(
    active
      .filter((r) => r.action === 'exclure_fournisseur' && r.fournisseur)
      .map((r) => findSupplier(suppliers, r.fournisseur!)?.id)
      .filter((id): id is string => !!id),
  )
  return { suppliers: result.filter((s) => !excluded.has(s.id)), categories }
}

/**
 * Applique les règles aux lots DÉJÀ extraits d'une soumission, sans écraser le travail manuel :
 * un fournisseur déjà présent sur le lot (même ignoré à la main) n'est pas rajouté, un
 * fournisseur à qui la consultation a déjà été envoyée n'est jamais retiré. Renvoie les lots
 * et le nombre de lots modifiés.
 */
export function applyRulesToExistingLots(
  lots: Lot[],
  suppliers: SupplierRecord[],
  rules: AgentRule[],
): { lots: Lot[]; changed: number } {
  let changed = 0
  const next = lots.map((lot) => {
    const sent = new Set(lot.followUp.filter((f) => f.status === 'envoye').map((f) => f.supplierId))
    const existing = lot.suppliers.map((a) => suppliers.find((s) => s.id === a.supplierId)).filter((s): s is SupplierRecord => !!s)
    const { suppliers: desired, categories } = applyRulesToLot(lot, existing, suppliers, rules)
    const known = new Set(lot.suppliers.map((a) => a.supplierId))
    const desiredIds = new Set(desired.map((s) => s.id))
    const toAdd = desired.filter((s) => !known.has(s.id))
    const toRemove = lot.suppliers.filter((a) => !desiredIds.has(a.supplierId) && !sent.has(a.supplierId))
    // seuls les fournisseurs visés par une règle d'exclusion sont retirés (pas les choix manuels)
    const removeIds = new Set(toRemove.map((a) => a.supplierId))
    if (toAdd.length === 0 && removeIds.size === 0 && categories.length === lot.categories.length) return lot
    changed++
    return {
      ...lot,
      categories,
      suppliers: [
        ...lot.suppliers.filter((a) => !removeIds.has(a.supplierId)),
        ...toAdd.map((s) => ({ supplierId: s.id, name: s.name, email: s.email, status: 'valide' as const })),
      ],
      followUp: [
        ...lot.followUp.filter((f) => !removeIds.has(f.supplierId)),
        ...toAdd.map((s) => ({
          supplierId: s.id,
          name: s.name,
          email: s.email,
          status: 'a_envoyer' as const,
          conforme: true,
          retained: false,
        })),
      ],
    }
  })
  return { lots: next, changed }
}
