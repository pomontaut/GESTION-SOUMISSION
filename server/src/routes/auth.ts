import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db'
import { requireAuth, signToken, type AuthUser } from '../auth'

const router = Router()

const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

router.post('/register', async (req, res) => {
  const { name, email, password, registrationCode } = req.body ?? {}
  if (!name || !email || !password) {
    res.status(400).json({ error: 'Nom, e-mail et mot de passe requis' })
    return
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' })
    return
  }
  const expectedCode = process.env.REGISTRATION_CODE
  if (expectedCode && registrationCode !== expectedCode) {
    res.status(403).json({ error: "Code d'invitation invalide" })
    return
  }

  const normalizedEmail = String(email).trim().toLowerCase()
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail])
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail' })
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const id = uid()
  await pool.query('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [
    id,
    normalizedEmail,
    name,
    passwordHash,
  ])

  const user: AuthUser = { id, email: normalizedEmail, name }
  res.status(201).json({ token: signToken(user), user })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    res.status(400).json({ error: 'E-mail et mot de passe requis' })
    return
  }
  const normalizedEmail = String(email).trim().toLowerCase()
  const result = await pool.query(
    'SELECT id, email, name, password_hash FROM users WHERE email = $1',
    [normalizedEmail],
  )
  const row = result.rows[0]
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    res.status(401).json({ error: 'E-mail ou mot de passe incorrect' })
    return
  }
  const user: AuthUser = { id: row.id, email: row.email, name: row.name }
  res.json({ token: signToken(user), user })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

export default router
