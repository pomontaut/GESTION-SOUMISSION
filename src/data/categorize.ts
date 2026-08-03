import { ALL_CATEGORIES } from './suppliers'

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
    const [top] = suggestCategories(text, 1)
    if (top && !(top in examples)) examples[top] = text.trim().slice(0, 120)
  }
  const categories = Object.keys(examples)
  if (categories.length < 2) return null
  return { categories, examples }
}
