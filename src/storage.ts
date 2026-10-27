import type { Submission, SupplierRecord } from './types'
import type { AgentRule } from './agent/rules'

// Tracks, per submission id, the pdfData ArrayBuffer reference that is already
// in sync with the server, so we only re-upload the (potentially large) PDF
// binary when it actually changes rather than on every autosave.
const syncedPdf = new Map<string, ArrayBuffer | undefined>()

async function assertOk(res: Response): Promise<Response> {
  if (!res.ok) {
    let message = `Erreur ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return res
}

export async function listSubmissions(): Promise<Submission[]> {
  const res = await assertOk(await fetch('/api/submissions'))
  return res.json()
}

export async function getSubmission(id: string): Promise<Submission | undefined> {
  const res = await fetch(`/api/submissions/${id}`)
  if (res.status === 404) return undefined
  const submission: Submission = await assertOk(res).then((r) => r.json())

  const pdfRes = await fetch(`/api/submissions/${id}/pdf`)
  if (pdfRes.ok) {
    const buffer = await pdfRes.arrayBuffer()
    submission.pdfData = buffer
    syncedPdf.set(id, buffer)
  }
  return submission
}

export async function saveSubmission(submission: Submission): Promise<void> {
  const { pdfData, ...metadata } = submission
  await assertOk(
    await fetch(`/api/submissions/${submission.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    }),
  )

  if (syncedPdf.get(submission.id) === pdfData) return

  if (pdfData) {
    await assertOk(
      await fetch(`/api/submissions/${submission.id}/pdf`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: pdfData,
      }),
    )
  } else {
    await assertOk(await fetch(`/api/submissions/${submission.id}/pdf`, { method: 'DELETE' }))
  }
  syncedPdf.set(submission.id, pdfData)
}

export async function deleteSubmission(id: string): Promise<void> {
  await assertOk(await fetch(`/api/submissions/${id}`, { method: 'DELETE' }))
  syncedPdf.delete(id)
}

async function fetchSuppliers(): Promise<SupplierRecord[]> {
  const res = await assertOk(await fetch('/api/suppliers'))
  return res.json()
}

// Resolves once the bundled supplier list has been synced into the shared database (see
// initSuppliers) - listSuppliers waits on it so nothing reads a half-updated list at startup.
let suppliersReady: Promise<void> = Promise.resolve()

export async function listSuppliers(): Promise<SupplierRecord[]> {
  await suppliersReady
  return fetchSuppliers()
}

export async function saveSupplier(supplier: SupplierRecord): Promise<void> {
  await assertOk(
    await fetch(`/api/suppliers/${supplier.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supplier),
    }),
  )
}

export async function deleteSupplier(id: string): Promise<void> {
  await assertOk(await fetch(`/api/suppliers/${id}`, { method: 'DELETE' }))
}

export async function uploadOfferFile(submissionId: string, fileId: string, file: File): Promise<void> {
  await assertOk(
    await fetch(`/api/submissions/${submissionId}/offers/${fileId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
    }),
  )
}

export function offerFileUrl(submissionId: string, fileId: string): string {
  return `/api/submissions/${submissionId}/offers/${fileId}`
}

export async function deleteOfferFile(submissionId: string, fileId: string): Promise<void> {
  await assertOk(await fetch(`/api/submissions/${submissionId}/offers/${fileId}`, { method: 'DELETE' }))
}

export interface LotSupplierLearning {
  cfcCode: string
  chapterCode: string
  titleKey?: string // libellé normalisé du lot, voir lotTitleKey()
  supplierId: string
}

/** Lot title without its leading code ("814 Chape ciment..." -> "chape ciment..."), lowercased,
 *  accent/punctuation-free - the part of a lot's wording that stays the same across bureaus. */
export function lotTitleKey(title: string): string {
  const key = title
    .replace(/^\s*[A-Za-z]?\s?\d[\d.\s]*/, '') // code token (814, R898, 211.6...)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return key.length >= 8 ? key : ''
}

/** Called whenever a supplier is added BY HAND to a lot: records the pairing both by CAN code and
 *  by the lot's wording, so the next analysis proposes it automatically. Best-effort. */
export function learnManualSupplier(lot: { cfcCode: string; chapterCode: string; title: string }, supplierId: string): void {
  saveLotSupplierLearning({
    cfcCode: lot.cfcCode,
    chapterCode: lot.chapterCode,
    titleKey: lotTitleKey(lot.title),
    supplierId,
  }).catch((err) => console.warn("Apprentissage fournisseur/lot non enregistré :", err))
}

export async function listLotSupplierLearnings(): Promise<LotSupplierLearning[]> {
  const res = await assertOk(await fetch('/api/learnings'))
  return res.json()
}

