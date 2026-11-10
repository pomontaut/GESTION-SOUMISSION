import { openDB, type IDBPDatabase } from 'idb'
import type { Submission, SupplierRecord } from './types'
import { LEGACY_SUPPLIER_KEYS, SUPPLIER_BASE_VERSION, supplierKey } from './data/suppliers'

const DB_NAME = 'sourcing-soumission'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('submissions')) {
          db.createObjectStore('submissions', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('suppliers')) {
          db.createObjectStore('suppliers', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export async function listSubmissions(): Promise<Submission[]> {
  const db = await getDb()
  const all = await db.getAll('submissions')
  return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export async function getSubmission(id: string): Promise<Submission | undefined> {
  const db = await getDb()
  return db.get('submissions', id)
}

export async function saveSubmission(submission: Submission): Promise<void> {
  const db = await getDb()
  await db.put('submissions', submission)
}

export async function deleteSubmission(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('submissions', id)
}

export async function listSuppliers(): Promise<SupplierRecord[]> {
  const db = await getDb()
  return db.getAll('suppliers')
}

export async function saveSupplier(supplier: SupplierRecord): Promise<void> {
  const db = await getDb()
  await db.put('suppliers', supplier)
}

export async function deleteSupplier(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('suppliers', id)
}

export async function seedSuppliersIfEmpty(seed: SupplierRecord[]): Promise<void> {
  const existing = await listSuppliers()
  if (existing.length > 0) return
  const db = await getDb()
  const tx = db.transaction('suppliers', 'readwrite')
  await Promise.all(seed.map((s) => tx.store.put(s)))
  await tx.done
}

/**
 * Mémorise la base fournisseur Induni : à chaque nouvelle version embarquée, fusionne dans la base
 * locale (clé catégorie + nom). Met à jour e-mails, nature, zones et mots clefs ; ajoute les nouveaux ;
 * retire les anciennes fiches du seed remplacées ; conserve les fournisseurs ajoutés à la main, les
 * statuts « Ne pas consulter / Inactif » et les e-mails déjà saisis quand la base n'en donne pas.
 */
export async function syncSuppliersFromBase(seed: SupplierRecord[]): Promise<void> {
  const VERSION_KEY = 'supplierBaseVersion'
  try {
    if (localStorage.getItem(VERSION_KEY) === SUPPLIER_BASE_VERSION) return
  } catch {
    /* pas de localStorage : on fusionne à chaque fois (idempotent) */
  }
  const existing = await listSuppliers()
  if (existing.length === 0) {
    await seedSuppliersIfEmpty(seed)
  } else {
    const byKey = new Map(existing.map((s) => [supplierKey(s.category, s.name), s]))
    const seedKeys = new Set(seed.map((s) => supplierKey(s.category, s.name)))
    const db = await getDb()
    const tx = db.transaction('suppliers', 'readwrite')
    for (const s of seed) {
      const cur = byKey.get(supplierKey(s.category, s.name))
      if (!cur) {
        await tx.store.put(s)
        continue
      }
      const inactive = cur.status === 'Ne pas consulter' || cur.status === 'Inactif / à exclure'
      await tx.store.put({
        ...cur,
        category: s.category,
        name: s.name,
        nature: s.nature || cur.nature,
        frequency: s.frequency || cur.frequency,
        email: s.email || cur.email,
        zone: s.zone || cur.zone,
        keywords: s.keywords,
        status: inactive ? cur.status : s.status,
        fromBase: true,
      })
    }
    for (const cur of existing) {
      const k = supplierKey(cur.category, cur.name)
      if (!seedKeys.has(k) && (cur.fromBase || LEGACY_SUPPLIER_KEYS.has(k))) await tx.store.delete(cur.id)
    }
    await tx.done
  }
  try {
    localStorage.setItem(VERSION_KEY, SUPPLIER_BASE_VERSION)
  } catch {
    /* ignore */
  }
}
