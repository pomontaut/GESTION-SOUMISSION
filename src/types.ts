export type PrestationType = 'fourniture' | 'fourniture_pose'

export interface SubmissionInfo {
  projectName: string
  submissionNumber: string
  siteLocation: string
  entity: string
  requesterName: string
  requesterEmail: string
  deadline: string // yyyy-mm-dd
  documentsLink: string
  logoDataUrl?: string
  progressStatus: 'en_cours' | 'termine' | 'annule'
  approvalStatus: 'en_attente' | 'approuve' | 'refuse'
}

export const emptySubmissionInfo = (): SubmissionInfo => ({
  projectName: '',
  submissionNumber: '',
  siteLocation: '',
  entity: '',
  requesterName: '',
  requesterEmail: '',
  deadline: '',
  documentsLink: '',
  progressStatus: 'en_cours',
  approvalStatus: 'en_attente',
})

/** A single highlighted paragraph/article detected on a page. */
export interface DetectedZone {
  id: string
  page: number
  chapterCode: string // e.g. "423" or "500"
  chapterTitle: string // e.g. "Incorporés spéciaux pour coffrages de reprise"
  cfcCode: string // e.g. "241"
  text: string
  color: 'jaune' | 'autre'
  articleNumber?: string
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
  chapterRef: string // e.g. "423"
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
  detailText?: string
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
  email: string
  category: string
  note?: string
}

export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
