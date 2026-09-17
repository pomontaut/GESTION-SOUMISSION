import { useId, useMemo, useState } from 'react'
import type { FollowUpEntry, Lot, LotPosition, Submission } from '../types'
import { uid } from '../types'
import { deleteOfferFile, offerFileUrl, uploadOfferFile } from '../storage'
import { extractAmountFromPdf } from '../pdf/extractAmount'
import { detectLotHeterogeneity } from '../data/categorize'
import { generateTcoWorkbook, tcoFilename } from '../tco/generateTco'
import PdfPreviewModal from './PdfPreviewModal'

export default function DashboardTab({
  submission,
  onUpdate,
  onEditLot,
}: {
  submission: Submission
  onUpdate: (s: Submission) => void
  onEditLot: (lotId: string) => void
}) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [previewLot, setPreviewLot] = useState<Lot | null>(null)
  const [generatingTcoId, setGeneratingTcoId] = useState<string | null>(null)

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

  // Dropping the supplier's offer stores the file server-side and, when it's a PDF, tries to
  // pick out the quote's total automatically so "Montant estimé" doesn't have to be retyped by
  // hand - it stays a plain editable field afterwards for whenever the heuristic misses.
  async function handleOfferFile(lotId: string, supplierId: string, file: File) {
    const key = `${lotId}:${supplierId}`
    setUploadingKey(key)
    try {
      const fileId = uid()
      await uploadOfferFile(submission.id, fileId, file)
      const patch: Partial<FollowUpEntry> = { offerFileId: fileId, offerFileName: file.name }
      if (file.type === 'application/pdf') {
        const amount = await extractAmountFromPdf(await file.arrayBuffer())
        if (amount) patch.estimatedAmount = amount
      }
      updateFollowUp(lotId, supplierId, patch)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec de l'envoi du fichier")
    } finally {
      setUploadingKey(null)
    }
  }

  async function handleRemoveOffer(lotId: string, supplierId: string, fileId: string) {
    try {
      await deleteOfferFile(submission.id, fileId)
    } catch {
      // The reference is cleared locally regardless - a stray blob server-side isn't worth blocking on.
    }
    updateFollowUp(lotId, supplierId, { offerFileId: undefined, offerFileName: undefined })
  }

  // Flags lots the agent grouped together that actually mix distinct product categories - worth a
  // manual look before the automatically-picked suppliers go out.
  const heterogeneityByLot = useMemo(() => {
    const map = new Map<string, ReturnType<typeof detectLotHeterogeneity>>()
    for (const lot of submission.lots) {
      const texts = submission.zones.filter((z) => lot.zoneIds.includes(z.id)).map((z) => z.text)
      map.set(lot.id, detectLotHeterogeneity(texts))
    }
    return map
  }, [submission.lots, submission.zones])

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
      for (const f of lot.followUp) {
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

  async function handleGenerateTco(lot: Lot) {
    setGeneratingTcoId(lot.id)
    try {
      const blob = await generateTcoWorkbook(lot, submission)
      downloadBlobFile(blob, tcoFilename(lot))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Échec de la génération du TCO')
    } finally {
      setGeneratingTcoId(null)
    }
  }

  function exportJson() {
    const { pdfData: _pdfData, ...rest } = submission
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
          <button className="btn-secondary" onClick={exportCsv}>
            ⭳ Exporter en CSV
          </button>
          <button className="btn-secondary" onClick={exportJson}>
            ⭳ Exporter tout (JSON, sans fichiers joints)
          </button>
        </div>
      </div>

      {submission.lots.map((lot) => {
        const heterogeneity = heterogeneityByLot.get(lot.id)
        return (
        <div key={lot.id} className="card overflow-x-auto">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              title="Voir le PDF et la zone détectée pour ce lot"
              className="text-slate-400 hover:text-indigo-600 text-lg leading-none"
              onClick={() => setPreviewLot(lot)}
              disabled={!submission.pdfData}
            >
              🔍
            </button>
            <h3 className="font-semibold text-slate-800">
              CFC {lot.cfcCode} — {lot.title}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
              {lot.validated ? 'Validé' : 'Proposé'}
            </span>
            <span className="text-xs text-slate-500">
              {lot.prestationType === 'fourniture' ? 'Fourniture' : 'Fourniture + pose'} · {lot.suppliers.length} fournisseur(s) ·{' '}
              {lot.followUp.filter((f) => f.offeredAmount).length}/{lot.followUp.length} offre(s) reçue(s)
            </span>
            <span className="text-xs text-slate-400">pages {lot.pages.join(', ')}</span>
            <div className="flex gap-2 ml-auto">
              <button
                className="btn-secondary !py-1"
                disabled={lot.followUp.length === 0 || generatingTcoId === lot.id}
                title={lot.followUp.length === 0 ? 'Aucun fournisseur à comparer pour ce lot' : undefined}
                onClick={() => handleGenerateTco(lot)}
              >
                📊 {generatingTcoId === lot.id ? 'Génération...' : 'Générer un TCO'}
              </button>
              <button className="btn-secondary !py-1" onClick={() => onEditLot(lot.id)}>
                ✎ Modifier fournisseurs / e-mail
              </button>
            </div>
          </div>

          {heterogeneity && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              ⚠️ Ce lot semble mélanger des produits différents ({heterogeneity.categories.join(', ')}) — vérifiez
              s'il ne faudrait pas le scinder.{' '}
              <button className="underline" onClick={() => onEditLot(lot.id)}>
                Vérifier / scinder
              </button>
            </p>
          )}

          {lot.followUp.length === 0 ? (
            <p className="text-sm text-slate-400">
              Aucun fournisseur trouvé automatiquement pour ce lot —{' '}
              <button className="underline" onClick={() => onEditLot(lot.id)}>
                ouvrez-le pour en ajouter manuellement
              </button>
              .
            </p>
          ) : (
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 pr-2">Fournisseur</th>
                  <th className="py-1.5 pr-2">Statut</th>
                  <th className="py-1.5 pr-2">Date envoi</th>
                  <th className="py-1.5 pr-2">Relance</th>
                  <th className="py-1.5 pr-2">Offre reçue</th>
                  <th className="py-1.5 pr-2">Montant estimé (HT)</th>
                  <th className="py-1.5 pr-2">Montant offert (HT)</th>
                  <th className="py-1.5 pr-2">Délai</th>
                  <th className="py-1.5 pr-2">Validité offre</th>
                  <th className="py-1.5 pr-2">Conditions paiement</th>
                  <th className="py-1.5 pr-2">Conforme</th>
                  <th className="py-1.5 pr-2">Date retour</th>
                  <th className="py-1.5 pr-2">Notes</th>
                  <th className="py-1.5 pr-2">Retenu</th>
                </tr>
              </thead>
              <tbody>
                {lot.followUp.map((f) => (
                  <tr key={f.supplierId} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2">
                      {f.name}
                      <div className="text-xs text-slate-400">{f.email}</div>
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
                      <OfferDropCell
                        fileName={f.offerFileName}
                        fileUrl={f.offerFileId ? offerFileUrl(submission.id, f.offerFileId) : undefined}
                        busy={uploadingKey === `${lot.id}:${f.supplierId}`}
                        onFile={(file) => handleOfferFile(lot.id, f.supplierId, file)}
                        onRemove={
                          f.offerFileId ? () => handleRemoveOffer(lot.id, f.supplierId, f.offerFileId!) : undefined
                        }
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        className="input !py-1 w-24"
                        placeholder="CHF HT"
                        title="Toujours en HT - le comparatif compare systématiquement les montants hors taxe"
                        value={f.estimatedAmount ?? ''}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { estimatedAmount: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        className="input !py-1 w-24"
                        placeholder="CHF HT"
                        title="Toujours en HT - le comparatif compare systématiquement les montants hors taxe"
                        value={f.offeredAmount ?? ''}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { offeredAmount: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        className="input !py-1 w-24"
                        placeholder="8 semaines"
                        value={f.deliveryTime ?? ''}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { deliveryTime: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="date"
                        className="input !py-1"
                        value={f.offerValidUntil ?? ''}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { offerValidUntil: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        className="input !py-1 w-28"
                        placeholder="30 jours net"
                        value={f.paymentTerms ?? ''}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { paymentTerms: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <input
                        type="checkbox"
                        checked={f.conforme}
                        onChange={(e) => updateFollowUp(lot.id, f.supplierId, { conforme: e.target.checked })}
                      />
                      {!f.conforme && (
                        <input
                          className="input !py-1 w-28 mt-1"
                          placeholder="Motif"
                          value={f.nonConformityReason ?? ''}
                          onChange={(e) => updateFollowUp(lot.id, f.supplierId, { nonConformityReason: e.target.value })}
                        />
                      )}
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

          {lot.followUp.length > 0 && <PositionsGrid lot={lot} onUpdate={(patch) => updateLot(lot.id, patch)} />}
        </div>
        )
      })}

      {previewLot && submission.pdfData && (
        <PdfPreviewModal lot={previewLot} pdfData={submission.pdfData} onClose={() => setPreviewLot(null)} />
      )}
    </div>
  )
}

function OfferDropCell({
  fileName,
  fileUrl,
  busy,
  onFile,
  onRemove,
}: {
  fileName?: string
  fileUrl?: string
  busy: boolean
  onFile: (file: File) => void
  onRemove?: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputId = useId()

  return (
    <div
      className={`w-36 rounded border border-dashed px-2 py-1.5 text-xs transition-colors ${
        dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300'
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      {busy ? (
        <span className="text-slate-400">Envoi...</span>
      ) : fileName ? (
        <div className="flex items-center justify-between gap-1">
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 truncate"
              title={fileName}
            >
              📎 {fileName}
            </a>
          ) : (
            <span className="truncate" title={fileName}>
              📎 {fileName}
            </span>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-600">
              ✕
            </button>
          )}
        </div>
      ) : (
        <label htmlFor={inputId} className="cursor-pointer text-slate-400 block">
          ⭱ Glisser l'offre ici
          <input
            id={inputId}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFile(file)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}

function downloadBlob(content: string, filename: string, type: string) {
  downloadBlobFile(new Blob([content], { type }), filename)
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Per-CAN-article price grid (see types.ts Lot.positions) - no supplier returns this in a common
// structured format, so it's entered by hand here rather than extracted automatically, unlike the
// single lump "Montant offert" above. Collapsed by default since most lots won't need this level
// of detail; useful when the lump-sum totals alone don't explain why offers differ.
function PositionsGrid({ lot, onUpdate }: { lot: Lot; onUpdate: (patch: Partial<Lot>) => void }) {
  // `unitPrices` defaults to {} defensively - a position saved before this field existed (or any
  // future shape drift) must never crash the grid, just show empty PU cells.
  const positions = (lot.positions ?? []).map((p) => ({ ...p, unitPrices: p.unitPrices ?? {} }))

  function addPosition() {
    onUpdate({ positions: [...positions, { id: uid(), code: '', title: '', unitPrices: {} }] })
  }
  function updatePosition(id: string, patch: Partial<LotPosition>) {
    onUpdate({ positions: positions.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }
  function removePosition(id: string) {
    onUpdate({ positions: positions.filter((p) => p.id !== id) })
  }
  function updateUnitPrice(posId: string, supplierId: string, amount: string) {
    onUpdate({
      positions: positions.map((p) =>
        p.id === posId ? { ...p, unitPrices: { ...p.unitPrices, [supplierId]: amount } } : p,
      ),
    })
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm text-slate-500 hover:text-indigo-600">
        📐 Comparatif par article CAN {positions.length > 0 ? `(${positions.length})` : ''}
      </summary>
      <p className="text-xs text-slate-400 mt-1">
        La quantité est celle du métré, commune à tous les fournisseurs - un fournisseur qui ne
        donne que son prix unitaire (PU) sans quantité ni total reste comparable : le total par
        article se calcule automatiquement (PU × quantité).
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="text-sm min-w-[700px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1 pr-2">Code</th>
              <th className="py-1 pr-2">Désignation</th>
              <th className="py-1 pr-2">Quantité</th>
              <th className="py-1 pr-2">Unité</th>
              {lot.followUp.map((f) => (
                <th key={f.supplierId} className="py-1 pr-2">
                  {f.name} (PU HT)
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-1 pr-2">
                  <input
                    className="input !py-1 w-20"
                    placeholder="541.201"
                    value={p.code}
                    onChange={(e) => updatePosition(p.id, { code: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    className="input !py-1 w-40"
                    value={p.title}
                    onChange={(e) => updatePosition(p.id, { title: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    className="input !py-1 w-20"
                    placeholder="120.5"
                    value={p.quantity ?? ''}
                    onChange={(e) => updatePosition(p.id, { quantity: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    className="input !py-1 w-16"
                    placeholder="m2"
                    value={p.unit ?? ''}
                    onChange={(e) => updatePosition(p.id, { unit: e.target.value })}
                  />
                </td>
                {lot.followUp.map((f) => (
                  <td key={f.supplierId} className="py-1 pr-2">
                    <input
                      className="input !py-1 w-24"
                      placeholder="CHF HT"
                      value={p.unitPrices[f.supplierId] ?? ''}
                      onChange={(e) => updateUnitPrice(p.id, f.supplierId, e.target.value)}
                    />
                  </td>
                ))}
                <td>
                  <button onClick={() => removePosition(p.id)} className="text-slate-400 hover:text-red-600">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn-secondary !py-1 mt-2" onClick={addPosition}>
          + Ajouter un article
        </button>
      </div>
    </details>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}
