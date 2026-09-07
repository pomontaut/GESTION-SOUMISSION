import { Router } from 'express'
import express from 'express'
import { PDFDocument } from 'pdf-lib'
import { pool } from '../db'
import { sendEmail } from '../resend'

const router = Router()

function rowToSubmission(row: any) {
  return {
    ...row.data,
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at.toISOString(),
    pdfFileName: row.pdf_file_name ?? undefined,
  }
}

router.get('/', async (_req, res) => {
  const result = await pool.query(
    'SELECT id, name, updated_at, pdf_file_name, data FROM submissions ORDER BY updated_at DESC',
  )
  res.json(result.rows.map(rowToSubmission))
})

router.get('/:id', async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, updated_at, pdf_file_name, data FROM submissions WHERE id = $1',
    [req.params.id],
  )
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Soumission introuvable' })
    return
  }
  res.json(rowToSubmission(result.rows[0]))
})

router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { pdfData: _ignored, ...submission } = req.body ?? {}
  if (submission.id !== id) {
    res.status(400).json({ error: 'Identifiant incohérent' })
    return
  }
  const updatedAt = submission.updatedAt ? new Date(submission.updatedAt) : new Date()
  await pool.query(
    `INSERT INTO submissions (id, name, updated_at, pdf_file_name, data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET name = $2, updated_at = $3, pdf_file_name = $4, data = $5`,
    [id, submission.name || 'Sans nom', updatedAt, submission.pdfFileName ?? null, JSON.stringify(submission)],
  )
  res.status(204).end()
})

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM submissions WHERE id = $1', [req.params.id])
  res.status(204).end()
})

router.get('/:id/pdf', async (req, res) => {
  const result = await pool.query('SELECT pdf_data, pdf_file_name FROM submissions WHERE id = $1', [
    req.params.id,
  ])
  const row = result.rows[0]
  if (!row || !row.pdf_data) {
    res.status(404).end()
    return
  }
  res.setHeader('Content-Type', 'application/pdf')
  res.send(row.pdf_data)
})

router.put('/:id/pdf', express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
  const result = await pool.query('UPDATE submissions SET pdf_data = $1 WHERE id = $2', [
    req.body,
    req.params.id,
  ])
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Soumission introuvable' })
    return
  }
  res.status(204).end()
})

router.post('/:id/lots/:lotId/send-email', async (req, res) => {
  const { bcc, subject, body } = req.body ?? {}
  if (!Array.isArray(bcc) || bcc.length === 0) {
    res.status(400).json({ error: 'Aucun destinataire' })
    return
  }

  const result = await pool.query('SELECT data, pdf_data FROM submissions WHERE id = $1', [req.params.id])
  const row = result.rows[0]
  if (!row) {
    res.status(404).json({ error: 'Soumission introuvable' })
    return
  }
  const lot = (row.data.lots ?? []).find((l: any) => l.id === req.params.lotId)
  if (!lot) {
    res.status(404).json({ error: 'Lot introuvable' })
    return
  }

  let attachments
  if (row.pdf_data) {
    const srcDoc = await PDFDocument.load(row.pdf_data)
    const outDoc = await PDFDocument.create()
    const pages: number[] = lot.pages ?? []
    const indices = pages.map((p) => p - 1).filter((i) => i >= 0 && i < srcDoc.getPageCount())
    const copied = await outDoc.copyPages(srcDoc, indices)
    copied.forEach((p) => outDoc.addPage(p))
    const bytes = await outDoc.save()
    const namePart = [lot.cfcCode, lot.chapterCode, lot.subChapterCode].filter(Boolean).join('-')
    attachments = [
      {
        filename: `${namePart}-p${pages[0]}.pdf`,
        content: Buffer.from(bytes).toString('base64'),
        contentType: 'application/pdf',
      },
    ]
  }

  try {
    await sendEmail({ bcc, subject: subject ?? '', text: body ?? '', attachments })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Échec de l'envoi" })
    return
  }
  res.status(204).end()
})

router.delete('/:id/pdf', async (req, res) => {
  await pool.query('UPDATE submissions SET pdf_data = NULL, pdf_file_name = NULL WHERE id = $1', [
    req.params.id,
  ])
  res.status(204).end()
})

export default router
