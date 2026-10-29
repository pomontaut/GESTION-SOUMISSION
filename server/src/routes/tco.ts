import { Router } from 'express'
import { pool } from '../db'
import { generateTcoAnalysis, type TcoOfferDocument, type TcoSupplierInput } from '../anthropic'
import { runTcoAgent } from '../tcoAgent'
import { randomUUID } from 'node:crypto'

const router = Router()

// PDFs and common image formats are supported directly as document/image content blocks by the
// Anthropic API - anything else (e.g. a .docx/.xlsx offer, rare but possible) is skipped rather
// than sent as unreadable bytes; the rest of the analysis still runs on whatever is readable.
const SUPPORTED_MEDIA_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

router.post('/analyze', async (req, res) => {
  const { submissionId, lotTitle, cfcCode, projectName, suppliers, positions } = req.body ?? {}
  if (!lotTitle || !Array.isArray(suppliers) || suppliers.length === 0) {
    res.status(400).json({ error: 'Données de lot incomplètes (titre ou fournisseurs manquants)' })
    return
  }
  try {
    // Read the fournisseurs' own uploaded offer files directly (PDF/image) so the model can
    // extract and compare their real line items itself, instead of only ever seeing the
    // hand-typed summary fields - this is what actually closes the gap with a plain Claude.ai
    // chat where the documents are uploaded and read directly.
    const offerDocuments: TcoOfferDocument[] = []
    if (submissionId) {
      for (const s of suppliers as TcoSupplierInput[]) {
        if (!s.offerFileId) continue
        const result = await pool.query(
          'SELECT content_type, file_data FROM offer_files WHERE id = $1 AND submission_id = $2',
          [s.offerFileId, submissionId],
        )
        const row = result.rows[0]
        if (!row || !SUPPORTED_MEDIA_TYPES.has(row.content_type)) continue
        offerDocuments.push({
          supplierName: s.name,
          mediaType: row.content_type,
          base64: (row.file_data as Buffer).toString('base64'),
        })
      }
    }

    const analysis = await generateTcoAnalysis({
      lotTitle,
      cfcCode: cfcCode ?? '',
      projectName: projectName ?? '',
      suppliers: suppliers as TcoSupplierInput[],
      positions: Array.isArray(positions) ? positions : undefined,
      offerDocuments,
    })
    res.json(analysis)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Échec de la génération de l'analyse" })
  }
})

// Génération du TCO par l'agent acheteur : tâche longue (lecture de PDF + 32k tokens max) qui
// dépasserait le délai HTTP du proxy -> on répond tout de suite avec un identifiant de tâche que
// le navigateur interroge. Tâches en mémoire (une seule instance), purgées après 1 h.
interface TcoJob {
  status: 'running' | 'done' | 'error'
  progress: string
  result?: unknown
  error?: string
  createdAt: number
}
const jobs = new Map<string, TcoJob>()

router.post('/generate', async (req, res) => {
  const { submissionId, lotTitle, cfcCode, projectName, siteLocation, siteNumber, calculatorName, prestationType, pages, suppliers, besoinPdfBase64 } = req.body ?? {}
  if (!lotTitle || !Array.isArray(suppliers) || suppliers.length === 0) {
    res.status(400).json({ error: 'Données de lot incomplètes (titre ou fournisseurs manquants)' })
    return
  }
  try {
    const offers: Array<{ supplierName: string; mediaType: string; base64: string }> = []
    for (const s of suppliers as TcoSupplierInput[]) {
      if (!s.offerFileId || !submissionId) continue
      const result = await pool.query(
        'SELECT content_type, file_data FROM offer_files WHERE id = $1 AND submission_id = $2',
        [s.offerFileId, submissionId],
      )
      const row = result.rows[0]
      if (!row || !SUPPORTED_MEDIA_TYPES.has(row.content_type)) continue
      offers.push({ supplierName: s.name, mediaType: row.content_type, base64: (row.file_data as Buffer).toString('base64') })
    }
    if (offers.length === 0) {
      res.status(400).json({ error: 'Joignez au moins une offre lisible (PDF ou image) à ce lot.' })
      return
    }
    const context = [
      `Dossier : ${projectName || 'Non précisé'} — ${siteLocation || 'Non précisé'} — chantier n° ${siteNumber || 'Non précisé'}`,
      `Calculateur : ${calculatorName || 'Non précisé'}`,
      `Lot : CFC ${cfcCode ?? ''} — ${lotTitle} (${prestationType === 'fourniture' ? 'fourniture seule' : 'fourniture et pose'})${Array.isArray(pages) ? `, pages de soumission ${pages.join(', ')}` : ''}.`,
      '',
      "Documents ci-dessous : le besoin (extrait de la soumission, s'il est fourni), puis une offre par fournisseur.",
      "Saisies de l'acheteur dans l'application (à traiter comme [F] côté Induni, à recouper avec les offres) :",
      ...(suppliers as TcoSupplierInput[]).map(
        (f) =>
          `- ${f.name}: montant estimé ${f.estimatedAmount || '—'}, montant offert saisi ${f.offeredAmount || '—'}, conforme ${f.conforme ? 'oui' : 'non'}, notes « ${f.notes ?? ''} »`,
      ),
    ].join('\n')

    const id = randomUUID()
    const job: TcoJob = { status: 'running', progress: 'Préparation…', createdAt: Date.now() }
    for (const [k, j] of jobs) if (Date.now() - j.createdAt > 3600_000) jobs.delete(k)
    jobs.set(id, job)
    runTcoAgent({ context, besoinPdfBase64: typeof besoinPdfBase64 === 'string' ? besoinPdfBase64 : undefined, offers }, (m) => {
      job.progress = m
    })
      .then((result) => {
        job.result = result
        job.status = 'done'
      })
      .catch((err) => {
        console.error('TCO agent', err)
        job.error = err instanceof Error ? err.message : String(err)
        job.status = 'error'
      })
    res.json({ jobId: id })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Échec du lancement de la génération' })
  }
})

router.get('/generate/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) {
    res.status(404).json({ error: 'Tâche introuvable (serveur redémarré ?) : relancez la génération.' })
    return
  }
  res.json({ status: job.status, progress: job.progress, result: job.status === 'done' ? job.result : undefined, error: job.error })
})

export default router
