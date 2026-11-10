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

// A trailing parenthetical on a category name is a brand/product qualifier ("ARMATURES DE
// POINCONNEMENT (DURA)", "PILIERS BETON (Orso B)") that a submission's chapter title
// essentially never repeats verbatim - a real lot titled "Armatures de poinçonnement" has no
// way to also say "DURA". Required only when it actually appears (the literal full-name check
// below still uses the untouched category name), never as part of the word-overlap ratio.
function stripQualifier(category: string): string {
  return category.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

// A category's required word and the word a real chapter title actually uses are sometimes a
// different derivation of the same real-world term, not just a plural - curated one confirmed
// pair at a time from real submissions, same spirit as STOPWORDS above:
//  - "ISOLANTS" (category noun) vs "isolation/isolations" (the verb-derived noun CAN titles use).
//  - "DESAMIANTAGE" (the trade name) vs "amiante" (what the text actually names: the material).
//  - "EXTRUDES" (category qualifier) vs "XPS" (the material's own name for extruded polystyrene,
//    almost always how a real position names it - "Swisspor XPS 300 SF").
const WORD_ALIASES: Record<string, string[]> = {
  ISOLANTS: ['ISOLATION', 'ISOLATIONS'],
  ISOLANT: ['ISOLATION', 'ISOLATIONS'],
  DESAMIANTAGE: ['AMIANTE'],
  EXTRUDES: ['XPS'],
}

// Tolerates a simple singular/plural mismatch between a category's word and the submission
// text ("APPUIS"/"un appui", "ETANCHEITE"/"étanchéités") - real chapter titles don't reliably
// use the same number as the category list, and the plain substring check below would
// otherwise miss both directions.
function haystackHasWord(haystack: string, word: string): boolean {
  // Whole-token matching (singular/plural tolerated), never a raw substring: "ESSAIS" used to be
  // found inside "NECESSAIRES" ("y compris rhabillage si nécessaire" is in almost every CAN article),
  // which proposed ESSAIS BETON suppliers (agnostic of nature) on any lot, e.g. a joint-injection
  // lot on "26-20 Surville 3". A long category word (>= 6 letters) may still match as the START of a
  // longer token (derived forms: ETANCHEITE/ETANCHEITES, ARMATURE/ARMATURES), never mid-word.
  const tokens = haystack.split(' ')
  const singular = word.endsWith('S') ? word.slice(0, -1) : word
  const hit = (w: string) =>
    tokens.some((t) => t === w || t === `${w}S` || (w.length >= 6 && t.startsWith(w)))
  if (hit(word) || hit(singular)) return true
  return (WORD_ALIASES[word] ?? []).some((alias) => hit(alias))
}

// Categories where ANY single trigger word is enough (the category name lists alternatives -
// "FORAGES / SCIAGES" is forage OR sciage - rather than words that must all appear together).
const CATEGORY_TRIGGERS: Record<string, string[]> = {
  'FORAGES SCIAGES': ['FORAGE', 'SCIAGE'],
}

/** Suggests likely supplier categories for a lot based on its title/content text. */
export function suggestCategories(text: string, max = 3): string[] {
  const haystack = normalize(text)
  const scored: { category: string; score: number }[] = []

  for (const category of ALL_CATEGORIES) {
    const normCat = normalize(category)
    if (!normCat) continue
    if (haystack.includes(normCat)) {
      scored.push({ category, score: 100 + normCat.length })
      continue
    }
    const triggers = CATEGORY_TRIGGERS[normCat]
    if (triggers?.some((t) => haystack.includes(t))) {
      scored.push({ category, score: 100 + normCat.length })
      continue
    }
    const words = significantWords(stripQualifier(category))
    if (words.length === 0) continue // category is only generic/stopword terms - too vague to match on
    const matched = words.filter((w) => haystackHasWord(haystack, w)).length
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

/**
 * Categories for a whole lot: the chapter title is the authoritative signal, the zone text
 * (textSample - up to ~800 chars of article descriptions) is only a fallback.
 *
 * Real errors on TPG Bachet de Pesay (16.10.2026): "130 Maconnerie en briques silico-calcaires"
 * also proposed ACIER ARMATURE suppliers (the article text mentions "armatures de joints en
 * acier"), and "814 chape ciment" also proposed Coupe-feu suppliers ("feuille de separation",
 * "protection", "coupe" matched COUPE/FEU/PROTECTION by plain substring). Both titles alone
 * categorize correctly; the body text added unrelated trades of the same weight. So when the
 * title yields at least one category, body text is ignored; it only helps lots whose title says
 * nothing usable (e.g. "R893 Toiture..." whose content is the real signal).
 */
export function suggestLotCategories(title: string, bodyText: string, max = 3): string[] {
  const fromTitle = suggestCategories(title, max)
  if (fromTitle.length > 0) return fromTitle
  return suggestCategories(`${title} ${bodyText}`, max)
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
