import { useEffect, useMemo, useState } from 'react'
import type { Lot, Submission, SupplierRecord } from '../types'
import { detectLotHeterogeneity } from '../data/categorize'
import { buildLotEmail } from '../email/draftEmail'
import { sendLotEmailNow } from '../email/sendLotNow'
import { listSuppliers, saveLotSupplierLearning, saveSupplier } from '../storage'
import PdfPreviewModal from './PdfPreviewModal'
import EmailPreviewModal from './EmailPreviewModal'

export default function ValidationTab({
  submission,
  onUpdate,
  onEditLot,
}: {
  submission: Submission
  onUpdate: (s: Submission) => void
  onEditLot: (lotId: string) => void
}) {
  const [previewLot, setPreviewLot] = useState<Lot | null>(null)
  const [previewEmailLot, setPreviewEmailLot] = useState<Lot | null>(null)
  const [sendingLotId, setSendingLotId] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<Record<string, { ok: boolean; error?: string }>>({})
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([])
  const [searchByLot, setSearchByLot] = useState<Record<string, string>>({})

  useEffect(() => {
    listSuppliers().then(setSuppliers)
  }, [])

  function updateLot(id: string, patch: Partial<Lot>) {
    onUpdate({ ...submission, lots: submission.lots.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  }

  // Fixing a wrong/missing e-mail here also updates the shared supplier record - the same
  // fournisseur will otherwise keep showing up without an address on every future lot too.
  function updateSupplierEmail(lot: Lot, supplierId: string, email: string) {
    updateLot(lot.id, {
      suppliers: lot.suppliers.map((s) => (s.supplierId === supplierId ? { ...s, email } : s)),
      followUp: lot.followUp.map((f) => (f.supplierId === supplierId ? { ...f, email } : f)),
    })
    const record = suppliers.find((s) => s.id === supplierId)
    if (record && record.email !== email) {
      saveSupplier({ ...record, email }).catch(() => {
        // the lot's own copy is already updated regardless of whether this succeeds
      })
      setSuppliers((prev) => prev.map((s) => (s.id === supplierId ? { ...s, email } : s)))
    }
  }

  // Adding a supplier here (rather than via "Modifier fournisseurs / e-mail") means the automatic
  // match missed it - worth remembering for next time (see saveLotSupplierLearning). A follow-up
  // row is seeded immediately too, so the new supplier shows up in the Suivi tab right away
  // instead of only after the lot's e-mail gets (re)generated.
  function addSupplierToLot(lot: Lot, supplier: SupplierRecord) {
    if (lot.suppliers.some((x) => x.supplierId === supplier.id)) return
    updateLot(lot.id, {
      suppliers: [
        ...lot.suppliers,
        { supplierId: supplier.id, name: supplier.name, email: supplier.email, status: 'valide' },
      ],
      followUp: [
        ...lot.followUp,
        {
          supplierId: supplier.id,
          name: supplier.name,
          email: supplier.email,
          status: 'a_envoyer',
          conforme: true,
          retained: false,
        },
      ],
    })
    saveLotSupplierLearning({ cfcCode: lot.cfcCode, chapterCode: lot.chapterCode, supplierId: supplier.id }).catch(
      () => {
        // best-effort memory - the supplier is added to the lot regardless of whether this succeeds
      },
    )
    setSearchByLot((prev) => ({ ...prev, [lot.id]: '' }))
  }

  // Reuses SupplierAssignment.status (otherwise unused elsewhere) as the send checkbox:
  // "valide" = will be sent, "ignore" = excluded from this consultation but kept on the lot.
  function toggleSend(lot: Lot, supplierId: string, checked: boolean) {
    updateLot(lot.id, {
      suppliers: lot.suppliers.map((s) =>
        s.supplierId === supplierId ? { ...s, status: checked ? 'valide' : 'ignore' } : s,
      ),
    })
  }

  // The algorithm always splits by sub-chapter code, which is correct on most bureaux (see
  // analyze.ts file header) but not every one - some buyers genuinely consult the same suppliers
  // for a run of adjacent sub-chapters (e.g. armature + treillis + accessoires all going to the
  // same ferrailleurs). No signal in the PDF tells the two cases apart, so merging is manual here
  // rather than a guess baked into the detection itself. Regenerates the merged lot's page range,
  // fournisseurs/suivi (deduped by supplierId) and e-mail draft; the PDF attachment is derived from
  // `pages` on demand everywhere else, so it updates for free.
  function mergeLotIntoPrevious(lotId: string) {
    const idx = submission.lots.findIndex((l) => l.id === lotId)
    if (idx <= 0) return
    const prev = submission.lots[idx - 1]
    const current = submission.lots[idx]

    const mergedSuppliers = [...prev.suppliers]
    for (const s of current.suppliers) {
      if (!mergedSuppliers.some((x) => x.supplierId === s.supplierId)) mergedSuppliers.push(s)
    }
    const mergedFollowUp = [...prev.followUp]
    for (const f of current.followUp) {
      if (!mergedFollowUp.some((x) => x.supplierId === f.supplierId)) mergedFollowUp.push(f)
    }

    const merged: Lot = {
      ...prev,
      pages: Array.from(new Set([...prev.pages, ...current.pages])).sort((a, b) => a - b),
      positionCount: prev.positionCount + current.positionCount,
      zoneIds: [...prev.zoneIds, ...current.zoneIds],
      categories: Array.from(new Set([...prev.categories, ...current.categories])),
      suppliers: mergedSuppliers,
      followUp: mergedFollowUp,
    }
    const { subject, body } = buildLotEmail(merged, submission.info)
    merged.emailSubject = subject
    merged.emailBody = body
    merged.emailGeneratedAt = new Date().toISOString()

    onUpdate({
      ...submission,
      lots: submission.lots.map((l) => (l.id === prev.id ? merged : l)).filter((l) => l.id !== current.id),
    })
  }

  const heterogeneityByLot = useMemo(() => {
    const map = new Map<string, ReturnType<typeof detectLotHeterogeneity>>()
    for (const lot of submission.lots) {
      const texts = submission.zones.filter((z) => lot.zoneIds.includes(z.id)).map((z) => z.text)
      map.set(lot.id, detectLotHeterogeneity(texts))
    }
    return map
  }, [submission.lots, submission.zones])

  async function sendLot(lot: Lot) {
    const included = lot.suppliers.filter((s) => s.status !== 'ignore' && s.email)
    setSendingLotId(lot.id)
    setSendResult((prev) => ({ ...prev, [lot.id]: { ok: false } }))
    try {
      await sendLotEmailNow({
        submission,
        lot,
        // A lot's suppliers can include the same company more than once - suppliersSeed.json
        // stores one row per (supplier, category) pair, so a multi-category lot can match the
        // same physical company/email under several distinct supplierIds.
        bcc: [...new Set(included.map((s) => s.email))],
        subject: lot.emailSubject ?? '',
        body: lot.emailBody ?? '',
      })
      setSendResult((prev) => ({ ...prev, [lot.id]: { ok: true } }))
      const today = new Date().toISOString().slice(0, 10)
      const includedIds = new Set(included.map((s) => s.supplierId))
      updateLot(lot.id, {
        followUp: lot.followUp.map((f) =>
          includedIds.has(f.supplierId) ? { ...f, status: 'envoye' as const, sentDate: f.sentDate ?? today } : f,
        ),
      })
    } catch (err) {
      setSendResult((prev) => ({
        ...prev,
        [lot.id]: { ok: false, error: err instanceof Error ? err.message : "Échec de l'envoi" },
      }))
    } finally {
      setSendingLotId(null)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Fournisseurs proposés par lot, prêts à recevoir la consultation. Décochez ceux à ne pas solliciter cette
        fois-ci - ils restent dans la base, juste exclus de cet envoi. Le suivi des offres se fait ensuite dans
        l'onglet Suivi.
      </p>

      {submission.lots.map((lot, idx) => {
        const heterogeneity = heterogeneityByLot.get(lot.id)
        const included = lot.suppliers.filter((s) => s.status !== 'ignore')
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
                {lot.prestationType === 'fourniture' ? 'Fourniture' : 'Fourniture + pose'} · {included.length}/
                {lot.suppliers.length} fournisseur(s) sélectionné(s)
              </span>
              <span className="text-xs text-slate-400">pages {lot.pages.join(', ')}</span>
              {idx > 0 && (
                <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={(e) => e.target.checked && mergeLotIntoPrevious(lot.id)}
                  />
                  Grouper avec le lot précédent
                </label>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  className="btn-primary !py-1"
                  disabled={sendingLotId === lot.id || included.every((s) => !s.email) || !lot.emailSubject}
                  title={!lot.emailSubject ? "Aucun e-mail préparé pour ce lot" : undefined}
                  onClick={() => sendLot(lot)}
                >
                  🚀 {sendingLotId === lot.id ? 'Envoi...' : 'Envoyer ce lot'}
                </button>
                <button
                  className="btn-secondary !py-1"
                  disabled={!lot.emailSubject}
                  title={!lot.emailSubject ? "Aucun e-mail préparé pour ce lot" : undefined}
                  onClick={() => setPreviewEmailLot(lot)}
                >
                  👁 Prévisualiser
                </button>
              </div>
            </div>

            {sendResult[lot.id]?.ok && (
              <p className="text-sm text-green-600 mb-3">✅ E-mail envoyé à {included.length} fournisseur(s).</p>
            )}
            {sendResult[lot.id]?.error && <p className="text-sm text-red-600 mb-3">⚠ {sendResult[lot.id].error}</p>}

            {heterogeneity && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                ⚠️ Ce lot semble mélanger des produits différents ({heterogeneity.categories.join(', ')}) — vérifiez
                s'il ne faudrait pas le scinder.{' '}
                <button className="underline" onClick={() => onEditLot(lot.id)}>
                  Vérifier / scinder
                </button>
              </p>
            )}

            {lot.suppliers.length === 0 ? (
              <p className="text-sm text-slate-400 mb-2">Aucun fournisseur trouvé automatiquement pour ce lot.</p>
            ) : (
              <table className="w-full text-sm min-w-[500px] mb-3">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-2">Fournisseur</th>
                    <th className="py-1.5 pr-2">Email</th>
                    <th className="py-1.5 pr-2 text-center">Envoi</th>
                  </tr>
                </thead>
                <tbody>
                  {lot.suppliers.map((s) => (
                    <tr key={s.supplierId} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2">{s.name}</td>
                      <td className="py-1.5 pr-2">
                        <input
                          className={`input !py-1 ${s.email ? '' : 'border-amber-400'}`}
                          placeholder="adresse@exemple.ch"
                          value={s.email}
                          onChange={(e) => updateSupplierEmail(lot, s.supplierId, e.target.value)}
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-center">
                        <input
                          type="checkbox"
                          checked={s.status !== 'ignore'}
                          onChange={(e) => toggleSend(lot, s.supplierId, e.target.checked)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <SupplierSearchAdd
              lot={lot}
              suppliers={suppliers}
              query={searchByLot[lot.id] ?? ''}
              onQueryChange={(q) => setSearchByLot((prev) => ({ ...prev, [lot.id]: q }))}
              onAdd={(s) => addSupplierToLot(lot, s)}
              onOpenFullEditor={() => onEditLot(lot.id)}
            />
          </div>
        )
      })}

      {submission.lots.length === 0 && (
        <p className="text-slate-500 text-sm">Aucun lot — importez un PDF dans l'onglet 1.</p>
      )}

      {previewLot && submission.pdfData && (
        <PdfPreviewModal lot={previewLot} pdfData={submission.pdfData} onClose={() => setPreviewLot(null)} />
      )}

      {previewEmailLot &&
        (() => {
          const included = previewEmailLot.suppliers.filter((s) => s.status !== 'ignore' && s.email)
          return (
            <EmailPreviewModal
              lot={previewEmailLot}
              submission={submission}
              bcc={[...new Set(included.map((s) => s.email))]}
              onClose={() => setPreviewEmailLot(null)}
              onSent={(subject, body) => {
                const today = new Date().toISOString().slice(0, 10)
                const includedIds = new Set(included.map((s) => s.supplierId))
                updateLot(previewEmailLot.id, {
                  emailSubject: subject,
                  emailBody: body,
                  followUp: previewEmailLot.followUp.map((f) =>
                    includedIds.has(f.supplierId)
                      ? { ...f, status: 'envoye' as const, sentDate: f.sentDate ?? today }
                      : f,
                  ),
                })
                setSendResult((prev) => ({ ...prev, [previewEmailLot.id]: { ok: true } }))
                setPreviewEmailLot(null)
              }}
            />
          )
        })()}
    </div>
  )
}

// Inline search over the whole supplier base (not just the lot's matched category) - lets you add
// a fournisseur to a lot right here, without leaving for the full lot editor, which is what
// "ouvrez-le pour en ajouter manuellement" used to force you to do.
function SupplierSearchAdd({
  lot,
  suppliers,
  query,
  onQueryChange,
  onAdd,
  onOpenFullEditor,
}: {
  lot: Lot
  suppliers: SupplierRecord[]
  query: string
  onQueryChange: (q: string) => void
  onAdd: (s: SupplierRecord) => void
  onOpenFullEditor: () => void
}) {
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return suppliers
      .filter((s) => s.name.toLowerCase().includes(q) && !lot.suppliers.some((x) => x.supplierId === s.id))
      .slice(0, 8)
  }, [query, suppliers, lot.suppliers])

  return (
    <div className="mt-1">
      <input
        className="input"
        placeholder="Rechercher un fournisseur à ajouter (par nom)..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      {query.trim().length >= 2 &&
        (matches.length > 0 ? (
          <div className="space-y-1.5 mt-2">
            {matches.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm bg-slate-50 rounded px-3 py-1.5">
                <span>
                  <strong>{s.name}</strong> · {s.category}
                  {s.nature ? ` · ${s.nature}` : ''} · {s.email || "pas d'e-mail enregistré"}
                </span>
                <button className="btn-secondary !py-1" onClick={() => onAdd(s)}>
                  Ajouter
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 mt-2">
            Aucun fournisseur trouvé pour « {query} ».{' '}
            <button className="underline" onClick={onOpenFullEditor}>
              Créer un nouveau fournisseur
            </button>
          </p>
        ))}
    </div>
  )
}
