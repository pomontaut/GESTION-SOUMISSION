import seedRaw from './suppliersSeed.json'
import removedRaw from './suppliersSeedRemoved.json'
import categoriesRaw from './categories.json'
import type { SupplierRecord } from '../types'
import { uid } from '../types'

interface RawSupplierRow {
  category: string
  name: string
  nature: string
  frequency: string
  email: string
  referentAchat: string
  backupAchat: string
  contactContrat: string
  contactCommande: string
  zone: string
  status: string
  comments: string
  keywords?: string
  canPositions?: string
}

/** Incrémenter à chaque nouvelle version de la base fournisseurs (suppliersSeed.json). */
export const SUPPLIER_SEED_VERSION = '2026-10-28'

export const REMOVED_SUPPLIER_KEYS = removedRaw as { category: string; name: string }[]

export const ALL_CATEGORIES: string[] = categoriesRaw as string[]

export function buildSupplierSeed(): SupplierRecord[] {
  return (seedRaw as RawSupplierRow[]).map((r) => ({
    id: uid(),
    name: r.name,
    category: r.category,
    nature: r.nature,
    frequency: r.frequency,
    email: r.email,
    referentAchat: r.referentAchat,
    backupAchat: r.backupAchat,
    contactContrat: r.contactContrat,
    contactCommande: r.contactCommande,
    zone: r.zone,
    status: r.status,
    comments: r.comments,
    keywords: r.keywords,
    canPositions: r.canPositions,
  }))
}
