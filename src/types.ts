export type PrestationType = 'fourniture' | 'fourniture_pose'

export interface Calculator {
  name: string
  email: string
  phone: string
}

export const KNOWN_CALCULATORS: Calculator[] = [
  { name: 'Adrien Martino', email: 'amartino@induni.ch', phone: '076 490 58 17' },
  { name: 'Luca Bottaro', email: 'lbottaro@induni.ch', phone: '076 338 07 36' },
  { name: 'Bastien Preteseille', email: 'bpreteseille@induni.ch', phone: '022 879 01 01' },
  { name: 'Joana Rodrigues Dos Santos', email: 'jrodrigues@induni.ch', phone: '076 320 39 71' },
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
  retained: boolean
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
