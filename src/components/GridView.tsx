import type { Submission } from '../types'
import { exportTrackingGrid, gridPreview, type GridMode } from '../export/trackingGrid'

/** Grille de soumission « version brute », dès l'analyse des lots ; la version finale est dans « Suivi ». */
export default function GridView({ submission, mode }: { submission: Submission; mode: GridMode }) {
  const { lots, suppliers, labels } = gridPreview(submission, mode)
  const brut = mode === 'brut'
  if (!lots.length) return brut ? null : <p className="text-sm text-slate-500">Grille finale : aucun lot validé pour l'instant.</p>
  return (
    <details className="card !p-3 mb-3" open>
      <summary className="text-sm font-medium cursor-pointer">{brut ? 'Grille de soumission — version brute (analyse de l\'agent)' : 'Grille de soumission — version finale (lots validés par l\'acheteur)'}</summary>
      <p className="text-xs text-slate-500 my-2">
        {brut
          ? 'Version brute, avant validation : X = fournisseur proposé. La version finale est dans « 4. Suivi ».'
          : 'Version finale : seuls les lots validés dans « 2. Validation & envoi » figurent ici.'}
      </p>
      <div className="overflow-auto max-h-[40vh]">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="border px-1 bg-slate-200">#</th>
              <th className="border px-1 bg-slate-200 text-left">Fournisseur</th>
              {labels.map((l, i) => (
                <th key={i} className="border px-1 bg-slate-200">{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s, i) => (
              <tr key={s.name} className={i % 2 ? 'bg-slate-100' : ''}>
                <td className="border px-1 text-center">{i + 1}</td>
                <td className="border px-1">{s.name}</td>
                {lots.map((l) => (
                  <td key={l.id} className="border px-1 text-center font-bold">{s.lotIds.has(l.id) ? 'X' : ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn-secondary w-full mt-2" onClick={() => exportTrackingGrid(submission, mode)}>
        {brut ? '⭳ Grille version brute (Excel)' : '⭳ Grille version finale (Excel)'}
      </button>
    </details>
  )
}
