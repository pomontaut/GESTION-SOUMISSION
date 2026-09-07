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

export async function seedSuppliersIfEmpty(seed: SupplierRecord[]): Promise<void> {
  const existing = await listSuppliers()
  if (existing.length > 0) return
  await Promise.all(seed.map((s) => saveSupplier(s)))
}
