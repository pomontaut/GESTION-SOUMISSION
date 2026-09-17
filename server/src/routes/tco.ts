import { Router } from 'express'
import { pool } from '../db'
import { generateTcoAnalysis, type TcoOfferDocument, type TcoSupplierInput } from '../anthropic'

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

export default router