/**
 * Records that a supplier was manually attached to a lot for this CFC/chapter, so the next
 * submission with the same (standardized) code proposes it automatically instead of relying
 * only on suggestCategories, which can miss or misfire on some chapter titles.
 */
export async function saveLotSupplierLearning(entry: LotSupplierLearning): Promise<void> {
  await assertOk(
    await fetch('/api/learnings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }),
  )
}

export async function listAgentRules(): Promise<AgentRule[]> {
  try {
    return await assertOk(await fetch('/api/agent-chat/rules')).then((r) => r.json())
  } catch (err) {
    console.warn('Règles du chat indisponibles', err)
    return []
  }
}

export async function sendLotEmail(params: {
  bcc: string[]
  subject: string
  text: string
  html?: string
  attachment?: { filename: string; content: string }
}): Promise<void> {
  await assertOk(
    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }),
  )
}

/**
 * Tops up the shared supplier list to at least the bundled seed's size. A plain "only if empty"
 * check would never pick up a bigger/updated seed once any suppliers already exist (e.g. the
 * previous, much smaller placeholder list) - comparing counts instead lets a genuine catalog
 * update (more suppliers bundled in the app than currently stored) replace the stale data, while
 * still leaving things alone once the real catalog is in place.
 */
export async function seedSuppliersIfEmpty(seed: SupplierRecord[]): Promise<void> {
  const existing = await fetchSuppliers()
  if (existing.length >= seed.length) return
  await Promise.all(existing.map((s) => deleteSupplier(s.id)))
  await Promise.all(seed.map((s) => saveSupplier(s)))
}

const normKey = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean).join(' ')
const supplierKey = (s: SupplierRecord) => `${normKey(s.category)}|${normKey(s.name)}`
const FILLABLE_FIELDS = ['email', 'nature', 'frequency', 'backupAchat', 'contactContrat', 'contactCommande', 'zone', 'comments'] as const

/**
 * The count-based top-up above only fires when the bundled list has MORE suppliers than the
 * database - so a seed update that only fills in missing e-mails (same supplier count) never
 * reached the shared database, and lots kept coming out with empty addresses. This fills in the
 * blanks from the bundled list, matched on (catégorie, nom): existing records keep their id and
 * anything already filled in (an address an acheteur corrected by hand is never overwritten).
 * Suppliers missing from the database are added, but only once per SUPPLIER_SEED_VERSION so a
 * supplier deleted on purpose doesn't come back on every page load.
 */
const baseName = (n: string) => normKey(n.replace(/\(.*?\)/g, ' '))
function sameSupplierRenamed(a: SupplierRecord, b: SupplierRecord): boolean {
  if (normKey(a.category) !== normKey(b.category)) return false
  const x = baseName(a.name)
  const y = baseName(b.name)
  return x.length >= 4 && x === y
}

async function refreshSuppliersFromSeed(seed: SupplierRecord[], version: string): Promise<void> {
  const versionKey = 'supplierSeedVersion'
  let versionDone = false
  try {
    versionDone = localStorage.getItem(versionKey) === version
  } catch {
    // storage unavailable: fall through and only fill blanks
  }
  const existing = await fetchSuppliers()
  const byKey = new Map(existing.map((s) => [supplierKey(s), s]))
  const writes: SupplierRecord[] = []
  for (const s of seed) {
    // Same supplier under a slightly different label (e.g. "KUBRIX (FBB)" renamed "Kubrix") counts
    // as a match too, so renames in the reference file fill the existing record instead of duplicating it.
    const found = byKey.get(supplierKey(s)) ?? existing.find((e) => sameSupplierRenamed(e, s))
    if (!found) {
      if (!versionDone) writes.push(s)
      continue
    }
    const patch: Partial<SupplierRecord> = {}
    for (const f of FILLABLE_FIELDS) {
      if (!(found[f] ?? '').trim() && (s[f] ?? '').trim()) patch[f] = s[f]
    }
    if (Object.keys(patch).length > 0) writes.push({ ...found, ...patch })
  }
  for (let i = 0; i < writes.length; i += 25) await Promise.all(writes.slice(i, i + 25).map((s) => saveSupplier(s)))
  try {
    localStorage.setItem(versionKey, version)
  } catch {
    // not critical
  }
}

export function initSuppliers(seed: SupplierRecord[], version: string): Promise<void> {
  suppliersReady = seedSuppliersIfEmpty(seed)
    .then(() => refreshSuppliersFromSeed(seed, version))
    .catch((err) => console.error('Mise à jour de la base fournisseurs impossible', err))
  return suppliersReady
}
