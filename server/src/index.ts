import 'dotenv/config'
import path from 'node:path'
import express from 'express'
import { initSchema } from './db'
import submissionsRoutes from './routes/submissions'
import suppliersRoutes from './routes/suppliers'

const app = express()
app.use(express.json({ limit: '5mb' }))

app.use('/api/submissions', submissionsRoutes)
app.use('/api/suppliers', suppliersRoutes)

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
