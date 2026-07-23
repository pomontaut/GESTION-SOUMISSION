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
