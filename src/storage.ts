import { openDB, type IDBPDatabase } from 'idb'
import type { Submission, SupplierRecord } from './types'

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

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const supplierKey = (s: { category: string; name: string }) => `${norm(s.category)}|${norm(s.name)}`

/**
 * Met à jour la base fournisseurs locale vers une nouvelle version du seed :
 * fournisseurs retrouvés (catégorie + nom) mis à jour sur place (id, statut et
 * commentaires locaux conservés), nouveaux ajoutés, anciens retirés du seed supprimés.
 * Les fournisseurs créés à la main (absents des deux seeds) ne sont pas touchés.
 */
export async function syncSupplierSeed(
  seed: SupplierRecord[],
  removed: { category: string; name: string }[],
  version: string,
): Promise<void> {
  const KEY = 'suppliersSeedVersion'
  try {
    if (localStorage.getItem(KEY) === version) return
  } catch {
    /* localStorage indisponible : on resynchronise */
  }
  const existing = await listSuppliers()
  if (existing.length === 0) {
    await seedSuppliersIfEmpty(seed)
  } else {
    const byKey = new Map(existing.map((s) => [supplierKey(s), s]))
    const removedKeys = new Set(removed.map(supplierKey))
    const seedKeys = new Set(seed.map(supplierKey))
    const db = await getDb()
    const tx = db.transaction('suppliers', 'readwrite')
    const ops: Promise<unknown>[] = []
    for (const s of seed) {
      const cur = byKey.get(supplierKey(s))
      if (!cur) {
        ops.push(tx.store.put(s))
        continue
      }
      ops.push(
        tx.store.put({
          ...cur,
          name: s.name,
          category: s.category,
          nature: s.nature,
          frequency: s.frequency,
          email: s.email,
          zone: s.zone,
          keywords: s.keywords,
          canPositions: s.canPositions,
        }),
      )
    }
    for (const s of existing) {
      const k = supplierKey(s)
      if (removedKeys.has(k) && !seedKeys.has(k)) ops.push(tx.store.delete(s.id))
    }
    await Promise.all(ops)
    await tx.done
  }
  try {
    localStorage.setItem(KEY, version)
  } catch {
    /* ignore */
  }
}
