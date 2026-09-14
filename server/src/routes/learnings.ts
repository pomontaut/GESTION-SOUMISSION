import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db'

const router = Router()

router.get('/', async (_req, res) => {
  const result = await pool.query('SELECT cfc_code, chapter_code, supplier_id FROM lot_supplier_learnings')
  res.json(
    result.rows.map((r) => ({ cfcCode: r.cfc_code, chapterCode: r.chapter_code, supplierId: r.supplier_id })),
  )
})

router.post('/', async (req, res) => {
  const { cfcCode, chapterCode, supplierId } = req.body ?? {}
  // cfcCode can be blank - some lots never get a CFC banner captured (a pre-existing gap in
  // analyze.ts, not something this route should block on) - chapterCode is still the more
  // discriminating signal in practice, so a learning keyed on it alone remains useful.
  if (!chapterCode || !supplierId) {
    res.status(400).json({ error: 'chapterCode et supplierId sont requis' })
    return
  }
  await pool.query(
    `INSERT INTO lot_supplier_learnings (id, cfc_code, chapter_code, supplier_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cfc_code, chapter_code, supplier_id) DO NOTHING`,
    [randomUUID(), cfcCode ?? '', chapterCode, supplierId],
  )
  res.status(204).end()
})

export default router
