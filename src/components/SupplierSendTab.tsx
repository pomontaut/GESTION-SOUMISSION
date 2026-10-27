import { useEffect, useMemo, useState } from 'react'
import type { Lot, Submission } from '../types'
import { buildSupplierEmail } from '../email/draftEmail'
import { buildEmailHtml } from '../email/htmlEmail'
import { extractLotsPdf } from '../pdf/extractPages'
import { toBase64 } from '../pdf/base64'
import { sendLotEmail } from '../storage'

interface SupplierEntry {
  lot: Lot
  /** supplierIds de ce fournisseur présents sur ce lot (une même société peut avoir plusieurs lignes) */
  supplierIds: string[]
  sentDate?: string
}
interface SupplierGroup {
  key: string
  name: string
  emails: string[]
  entries: SupplierEntry[]
}

const normName = (n: string) => n.toLowerCase().replace(/\(.*?\)/g, ' ').split(/\s+/).filter(Boolean).join(' ')
const splitEmails = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)

/** Regroupe les lots par fournisseur : une société = une adresse e-mail (plusieurs lignes de la
 *  base peuvent pointer la même société), à défaut son nom. Les fournisseurs ignorés sur un lot
 *  n'y sont pas comptés. */
function groupBySupplier(lots: Lot[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>()
  for (const lot of lots) {
    for (const s of lot.suppliers) {
      if (s.status === 'ignore') continue
      const emails = splitEmails(s.email ?? '').map((e) => e.toLowerCase())
      const key = emails.length ? [...emails].sort().join('|') : `nom:${normName(s.name)}`
      let g = groups.get(key)
      if (!g) {
        g = { key, name: s.name, emails: splitEmails(s.email ?? ''), entries: [] }
        groups.set(key, g)
      }
      let entry = g.entries.find((e) => e.lot.id === lot.id)
      if (!entry) {
        entry = { lot, supplierIds: [] }
        g.entries.push(entry)
      }
      entry.supplierIds.push(s.supplierId)
    }
  }
  for (const g of groups.values()) {
    for (const e of g.entries) {
      const sent = e.lot.followUp.filter((f) => e.supplierIds.includes(f.supplierId) && f.status === 'envoye')
      if (sent.length > 0) e.sentDate = sent[0].sentDate ?? ''
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

function safeFileName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function SupplierSendTab({
  submission,
  onUpdate,
}: {
  submission: Submission
  onUpdate: (s: Submission) => void
}) {
  const groups = useMemo(() => groupBySupplier(submission.lots), [submission.lots])
  const [selected, setSelected] = useState<Record<string, Set<string>>>({}) // groupKey -> lotIds cochés
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [onlyPending, setOnlyPending] = useState(true)

  const isChecked = (g: SupplierGroup, e: SupplierEntry) =>
    !e.sentDate && (selected[g.key] ? selected[g.key].has(e.lot.id) : true)

  function toggle(g: SupplierGroup, lotId: string, on: boolean) {
    const current = selected[g.key] ?? new Set(g.entries.filter((e) => !e.sentDate).map((e) => e.lot.id))
    const next = new Set(current)
    if (on) next.add(lotId)
    else next.delete(lotId)
    setSelected({ ...selected, [g.key]: next })
  }

  const visible = groups.filter((g) => {
    if (filter && !normName(g.name).includes(normName(filter))) return false
    if (onlyPending && g.entries.every((e) => e.sentDate)) return false
    return true
  })
  const openGroup = groups.find((g) => g.key === openKey) ?? null

  function markSent(g: SupplierGroup, lotIds: Set<string>) {
    const today = new Date().toISOString().slice(0, 10)
    onUpdate({
      ...submission,
      lots: submission.lots.map((lot) => {
        const entry = g.entries.find((e) => e.lot.id === lot.id)
        if (!entry || !lotIds.has(lot.id)) return lot
        return {
          ...lot,
          followUp: lot.followUp.map((f) =>
            entry.supplierIds.includes(f.supplierId) ? { ...f, status: 'envoye' as const, sentDate: f.sentDate ?? today } : f,
          ),
        }
      }),
    })
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Tous les lots d'un même fournisseur regroupés : un seul e-mail avec un seul PDF qui contient tous les lots
        cochés. Vous pouvez aussi envoyer lot par lot depuis l'onglet « Validation &amp; envoi » ; un lot déjà
        envoyé à un fournisseur n'est plus proposé ici (et inversement).
      </p>

      {!submission.pdfData && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ⚠ PDF d'origine introuvable sur le serveur : ré-importez-le dans l'onglet Soumission. Les envois sont bloqués tant qu'il manque.
        </p>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <input className="input max-w-xs" placeholder="Filtrer par fournisseur…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
          Masquer les fournisseurs entièrement envoyés
        </label>
        <span className="text-sm text-slate-400">{visible.length} fournisseur(s)</span>
      </div>

      {visible.length === 0 && <p className="text-sm text-slate-400">Aucun fournisseur à afficher.</p>}

      {visible.map((g) => {
        const checked = g.entries.filter((e) => isChecked(g, e))
        return (
          <div key={g.key} className="card">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h3 className="font-semibold text-slate-800">{g.name}</h3>
              <span className="text-xs text-slate-500">{g.emails.join(', ') || '⚠ adresse e-mail manquante'}</span>
              <span className="text-xs text-slate-400">
                {g.entries.length} lot(s) · {g.entries.filter((e) => e.sentDate !== undefined).length} déjà envoyé(s)
              </span>
              <button
                className="btn-primary !py-1 ml-auto"
                disabled={checked.length === 0 || !submission.pdfData}
                onClick={() => setOpenKey(g.key)}
              >
                ✉ Préparer l'envoi ({checked.length} lot{checked.length > 1 ? 's' : ''})
              </button>
            </div>
            <ul className="space-y-1">
              {g.entries.map((e) => (
                <li key={e.lot.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={e.sentDate !== undefined}
                    checked={isChecked(g, e)}
                    onChange={(ev) => toggle(g, e.lot.id, ev.target.checked)}
                  />
                  <span className={e.sentDate !== undefined ? 'text-slate-400' : 'text-slate-700'}>
                    {e.lot.cfcCode ? `CFC ${e.lot.cfcCode} — ` : ''}
                    {e.lot.title}
                  </span>
                  <span className="text-xs text-slate-400">
                    {e.lot.prestationType === 'fourniture' ? 'Fourniture' : 'Fourniture + pose'} · pages {e.lot.pages.join(', ')}
                  </span>
                  {e.sentDate !== undefined && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      Envoyé{e.sentDate ? ` le ${e.sentDate}` : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      {openGroup && (
        <SupplierSendModal
          group={openGroup}
          lots={openGroup.entries.filter((e) => isChecked(openGroup, e)).map((e) => e.lot)}
          submission={submission}
          onClose={() => setOpenKey(null)}
          onSent={(lotIds) => {
            markSent(openGroup, lotIds)
            setOpenKey(null)
          }}
        />
      )}
    </div>
  )
}

function SupplierSendModal({
  group,
  lots,
  submission,
  onClose,
  onSent,
}: {
  group: SupplierGroup
  lots: Lot[]
  submission: Submission
  onClose: () => void
  onSent: (lotIds: Set<string>) => void
}) {
  // `lots` est recalculé à chaque rendu du parent : on ne dépend que de la liste des lots cochés.
  const lotKey = lots.map((l) => l.id).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draft = useMemo(() => buildSupplierEmail(lots, submission.info), [lotKey])
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [bccText, setBccText] = useState(group.emails.join(', '))
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    if (!submission.pdfData) return
    let objectUrl: string | null = null
    extractLotsPdf(submission.pdfData, lots)
      .then((bytes) => {
        setPdfBytes(bytes)
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
        setPdfUrl(objectUrl)
      })
      .catch(() => setPdfError('Impossible de générer le PDF regroupé.'))
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotKey, submission.pdfData])

  const bccList = splitEmails(bccText)

  async function handleSend() {
    if (!pdfBytes) return
    setSending(true)
    setSendError(null)
    try {
      if (bccList.length === 0) throw new Error('Aucun destinataire pour ce fournisseur')
      await sendLotEmail({
        bcc: bccList,
        subject,
        text: body,
        html: buildEmailHtml(body),
        attachment: {
          filename: `${safeFileName(submission.info.siteNumber || submission.name) || 'soumission'}-${safeFileName(group.name)}.pdf`,
          content: toBase64(pdfBytes),
        },
      })
      onSent(new Set(lots.map((l) => l.id)))
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Échec de l'envoi")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-medium text-slate-800 truncate">
            Envoi groupé — {group.name} ({lots.length} lot{lots.length > 1 ? 's' : ''})
          </h3>
          <button className="btn-secondary" onClick={onClose}>
            ✕ Fermer
          </button>
        </div>
        <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
          <div className="md:w-1/2 p-4 overflow-y-auto space-y-3 border-b md:border-b-0 md:border-r border-slate-200">
            <div>
              <label className="label">Destinataires (Cci)</label>
              <textarea
                className="input h-16 text-sm"
                placeholder="adresse@exemple.ch, autre@exemple.ch"
                value={bccText}
                onChange={(e) => setBccText(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-0.5">Séparez plusieurs adresses par une virgule.</p>
            </div>
            <div>
              <label className="label">Objet</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="label">Corps du message</label>
              <textarea className="input h-64 font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            {sendError && <p className="text-sm text-red-600">⚠ {sendError}</p>}
            <button className="btn-primary w-full" disabled={sending || !pdfBytes || bccList.length === 0} onClick={handleSend}>
              🚀 {sending ? 'Envoi…' : `Envoyer à ${group.name}`}
            </button>
          </div>
          <div className="md:w-1/2 flex flex-col">
            <p className="px-4 py-2 text-xs text-slate-500 border-b border-slate-200">
              Pièce jointe : un seul PDF regroupant {lots.map((l) => l.title).join(' + ')}
            </p>
            {pdfError && <p className="p-4 text-sm text-red-600">{pdfError}</p>}
            {!pdfUrl && !pdfError && <p className="p-4 text-sm text-slate-500">Génération de la pièce jointe…</p>}
            {pdfUrl && <iframe title="PDF regroupé" src={pdfUrl} className="flex-1 w-full" />}
          </div>
        </div>
      </div>
    </div>
  )
}
