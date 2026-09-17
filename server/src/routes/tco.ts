import { Router } from 'express'
import { generateTcoAnalysis, type TcoSupplierInput } from '../anthropic'

const router = Router()

router.post('/analyze', async (req, res) => {
  const { lotTitle, cfcCode, projectName, suppliers, positions } = req.body ?? {}
  if (!lotTitle || !Array.isArray(suppliers) || suppliers.length === 0) {
    res.status(400).json({ error: 'Données de lot incomplètes (titre ou fournisseurs manquants)' })
    return
  }
  try {
    const analysis = await generateTcoAnalysis({
      lotTitle,
      cfcCode: cfcCode ?? '',
      projectName: projectName ?? '',
      suppliers: suppliers as TcoSupplierInput[],
      positions: Array.isArray(positions) ? positions : undefined,
    })
    res.json(analysis)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Échec de la génération de l\'analyse' })
  }
})

export default router
