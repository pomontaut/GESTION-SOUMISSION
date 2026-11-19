import seedRaw from './suppliersSeed.json'
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
  cantons?: string[]
  keywords?: string
  can?: string
  controleHA?: boolean
}

/** Version de la liste officielle : à changer à chaque régénération (déclenche la synchronisation navigateur). */
export const SUPPLIERS_SEED_VERSION = '2026-11-19-base-fournisseur-ID_8472914'

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
    cantons: r.cantons ?? [],
    keywords: r.keywords ?? '',
    can: r.can ?? '',
    controleHA: r.controleHA ?? false,
    fromSeed: true,
  }))
}
