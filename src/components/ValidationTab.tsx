import { useMemo, useState } from 'react'
import type { Lot, Submission } from '../types'
import { detectLotHeterogeneity } from '../data/categorize'
import { sendLotEmailNow } from '../email/sendLotNow'
import PdfPreviewModal from './PdfPreviewModal'

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
  const [sendingLotId, setSendingLotId] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<Record<string, { ok: boolean; error?: string }>>({})

  function updateLot(id: string, patch: Partial<Lot>) {
    onUpdate({ ...submission, lots: submission.lots.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
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
        bcc: included.map((s) => s.email),
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

      {submission.lots.map((lot) => {
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
              <div className="flex gap-2 ml-auto">
                <button
                  className="btn-primary !py-1"
                  disabled={sendingLotId === lot.id || included.every((s) => !s.email) || !lot.emailSubject}
                  title={!lot.emailSubject ? "Aucun e-mail préparé pour ce lot" : undefined}
                  onClick={() => sendLot(lot)}
                >
                  🚀 {sendingLotId === lot.id ? 'Envoi...' : 'Envoyer ce lot'}
                </button>
                <button className="btn-secondary !py-1" onClick={() => onEditLot(lot.id)}>
                  ✎ Modifier fournisseurs / e-mail
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
              <p className="text-sm text-slate-400">
                Aucun fournisseur trouvé automatiquement pour ce lot —{' '}
                <button className="underline" onClick={() => onEditLot(lot.id)}>
                  ouvrez-le pour en ajouter manuellement
                </button>
                .
              </p>
            ) : (
              <table className="w-full text-sm min-w-[500px]">
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
                      <td className="py-1.5 pr-2 text-slate-500">
                        {s.email || <span className="text-amber-600">pas d'e-mail</span>}
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
          </div>
        )
      })}

      {submission.lots.length === 0 && (
        <p className="text-slate-500 text-sm">Aucun lot — importez un PDF dans l'onglet 1.</p>
      )}

      {previewLot && submission.pdfData && (
        <PdfPreviewModal lot={previewLot} pdfData={submission.pdfData} onClose={() => setPreviewLot(null)} />
      )}
    </div>
  )
}
