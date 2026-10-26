import 'dotenv/config'
import path from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import express from 'express'
import { initSchema } from './db'
import submissionsRoutes from './routes/submissions'
import suppliersRoutes from './routes/suppliers'
import emailRoutes from './routes/email'
import learningsRoutes from './routes/learnings'
import tcoRoutes from './routes/tco'

const authUser = process.env.APP_USER
const authPassword = process.env.APP_PASSWORD
if (!authUser || !authPassword) {
  console.error('APP_USER et APP_PASSWORD doivent être définis : le serveur refuse de démarrer sans protection.')
  process.exit(1)
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

const app = express()

// Authentification HTTP Basic sur tout le site (pages et /api) : le navigateur demande l'identifiant une
// fois, puis renvoie l'en-tête automatiquement sur chaque appel de l'outil.
app.use((req, res, next) => {
  const header = req.headers.authorization ?? ''
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
    const sep = decoded.indexOf(':')
    if (sep >= 0 && safeEqual(decoded.slice(0, sep), authUser) && safeEqual(decoded.slice(sep + 1), authPassword)) {
      next()
      return
    }
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Outil sourcing", charset="UTF-8"')
  res.status(401).send('Authentification requise')
})

app.use(express.json({ limit: '20mb' }))

app.use('/api/submissions', submissionsRoutes)
app.use('/api/suppliers', suppliersRoutes)
app.use('/api/send-email', emailRoutes)
app.use('/api/learnings', learningsRoutes)
app.use('/api/tco', tcoRoutes)

const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))
app.get('/*splat', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next()
    return
  }
  res.sendFile(path.join(distDir, 'index.html'))
})

const port = Number(process.env.PORT) || 8787

initSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`Serveur démarré sur le port ${port}`)
    })
  })
  .catch((err) => {
    console.error("Échec de l'initialisation de la base de données", err)
    process.exit(1)
  })
