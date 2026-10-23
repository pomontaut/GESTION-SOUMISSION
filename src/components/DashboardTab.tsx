import { useState } from 'react'
import type { FollowUpEntry, Lot, Submission } from '../types'
import { MODELS, generateTco, getApiKey, getModel, setApiKey, setModel } from '../agent/acheteurAgent'
import { anyEmailSent, exportTrackingGrid } from '../export/trackingGrid'
import { exportTcoExcel } from '../export/tcoExcel'

/** Seules les consultations réellement envoyées apparaissent dans le suivi. */
const sentFollowUp = (lot: Lot) => lot.followUp.filter((f) => f.status === 'envoye')

export default function DashboardTab({
  submission,
  onUpdate,
}: {
  submission: Submission
  onUpdate: (s: Submission) => void
}) {
  const [apiKey, setApiKeyState] = useState(getApiKey())
  const [model, setModelState] = useState(getModel())
  const [tcoBusy, setTcoBusy] = useState<Record<string, string>>({})
  const [tcoError, setTcoError] = useState<Record<string, string>>({})

  async function attachOffer(lotId: string, supplierId: string, file: File | undefined) {
    if (!file) return
    updateFollowUp(lotId, supplierId, {
      offerFileName: file.name,
      offerMime: file.type || 'application/pdf',
      offerData: await file.arrayBuffer(),
    })
  }

  async function runTco(lot: Lot) {
    setTcoError((e) => ({ ...e, [lot.id]: '' }))
    try {
      const tco = await generateTco(submission, lot, (msg) => setTcoBusy((b) => ({ ...b, [lot.id]: msg })))
      await exportTcoExcel(tco, `TCO ${submission.info.projectName || submission.name} - CFC ${lot.cfcCode}.xlsx`)
    } catch (e) {
      setTcoError((er) => ({ ...er, [lot.id]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setTcoBusy((b) => {
        const { [lot.id]: _done, ...rest } = b
        return rest
      })
    }
  }

  function updateLot(id: string, patch: Partial<Lot>) {
    onUpdate({ ...submission, lots: submission.lots.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  }

  function updateFollowUp(lotId: string, supplierId: string, patch: Partial<FollowUpEntry>) {
    const lot = submission.lots.find((l) => l.id === lotId)
    if (!lot) return
    updateLot(lotId, {
      followUp: lot.followUp.map((f) => (f.supplierId === supplierId ? { ...f, ...patch } : f)),
    })
  }

  function relance(lotId: string, supplierId: string) {
    updateFollowUp(lotId, supplierId, { relanceDate: new Date().toISOString().slice(0, 10) })
  }

  function setRetained(lotId: string, supplierId: string) {
    const lot = submission.lots.find((l) => l.id === lotId)
    if (!lot) return
    updateLot(lotId, {
      followUp: lot.followUp.map((f) => ({ ...f, retained: f.supplierId === supplierId })),
    })
  }

  function exportCsv() {
    const rows = [
      ['Lot', 'CFC', 'Fournisseur', 'Email', 'Statut', 'Date envoi', 'Date relance', 'Montant estimé', 'Montant offert', 'Conforme', 'Date retour', 'Notes', 'Retenu'],
    ]
    for (const lot of submission.lots) {
      for (const f of sentFollowUp(lot)) {
        rows.push([
          lot.title,
          lot.cfcCode,
          f.name,
          f.email,
          f.status,
          f.sentDate ?? '',
          f.relanceDate ?? '',
          f.estimatedAmount ?? '',
          f.offeredAmount ?? '',
          f.conforme ? 'oui' : 'non',
          f.returnDate ?? '',
          f.notes ?? '',
          f.retained ? 'oui' : 'non',
        ])
      }
    }
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    downloadBlob(csv, `${submission.info.projectName || 'soumission'}-suivi.csv`, 'text/csv')
  }

  function exportJson() {
    const { pdfData: _pdfData, ...base } = submission
    const rest = {
      ...base,
      lots: base.lots.map((l) => ({
        ...l,
        followUp: l.followUp.map(({ offerData: _offer, ...f }) => f),
      })),
    }
    downloadBlob(JSON.stringify(rest, null, 2), `${submission.info.projectName || 'soumission'}.json`, 'application/json')
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Statut d'avancement">
            <select
              className="input"
              value={submission.info.progressStatus}
              onChange={(e) =>
                onUpdate({ ...submission, info: { ...submission.info, progressStatus: e.target.value as any } })
              }
            >
              <option value="en_cours">En cours</option>
              <option value="termine">Terminé</option>
              <option value="annule">Annulé</option>
            </select>
          </Field>
          <Field label="Statut d'approbation">
            <select
              className="input"
              value={submission.info.approvalStatus}
              onChange={(e) =>
                onUpdate({ ...submission, info: { ...submission.info, approvalStatus: e.target.value as any } })
              }
            >
              <option value="en_attente">En attente</option>
              <option value="approuve">Approuvé</option>
              <option value="refuse">Refusé</option>
            </select>
          </Field>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            className="btn-primary"
            disabled={!anyEmailSent(submission)}
            onClick={() => exportTrackingGrid(submission)}
          >
            ⭳ Générer le tableau de suivi (Excel)
          </button>
          <button className="btn-secondary" onClick={exportCsv}>
            ⭳ Exporter en CSV
          </button>
          <button className="btn-secondary" onClick={exportJson}>
            ⭳ Exporter tout (JSON, sans fichiers joints)
          </button>
        </div>
        {!anyEmailSent(submission) && (
          <p className="text-xs text-slate-500 mt-2">
            Le tableau de suivi est disponible quand au moins un e-mail est marqué « envoyé » (onglet 2) ; seules les consultations envoyées y figurent.
          </p>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-1">Assistant acheteur (IA)</h3>
        <p className="text-sm text-slate-500 mb-3">
          Génère le TCO d'un lot à partir du besoin et des offres jointes. La clé API reste dans ce navigateur et les
          documents sont envoyés à l'API Anthropic pour l'analyse.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Clé API Anthropic</label>
            <input
              type="password"
              className="input"
              placeholder="sk-ant-…"
              value={apiKey}
              onChange={(e) => {
                setApiKeyState(e.target.value)
                setApiKey(e.target.value)
              }}
            />
          </div>
          <div>
            <label className="label">Modèle</label>
            <select
              className="input"
              value={model}
              onChange={(e) => {
                setModelState(e.target.value)
                setModel(e.target.value)
              }}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {submission.lots.filter((l) => sentFollowUp(l).length > 0).map((lot) => (
        <div key={lot.id} className="card overflow-x-auto">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h3 className="font-semibold text-slate-800">
              CFC {lot.cfcCode} — {lot.title}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
              {lot.validated ? 'Validé' : 'Proposé'}
            </span>
            <span className="text-xs text-slate-500">
              {lot.prestationType === 'fourniture' ? 'Fourniture' : 'Fourniture + pose'} · {lot.suppliers.length} fournisseur(s) ·{' '}
              {sentFollowUp(lot).filter((f) => f.offeredAmount).length}/{sentFollowUp(lot).length} offre(s) reçue(s)
            </span>
            <span className="text-xs text-slate-400 ml-auto">pages {lot.pages.join(', ')}</span>
            <button
              className="btn-primary"
              disabled={Boolean(tcoBusy[lot.id]) || !lot.followUp.some((f) => f.offerData)}
              title={lot.followUp.some((f) => f.offerData) ? '' : 'Joignez au moins une offre à ce lot'}
              onClick={() => runTco(lot)}
            >
              {tcoBusy[lot.id] ? '⏳ ' + tcoBusy[lot.id] : '⭳ Générer un TCO'}
            </button>
          </div>
          {tcoError[lot.id] && <p className="text-sm text-red-600 mb-2">{tcoError[lot.id]}</p>}

          {sentFollowUp(lot).length === 0 ? (
            <p className="text-sm text-slate-400">
              Aucun suivi — générez l'e-mail groupé dans l'onglet 2 pour initialiser le suivi des fournisseurs.
            </p>
          ) : (
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 pr-2">Fournisseur</th>
                  <th className="py-1.5 pr-2">Offre jointe</th>
                  <th className="py-1.5 pr-2">Statut</th>
                  <th className="py-1.5 pr-2">Date envoi</th>
                  <th className="py-1.5 pr-2">Relance</th>
                  <th className="py-1.5 pr-2">Montant estimé</th>
                  <th className="py-1.5 pr-2">Montant offert</th>
                  <th className="py-1.5 pr-2">Conforme</th>
                  <th className="py-1.5 pr-2">Date retour</th>
                  <th className="py-1.5 pr-2">Notes</th>
                  <th className="py-1.5 pr-2">Retenu</th>
                </tr>
              </thead>
              <tbody>
                {sentFollowUp(lot).map((f) => (
                  <tr key={f.supplierId} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2">
                      {f.name}
                      <div className="text-xs text-slate-400">{f.email}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-xs">
                      {f.offerFileName ? (
                        <div className="flex items-center gap-1">
                          <span className="truncate max-w-[140px]" title={f.offerFileName}>
                            📎 {f.offerFileName}
                          </span>
                          <button
                            className="text-slate-400 hover:text-red-600"
                            onClick={() =>
                              updateFollowUp(lot.id, f.supplierId, {
                                offerFileName: undefined,
                                offerMime: undefined,
                                offerData: undefined,
                              })
                            }
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <input
                          type="file"
                          accept="application/pdf,image/png,image/jpeg"
                          className="w-40"
                          onChange={(e) => attachOffer(lot.id, f.supplierId, e.target.files?.[0])}
                        />
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${f.status === 'envoye' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {f.status === 'envoye' ? 'Envoyé' : 'À envoyer'}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="date"
                        className="input !py-1"
                        value={f.sentDate ?? ''}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { sentDate: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <button className="btn-secondary !py-1" onClick={() => relance(lot.id, f.supplierId)}>
                        Relancer
                      </button>
                      {f.relanceDate && <div className="text-xs text-slate-400 mt-0.5">{f.relanceDate}</div>}
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        className="input !py-1 w-24"
                        placeholder="CHF"
                        value={f.estimatedAmount ?? ''}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { estimatedAmount: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        className="input !py-1 w-24"
                        placeholder="CHF"
                        value={f.offeredAmount ?? ''}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { offeredAmount: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <input
                        type="checkbox"
                        checked={f.conforme}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { conforme: e.target.checked })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="date"
                        className="input !py-1"
                        value={f.returnDate ?? ''}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { returnDate: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        className="input !py-1 w-32"
                        value={f.notes ?? ''}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { notes: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <input
                        type="radio"
                        name={`retained-${lot.id}`}
                        checked={f.retained}
                        onChange={() => setRetained(lot.id, f.supplierId)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}
