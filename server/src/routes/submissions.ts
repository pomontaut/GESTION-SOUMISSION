import { Router } from 'express'
import express from 'express'
import { pool } from '../db'

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

router.delete('/:id/pdf', async (req, res) => {
  await pool.query('UPDATE submissions SET pdf_data = NULL, pdf_file_name = NULL WHERE id = $1', [
    req.params.id,
  ])
  res.status(204).end()
})

router.put('/:id/offers/:fileId', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
  const fileName = req.get('X-File-Name')
  const contentType = req.get('Content-Type') || 'application/octet-stream'
  if (!fileName) {
    res.status(400).json({ error: 'X-File-Name manquant' })
    return
  }
  await pool.query(
    `INSERT INTO offer_files (id, submission_id, file_name, content_type, file_data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET file_name = $3, content_type = $4, file_data = $5`,
    [req.params.fileId, req.params.id, decodeURIComponent(fileName), contentType, req.body],
  )
  res.status(204).end()
})

router.get('/:id/offers/:fileId', async (req, res) => {
  const result = await pool.query(
    'SELECT file_name, content_type, file_data FROM offer_files WHERE id = $1 AND submission_id = $2',
    [req.params.fileId, req.params.id],
  )
  const row = result.rows[0]
  if (!row) {
    res.status(404).end()
    return
  }
  res.setHeader('Content-Type', row.content_type)
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.file_name)}"`)
  res.send(row.file_data)
})

router.delete('/:id/offers/:fileId', async (req, res) => {
  await pool.query('DELETE FROM offer_files WHERE id = $1 AND submission_id = $2', [
    req.params.fileId,
    req.params.id,
  ])
  res.status(204).end()
})

export default router
