import seedRaw from './suppliersSeed.json'
import categoriesRaw from './categories.json'
import legacyKeysRaw from './suppliersLegacyKeys.json'
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
  keywords?: string[]
}

export const ALL_CATEGORIES: string[] = categoriesRaw as string[]

/** Version de la base fournisseur embarquée : à incrémenter quand suppliersSeed.json change. */
export const SUPPLIER_BASE_VERSION = String((seedRaw as unknown[]).length) + '-' + (seedRaw as RawSupplierRow[]).reduce(
  (h, r) => (h * 31 + (r.name.length + (r.keywords?.length ?? 0) * 7 + r.category.length + r.email.length)) % 1000003,
  7,
)

export const supplierKey = (category: string, name: string): string => `${normalizeKey(category)}|${normalizeKey(name)}`

export function normalizeKey(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Clés (catégorie|nom) de l'ancienne base : ces fiches, non modifiées par la base, sont remplacées. */
export const LEGACY_SUPPLIER_KEYS = new Set<string>(legacyKeysRaw as string[])

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
    keywords: r.keywords ?? [],
    fromBase: true,
  }))
}
