import type { Submission } from '../types'
import { exportTrackingGrid, gridPreview } from '../export/trackingGrid'

/** Grille de soumission « version brute », dès l'analyse des lots ; la version finale est dans « Suivi ». */
export default function RawGrid({ submission }: { submission: Submission }) {
  const { lots, suppliers, labels } = gridPreview(submission)
  if (!lots.length) return null
  return (
    <details className="card !p-3 mb-3" open>
      <summary className="text-sm font-medium cursor-pointer">Grille de soumission (version brute)</summary>
      <p className="text-xs text-slate-500 my-2">
        Version brute, avant envoi : X = fournisseur à consulter. La version finale est dans « 4. Suivi ».
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
      <button className="btn-secondary w-full mt-2" onClick={() => exportTrackingGrid(submission)}>
        ⭳ Grille version brute (Excel)
      </button>
    </details>
  )
}
