import type { Lot, Submission } from '../types'
import type { TcoResult } from '../agent/acheteurTypes'
import { extractLotPdf } from '../pdf/extractPages'
import { toBase64 } from '../pdf/base64'

const POLL_MS = 3000
const MAX_WAIT_MS = 15 * 60 * 1000

/** Lance l'agent acheteur côté serveur (offres jointes + besoin de la soumission) et attend son TCO structuré. */
export async function runTcoAgent(
  lot: Lot,
  submission: Submission,
  onStatus: (msg: string) => void,
): Promise<TcoResult> {
  onStatus('Préparation du besoin…')
  let besoinPdfBase64: string | undefined
  if (submission.pdfData && lot.pages.length) {
    try {
      besoinPdfBase64 = toBase64(await extractLotPdf(submission.pdfData, lot.pages, lot.redactions))
    } catch {
      besoinPdfBase64 = undefined // le besoin est un plus : l'analyse se fait sur les offres seules
    }
  }
  const info = submission.info
  const start = await fetch('/api/tco/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      submissionId: submission.id,
      lotTitle: lot.title,
      cfcCode: lot.cfcCode,
      projectName: info.projectName || submission.name,
      siteLocation: info.siteLocation,
      siteNumber: info.siteNumber,
      calculatorName: info.calculatorName,
      prestationType: lot.prestationType,
      pages: lot.pages,
      besoinPdfBase64,
      suppliers: lot.followUp.map((f) => ({
        name: f.name,
        offerFileId: f.offerFileId,
        estimatedAmount: f.estimatedAmount,
        offeredAmount: f.offeredAmount,
        conforme: f.conforme,
        notes: f.notes,
        retained: f.retained,
      })),
    }),
  })
  const started = await start.json().catch(() => ({}))
  if (!start.ok || !started.jobId) throw new Error(started.error ?? `Échec du lancement (${start.status})`)

  const t0 = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    if (Date.now() - t0 > MAX_WAIT_MS) throw new Error("L'agent met trop de temps à répondre : réessayez.")
    const res = await fetch(`/api/tco/generate/${started.jobId}`)
    const job = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(job.error ?? `Suivi impossible (${res.status})`)
    if (job.status === 'error') throw new Error(job.error ?? "Échec de l'agent")
    if (job.status === 'done') return job.result as TcoResult
    onStatus(job.progress ?? 'Analyse en cours…')
  }
}
