import { ALL_CATEGORIES } from './suppliers'
import seedRaw from './suppliersSeed.json'
import type { SupplierRecord } from '../types'

const STOPWORDS = new Set([
  'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'EN', 'POUR', 'AVEC', 'SUR', 'AU', 'AUX', 'A', 'D',
  'ACC', 'SPECIAL', 'SPECIAUX', 'TYPE',
  // CAN boilerplate vocabulary: too generic (appears in almost every article) to be
  // discriminating for supplier-category matching.
  'MUR', 'MURS', 'DALLE', 'DALLES', 'RADIER', 'RADIERS', 'BETON', 'BETONNAGE', 'BETONNE',
  'COFFRAGE', 'COFFRAGES', 'ELEMENT', 'ELEMENTS', 'ELEMENTS', 'TRAVAUX', 'SURFACE', 'SURFACES',
  'ENSEMBLE', 'TOUTES', 'TOUTE', 'TOUS', 'COMPRIS', 'SUJETIONS', 'REPRISE', 'FOURNITURE', 'POSE',
  'EQUIVALENT', 'SELON', 'INDICATION', 'INDICATIONS', 'ARTICLE', 'ARTICLES', 'PLUS', 'VALUE',
  'PIECES', 'HAUTEUR', 'LARGEUR', 'EPAISSEUR', 'LONGUEUR', 'DIAMETRE', 'JUSQU', 'ENTRE',
])

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function significantWords(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
}

/** Mots clefs de recherche de la base fournisseur, regroupés par catégorie (normalisés, ≥ 4 caractères). */
const CATEGORY_KEYWORDS: Map<string, string[]> = (() => {
  const m = new Map<string, Set<string>>()
  for (const r of seedRaw as { category: string; keywords?: string[] }[]) {
    for (const k of r.keywords ?? []) {
      const nk = normalize(k)
      if (nk.length < 4) continue
      if (!m.has(r.category)) m.set(r.category, new Set())
      m.get(r.category)!.add(nk)
    }
  }
  return new Map([...m].map(([c, set]) => [c, [...set]]))
})()

/** Nombre de mots clefs du fournisseur retrouvés dans le texte (mot entier / expression). */
export function supplierKeywordHits(text: string, keywords: string[] | undefined): string[] {
  if (!keywords?.length) return []
  const hay = ` ${normalize(text)} `
  const hits: string[] = []
  for (const k of keywords) {
    const nk = normalize(k)
    if (nk.length >= 4 && hay.includes(` ${nk} `)) hits.push(k)
  }
  return hits
}

/** Fournisseurs de la base dont les mots clefs apparaissent dans le texte du lot, les plus pertinents d'abord. */
export function matchSuppliersByKeywords(
  text: string,
  suppliers: SupplierRecord[],
): { supplier: SupplierRecord; hits: string[] }[] {
  return suppliers
    .map((supplier) => ({ supplier, hits: supplierKeywordHits(text, supplier.keywords) }))
    .filter((m) => m.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length || a.supplier.name.localeCompare(b.supplier.name))
}

/** Suggests likely supplier categories for a lot based on its title/content text. */
export function suggestCategories(text: string, max = 3): string[] {
  const haystack = normalize(text)
  const scored: { category: string; score: number }[] = []

  for (const category of ALL_CATEGORIES) {
    const normCat = normalize(category)
    if (!normCat) continue
    const words = significantWords(category)
    if (words.length === 0) continue // category is only generic/stopword terms - too vague to match on
    if (haystack.includes(normCat)) {
      scored.push({ category, score: 100 + normCat.length })
      continue
    }
    const kwHits = (CATEGORY_KEYWORDS.get(category) ?? []).filter((k) => ` ${haystack} `.includes(` ${k} `))
    if (kwHits.length) {
      // mots clefs de la base fournisseur : signal fiable, pondéré par le nombre de mots retrouvés
      scored.push({ category, score: 60 + Math.min(kwHits.length, 5) * 5 })
      continue
    }
    const matched = words.filter((w) => haystack.includes(w)).length
    const ratio = matched / words.length
    if (ratio >= 0.75) {
      scored.push({ category, score: ratio * 50 + words.length })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const seen = new Set<string>()
  const result: string[] = []
  for (const s of scored) {
    if (seen.has(s.category)) continue
    seen.add(s.category)
    result.push(s.category)
    if (result.length >= max) break
  }
  return result
}

/** The single most likely category for one zone's text, or null if nothing matched. */
export function topCategoryFor(text: string): string | null {
  return suggestCategories(text, 1)[0] ?? null
}

export interface LotHeterogeneity {
  /** distinct top categories found, one per zone that matched something */
  categories: string[]
  /** zone text excerpt for each distinct category, for display */
  examples: Record<string, string>
}

/**
 * A lot is built by grouping every highlighted zone under the same chapter/sous-chapitre - but
 * that grouping says nothing about whether those zones actually describe similar products.
 * Categorizing each zone on its own (instead of the lot's title as a whole) and comparing the
 * results is a cheap way to flag a lot worth double-checking before it goes out to a single
 * supplier category.
 */
export function detectLotHeterogeneity(zoneTexts: string[]): LotHeterogeneity | null {
  const examples: Record<string, string> = {}
  for (const text of zoneTexts) {
    const top = topCategoryFor(text)
    if (top && !(top in examples)) examples[top] = text.trim().slice(0, 120)
  }
  const categories = Object.keys(examples)
  if (categories.length < 2) return null
  return { categories, examples }
}
