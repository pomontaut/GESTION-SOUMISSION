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

/** Singulier/pluriel : « GOUJON » doit retrouver la catégorie « GOUJONS » (et inversement). */
function stem(w: string): string {
  return w.length > 4 && w.endsWith('S') ? w.slice(0, -1) : w
}

/** Termes courants des soumissions qui désignent une catégorie sans reprendre son libellé. */
const CATEGORY_ALIASES: Record<string, string[]> = {
  'BRIQUE SILICO CALCAIRE': ['SILICOCALCAIRE', 'SILICO CALCAIRE', 'SILICE CALCAIRE', 'BLOC SILICO'],
  'BRIQUE TERRE CUITE': ['TERRE CUITE', 'TERRECUITE', 'BRIQUE ALVEOLAIRE', 'BRIQUE CREUSE'],
  GOUJONS: ['CISAILLEMENT', 'CRET'],
  // COMAX (Ancotech) = armatures d'attentes / de reprise, pas des goujons.
  'BOITES ATTENTES': ['COMAX', 'ARMATURES DE REPRISE', 'ARMATURES D ATTENTE'],
  BARTEC: ['BARTEC', 'ANCOFIX', 'ASSEMBLAGES ULTERIEURS', 'LIAISONS D ARMATURES PAR FILETAGE'],
  'CONSOLES ISOLANTES': ['ISOKORB', 'SCHOCK', 'DALLES EN PORTE A FAUX'],
  'ARMATURES DE POINCONNEMENT (DURA)': ['POINCONNEMENT', 'ANCOPLUS'],
}

function significantWords(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
}

/** Suggests likely supplier categories for a lot based on its title/content text. */
export function suggestCategories(text: string, max = 3, titleText = ''): string[] {
  const haystack = normalize(text)
  const titleHay = ` ${normalize(titleText)} `
  // Mots entiers uniquement (« ABRI » ne doit pas être trouvé dans « fabricant »), singulier ou pluriel.
  const padded = ` ${haystack} `
  const hasWord = (w: string) => padded.includes(` ${stem(w)} `) || padded.includes(` ${stem(w)}S `)
  const hasPhrase = (phrase: string) => {
    const parts = phrase.split(' ')
    const last = parts.pop() as string
    const head = parts.length ? parts.join(' ') + ' ' : ''
    return padded.includes(` ${head}${stem(last)} `) || padded.includes(` ${head}${stem(last)}S `)
  }
  const scored: { category: string; score: number }[] = []
  // Une catégorie citée dans le titre du (sous-)chapitre passe avant celle trouvée seulement dans le texte.
  const titleBonus = (words: string[]) => (words.some((w) => titleHay.includes(` ${stem(w)}`)) ? 60 : 0)

  for (const category of ALL_CATEGORIES) {
    const normCat = normalize(category)
    if (!normCat) continue
    const words = significantWords(category)
    if (words.length === 0) continue // category is only generic/stopword terms - too vague to match on
    const aliases = (CATEGORY_ALIASES[category] ?? []).map(normalize)
    if (hasPhrase(normCat) || aliases.some(hasPhrase)) {
      scored.push({ category, score: 100 + normCat.length + titleBonus([...words, ...aliases]) })
      continue
    }
    const matched = words.filter(hasWord).length
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
