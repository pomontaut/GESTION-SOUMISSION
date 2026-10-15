export type PrestationType = 'fourniture' | 'fourniture_pose'

export interface Calculator {
  name: string
  email: string
  phone: string
  // Which entities this calculator handles requests for - the "Calculateur" dropdown filters to
  // these so the acheteur only ever sees the people actually assigned to the selected entity.
  entities: string[]
}

export const KNOWN_CALCULATORS: Calculator[] = [
  { name: 'Adrien Martino', email: 'amartino@induni.ch', phone: '076 490 58 17', entities: ['BAT GE'] },
  { name: 'Luca Bottaro', email: 'lbottaro@induni.ch', phone: '076 338 07 36', entities: ['GC'] },
  { name: 'Bastien Preteseille', email: 'bpreteseille@induni.ch', phone: '022 879 01 01', entities: ['GC'] },
  { name: 'Joana Rodrigues Dos Santos', email: 'jrodrigues@induni.ch', phone: '076 320 39 71', entities: ['BAT VD'] },
  { name: 'Lucas Mouaz', email: 'lmouaz@induni.ch', phone: '+41 76 380 83 45', entities: ['BAT VD'] },
]

export const ENTITY_OPTIONS = ['BAT GE', 'BAT VD', 'GC', 'TRANSFO GE', 'TRANSFO VD']

export interface SubmissionInfo {
  siteNumber: string // N° de chantier
  projectName: string // Nom du chantier
  siteLocation: string
  entity: string
  calculatorName: string
  calculatorEmail: string
  calculatorPhone: string
  deadline: string // yyyy-mm-dd
  documentsLink: string
  logoDataUrl?: string
  progressStatus: 'en_cours' | 'termine' | 'annule'
  approvalStatus: 'en_attente' | 'approuve' | 'refuse'
}

export const emptySubmissionInfo = (): SubmissionInfo => ({
  siteNumber: '',
  projectName: '',
  siteLocation: '',
  entity: '',
  calculatorName: '',
  calculatorEmail: '',
  calculatorPhone: '',
  deadline: '',
  documentsLink: '',
  progressStatus: 'en_cours',
  approvalStatus: 'en_attente',
})

/** A single highlighted paragraph/article detected on a page. */
export interface DetectedZone {
  id: string
  page: number
  chapterCode: string // major/dashed header, e.g. "440"
  chapterTitle: string
  subChapterCode: string // leaf header, e.g. "442"
  subChapterTitle: string
  cfcCode: string // e.g. "241"
  text: string
  color: 'jaune' | 'autre'
}

export interface SupplierAssignment {
  supplierId: string
  name: string
  email: string
  status: 'a_valider' | 'ignore' | 'valide'
}

export interface FollowUpEntry {
  supplierId: string
  name: string
  email: string
  status: 'a_envoyer' | 'envoye'
  sentDate?: string
  relanceDate?: string
  estimatedAmount?: string
  offeredAmount?: string
  conforme: boolean
  returnDate?: string
  notes?: string
  offerFileName?: string
  offerFileId?: string
  retained: boolean
  // Minimal structured fields confirmed recurring across nearly every real comparatif studied
  // (see .claude/agents/comparatif-tco.md) - short free strings, not controlled dropdowns, since
  // the real corpus uses too many different units/formats (weeks, dates, %/days, one-line
  // motives) for a controlled field to fit without becoming friction or too restrictive.
  deliveryTime?: string // "8 semaines" / "12.11.2026"
  offerValidUntil?: string // date - lets the generated TCO flag an offer that's already expired
  paymentTerms?: string // "30 jours net" / "40/50/10%"
  nonConformityReason?: string // shown only when conforme === false
}

/** One CAN métré article/position within a lot, priced per fournisseur - no supplier sends this
 *  back in a common structured format, so it's entered by hand (see DashboardTab) rather than
 *  extracted automatically, unlike the single lump `offeredAmount` in FollowUpEntry.
 *
 *  `quantity`/`unit` are shared across every fournisseur (it's the buyer's own métré, not
 *  supplier-specific), while `unitPrices` is the fournisseur's PU (prix unitaire, HT) for this
 *  article - the position's total is always computed as quantity × PU, never entered directly.
 *  This is deliberate: a fournisseur's offer routinely gives only a PU per line with no total and
 *  no quantity of its own (confirmed real case) - since the quantity is the same métré for every
 *  fournisseur regardless of who supplied it, entering it once here means a fournisseur who only
 *  gave PUs is still fully comparable, instead of that position staying uncomputable for them. */
export interface LotPosition {
  id: string
  code: string // e.g. "541.201"
  title: string
  quantity?: string
  unit?: string // e.g. "m2", "kg", "pce"
  unitPrices: Record<string, string> // supplierId -> PU (HT, free text like the other CHF fields)
}

export interface Lot {
  id: string
  title: string
  cfcCode: string
  chapterCode: string
  chapterTitle: string
  subChapterCode: string
  subChapterTitle: string
  prestationType: PrestationType
  pages: number[]
  positionCount: number
  zoneIds: string[]
  validated: boolean
  categories: string[]
  suppliers: SupplierAssignment[]
  followUp: FollowUpEntry[]
  positions?: LotPosition[]
  emailSubject?: string
  emailBody?: string
  emailGeneratedAt?: string
}

export interface Submission {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  info: SubmissionInfo
  pdfFileName?: string
  pdfData?: ArrayBuffer
  zones: DetectedZone[]
  lots: Lot[]
}

export interface SupplierRecord {
  id: string
  name: string
  category: string
  email: string
  nature?: string // Fourniture / Sous-traitance / Mixte
  frequency?: string // Récurrent / Ponctuel
  referentAchat?: string
  backupAchat?: string
  contactContrat?: string
  contactCommande?: string
  zone?: string
  status?: string // Actif / à confirmer, Ne pas consulter, Inactif / à exclure
  comments?: string
}

export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
