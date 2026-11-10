import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db'

const router = Router()

router.get('/', async (_req, res) => {
  const result = await pool.query('SELECT cfc_code, chapter_code, supplier_id FROM lot_supplier_learnings')
  const byTitle = await pool.query('SELECT title_key, supplier_id FROM lot_supplier_title_learnings')
  res.json([
    ...result.rows.map((r) => ({ cfcCode: r.cfc_code, chapterCode: r.chapter_code, supplierId: r.supplier_id })),
    ...byTitle.rows.map((r) => ({ cfcCode: '', chapterCode: '', titleKey: r.title_key, supplierId: r.supplier_id })),
  ])
})

router.post('/', async (req, res) => {
  const { cfcCode, chapterCode, supplierId, titleKey } = req.body ?? {}
  // cfcCode can be blank - some lots never get a CFC banner captured (a pre-existing gap in
  // analyze.ts, not something this route should block on) - chapterCode is still the more
  // discriminating signal in practice, so a learning keyed on it alone remains useful.
  if (!supplierId || (!chapterCode && !titleKey)) {
    res.status(400).json({ error: 'supplierId et (chapterCode ou titleKey) sont requis' })
    return
  }
  if (chapterCode) {
    await pool.query(
      `INSERT INTO lot_supplier_learnings (id, cfc_code, chapter_code, supplier_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cfc_code, chapter_code, supplier_id) DO NOTHING`,
      [randomUUID(), cfcCode ?? '', chapterCode, supplierId],
    )
  }
  if (titleKey) {
    await pool.query(
      `INSERT INTO lot_supplier_title_learnings (id, title_key, supplier_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (title_key, supplier_id) DO NOTHING`,
      [randomUUID(), titleKey, supplierId],
    )
  }
  res.status(204).end()
})

export default router
