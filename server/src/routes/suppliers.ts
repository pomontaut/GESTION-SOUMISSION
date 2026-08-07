import { Router } from 'express'
import { pool } from '../db'
import { requireAuth } from '../auth'

const router = Router()
router.use(requireAuth)

router.get('/', async (_req, res) => {
  const result = await pool.query('SELECT data FROM suppliers')
  res.json(result.rows.map((r) => r.data))
})

router.put('/:id', async (req, res) => {
  const { id } = req.params
  const supplier = req.body ?? {}
  if (supplier.id !== id) {
    res.status(400).json({ error: 'Identifiant incohérent' })
    return
  }
  await pool.query(
    `INSERT INTO suppliers (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = $2`,
    [id, JSON.stringify(supplier)],
  )
  res.status(204).end()
})

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM suppliers WHERE id = $1', [req.params.id])
  res.status(204).end()
})

export default router
