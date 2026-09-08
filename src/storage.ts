import type { Submission, SupplierRecord } from './types'

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

export async function listSuppliers(): Promise<SupplierRecord[]> {
  const res = await assertOk(await fetch('/api/suppliers'))
  return res.json()
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

export async function sendLotEmail(params: {
  bcc: string[]
  subject: string
  text: string
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
  const existing = await listSuppliers()
  if (existing.length >= seed.length) return
  await Promise.all(existing.map((s) => deleteSupplier(s.id)))
  await Promise.all(seed.map((s) => saveSupplier(s)))
}
