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

const normKey = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()
const supplierKey = (s: { category: string; name: string }): string => `${normKey(s.category)}|${normKey(s.name)}`
const SEED_VERSION_KEY = 'suppliersSeedVersion'

/**
 * Synchronise la base locale avec la liste officielle (seed) :
 * - base vide : tout est inséré ;
 * - nouvelle version de la liste : les fournisseurs (catégorie + nom) déjà présents sont mis à jour (e-mails,
 *   nature, fréquence, cantons, mots clefs, CAN) en gardant leur id (lots existants intacts) et leur statut /
 *   commentaires saisis ; les nouveaux sont ajoutés ; les anciens fournisseurs issus de la liste précédente et
 *   absents de la nouvelle sont retirés ; ceux créés à la main dans l'outil ne sont jamais touchés.
 */
export async function syncSuppliersSeed(seed: SupplierRecord[], version: string): Promise<void> {
  let current: string | null = null
  try { current = localStorage.getItem(SEED_VERSION_KEY) } catch { /* stockage indisponible */ }
  const existing = await listSuppliers()
  if (existing.length > 0 && current === version) return

  const db = await getDb()
  const tx = db.transaction('suppliers', 'readwrite')
  const byKey = new Map(existing.map((s) => [supplierKey(s), s]))
  const seedKeys = new Set(seed.map(supplierKey))
  const ops: Promise<unknown>[] = []
  for (const s of seed) {
    const old = byKey.get(supplierKey(s))
    if (!old) { ops.push(tx.store.put(s)); continue }
    ops.push(tx.store.put({
      ...old,
      nature: s.nature, frequency: s.frequency, email: s.email || old.email, cantons: s.cantons, zone: s.zone,
      keywords: s.keywords, can: s.can, controleHA: s.controleHA, fromSeed: true,
    }))
  }
  // Ancienne liste (avant le drapeau fromSeed, ou déjà synchronisée) : retirer ce qui n'y figure plus.
  // Sans version mémorisée, seuls les fournisseurs marqués fromSeed sont retirés ; les anciens enregistrements
  // non marqués sont retirés seulement s'ils correspondent à l'ancienne graine embarquée (créés par l'outil lui-même).
  for (const old of existing) {
    if (seedKeys.has(supplierKey(old))) continue
    if (old.fromSeed || (current === null && old.status !== undefined && old.nature !== undefined && old.referentAchat !== undefined))
      ops.push(tx.store.delete(old.id))
  }
  await Promise.all(ops)
  await tx.done
  try { localStorage.setItem(SEED_VERSION_KEY, version) } catch { /* ignoré */ }
}
