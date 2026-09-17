import { Router } from 'express'
import { generateTcoNote, type TcoSupplierInput } from '../anthropic'

const router = Router()

router.post('/analyze', async (req, res) => {
  const { lotTitle, cfcCode, projectName, suppliers } = req.body ?? {}
  if (!lotTitle || !Array.isArray(suppliers) || suppliers.length === 0) {
    res.status(400).json({ error: 'Données de lot incomplètes (titre ou fournisseurs manquants)' })
    return
  }
  try {
    const note = await generateTcoNote({
      lotTitle,
      cfcCode: cfcCode ?? '',
      projectName: projectName ?? '',
      suppliers: suppliers as TcoSupplierInput[],
    })
    res.json({ note })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Échec de la génération de la note' })
  }
})

export default router
