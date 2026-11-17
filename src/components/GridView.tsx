import type { Submission } from '../types'
import { exportTrackingGrid, gridPreview, type GridMode } from '../export/trackingGrid'

/** Grille de soumission : pas d'aperçu à l'écran, seulement le téléchargement Excel.
 *  brut = tous les lots analysés (Validation & envoi) ; final = lots validés (Suivi). */
export default function GridView({ submission, mode }: { submission: Submission; mode: GridMode }) {
  const { lots } = gridPreview(submission, mode)
  const brut = mode === 'brut'
  if (!lots.length && brut) return null
  return (
    <div className="card !p-3 mb-3 flex items-center gap-3 flex-wrap">
      <button className="btn-secondary" disabled={!lots.length} onClick={() => exportTrackingGrid(submission, mode)}>
        {brut ? '⭳ Grille de soumission — version brute (Excel)' : '⭳ Grille de soumission — version finale (Excel)'}
      </button>
      <span className="text-xs text-slate-500">
        {brut
          ? 'Avant validation : tous les lots analysés par l\'agent. La version finale est dans « 4. Suivi ».'
          : lots.length
            ? 'Lots validés par l\'acheteur.'
            : 'Aucun lot validé pour l\'instant.'}
      </span>
    </div>
  )
}
