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

const normKey = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean).join(' ')
const baseName = (n: string) => normKey(n.replace(/\(.*?\)/g, ' '))
const supplierKey = (s: SupplierRecord) => `${normKey(s.category)}|${baseName(s.name)}`

/**
 * La base fournisseurs de référence est UNIQUE : le fichier maître (Base_fournisseurs_filtrable_INDUNI.xlsx,
 * colonnes A à E : catégorie, fournisseur, nature, fréquence, contact soumission), embarqué dans
 * l'application sous forme de suppliersSeed.json. La base partagée en devient le miroir exact :
 * lignes du fichier ajoutées ou alignées (identifiant conservé), tout le reste supprimé
 * (fournisseurs créés à la main, anciens imports, doublons). Exécuté une fois par version du seed
 * et par navigateur ; seules les différences sont écrites.
 */
export async function syncSuppliersToReference(seed: SupplierRecord[], version: string): Promise<void> {
  const versionKey = 'supplierSeedVersion'
  try {
    if (localStorage.getItem(versionKey) === version) return
  } catch {
    // storage unavailable: run anyway (only differences are written)
  }
  const existing = await fetchSuppliers()
  const byKey = new Map<string, SupplierRecord[]>()
  for (const e of existing) byKey.set(supplierKey(e), [...(byKey.get(supplierKey(e)) ?? []), e])

  const writes: SupplierRecord[] = []
  const deletes: SupplierRecord[] = []
  const wanted = new Set<string>()
  for (const s of seed) {
    const k = supplierKey(s)
    wanted.add(k)
    const found = byKey.get(k) ?? []
    if (found.length === 0) {
      writes.push(s)
      continue
    }
    const target: SupplierRecord = { ...s, id: found[0].id }
    if (JSON.stringify(target) !== JSON.stringify(found[0])) writes.push(target)
    deletes.push(...found.slice(1))
  }
  for (const e of existing) if (!wanted.has(supplierKey(e))) deletes.push(e)

  for (let i = 0; i < writes.length; i += 25) await Promise.all(writes.slice(i, i + 25).map((s) => saveSupplier(s)))
  for (let i = 0; i < deletes.length; i += 25) await Promise.all(deletes.slice(i, i + 25).map((s) => deleteSupplier(s.id)))
  try {
    localStorage.setItem(versionKey, version)
  } catch {
    // not critical
  }
}

export function initSuppliers(seed: SupplierRecord[], version: string): Promise<void> {
  suppliersReady = syncSuppliersToReference(seed, version).catch((err) =>
    console.error('Mise à jour de la base fournisseurs impossible', err),
  )
  return suppliersReady
}
