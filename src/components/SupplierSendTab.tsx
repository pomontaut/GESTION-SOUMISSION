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

type Mode = 'lot' | 'fournisseur'

/** Une unité d'envoi = un e-mail avec un PDF (lots concaténés) pour un ou plusieurs fournisseurs. */
interface SendUnit {
  id: string
  kind: 'lot' | 'fournisseur' | 'solidaire'
  groups: SupplierGroup[]
  lots: Lot[]
  note?: string
}

const titles = (lots: Lot[]) => lots.map((l) => `« ${l.title} »`).join(', ')

/**
 * Plan d'envoi proposé à l'acheteur une fois les listes de fournisseurs validées.
 * - « par fournisseur » : chaque fournisseur reçoit un seul e-mail/PDF avec tous ses lots.
 * - « par lot » : les fournisseurs qui ont EXACTEMENT les mêmes lots sont regroupés dans un seul
 *   envoi (le PDF des lots, tous en Cci). Un fournisseur dont l'ensemble de lots diffère de celui
 *   de fournisseurs qui ont quasi les mêmes lots que lui (présent sur un lot qu'ils n'ont pas, ou
 *   l'inverse) est traité à part, en mode « solidaire » : son propre e-mail avec ses lots.
 */
function planSends(pending: Array<{ group: SupplierGroup; lots: Lot[] }>, mode: Mode): SendUnit[] {
  const solo = (p: { group: SupplierGroup; lots: Lot[] }, kind: SendUnit['kind'], note?: string): SendUnit => ({
    id: `${kind}:${p.group.key}`,
    kind,
    groups: [p.group],
    lots: p.lots,
    note,
  })
  if (mode === 'fournisseur') return pending.map((p) => solo(p, 'fournisseur'))

  const sig = (p: { lots: Lot[] }) => p.lots.map((l) => l.id).sort().join('|')
  const buckets = new Map<string, Array<{ group: SupplierGroup; lots: Lot[] }>>()
  for (const p of pending) buckets.set(sig(p), [...(buckets.get(sig(p)) ?? []), p])

  const units: SendUnit[] = []
  for (const [signature, members] of buckets) {
    if (members.length >= 2) {
      units.push({ id: `lot:${signature}`, kind: 'lot', groups: members.map((m) => m.group), lots: members[0].lots })
      continue
    }
    const me = members[0]
    const mine = new Set(me.lots.map((l) => l.id))
    let best: { members: typeof members; score: number; other: Set<string>; lots: Lot[] } | null = null
    for (const [otherSig, others] of buckets) {
      if (otherSig === signature) continue
      const other = new Set(others[0].lots.map((l) => l.id))
      const inter = [...mine].filter((id) => other.has(id)).length
      const score = inter / (mine.size + other.size - inter)
      if (score >= 0.5 && (!best || score > best.score)) best = { members: others, score, other, lots: others[0].lots }
    }
    if (!best) {
      units.push(solo(me, 'solidaire', 'Lots propres à ce fournisseur : envoi individuel.'))
      continue
    }
    const extra = me.lots.filter((l) => !best!.other.has(l.id))
    const missing = best.lots.filter((l) => !mine.has(l.id))
    const names = best.members.slice(0, 3).map((m) => m.group.name).join(', ') + (best.members.length > 3 ? '…' : '')
    const diff = [extra.length ? `est aussi sur ${titles(extra)}` : '', missing.length ? `n'est pas sur ${titles(missing)}` : '']
      .filter(Boolean)
      .join(' et ')
    units.push(solo(me, 'solidaire', `Mode solidaire : traité à part car il ${diff}, contrairement à ${names} qui ont quasi les mêmes lots.`))
  }
  return units
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
  const [mode, setMode] = useState<Mode>('lot')
  const [includeUnvalidated, setIncludeUnvalidated] = useState(false)
  const [selected, setSelected] = useState<Record<string, Set<string>>>({}) // groupKey -> lotIds cochés
  const [openUnitId, setOpenUnitId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const eligibleLots = useMemo(
    () => submission.lots.filter((l) => includeUnvalidated || l.validated),
    [submission.lots, includeUnvalidated],
  )
  const unvalidatedCount = submission.lots.filter((l) => !l.validated).length
  const allGroups = useMemo(() => groupBySupplier(eligibleLots), [eligibleLots])

  const isChecked = (g: SupplierGroup, e: SupplierEntry) =>
    !e.sentDate && (selected[g.key] ? selected[g.key].has(e.lot.id) : true)

  function toggle(g: SupplierGroup, lotId: string, on: boolean) {
    const current = selected[g.key] ?? new Set(g.entries.filter((e) => !e.sentDate).map((e) => e.lot.id))
    const next = new Set(current)
    if (on) next.add(lotId)
    else next.delete(lotId)
    setSelected({ ...selected, [g.key]: next })
  }

  // Lots restant à envoyer par fournisseur (cochés), base du plan d'envoi.
  const pending = useMemo(
    () =>
      allGroups
        .map((g) => ({ group: g, lots: g.entries.filter((e) => isChecked(g, e)).map((e) => e.lot) }))
        .filter((p) => p.lots.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allGroups, selected],
  )
  const units = useMemo(
    () =>
      planSends(pending, mode)
        .filter((u) => !filter || u.groups.some((g) => normName(g.name).includes(normName(filter))))
        .sort((a, b) => (a.kind === b.kind ? a.groups[0].name.localeCompare(b.groups[0].name, 'fr') : a.kind === 'lot' ? -1 : 1)),
    [pending, mode, filter],
  )
  const openUnit = units.find((u) => u.id === openUnitId) ?? null

  function markSent(unit: SendUnit) {
    const today = new Date().toISOString().slice(0, 10)
    const lotIds = new Set(unit.lots.map((l) => l.id))
    onUpdate({
      ...submission,
      lots: submission.lots.map((lot) => {
        if (!lotIds.has(lot.id)) return lot
        const ids = new Set(
          unit.groups.flatMap((g) => g.entries.find((e) => e.lot.id === lot.id)?.supplierIds ?? []),
        )
        return {
          ...lot,
          followUp: lot.followUp.map((f) =>
            ids.has(f.supplierId) ? { ...f, status: 'envoye' as const, sentDate: f.sentDate ?? today } : f,
          ),
        }
      }),
    })
  }

  const unitLabel = (u: SendUnit) => u.groups.map((g) => g.name).join(', ')

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Une fois les listes de fournisseurs validées par lot (onglet « Validation &amp; envoi »), l'agent propose ici
        le regroupement des envois. <b>Par lot</b> : les fournisseurs qui ont exactement les mêmes lots reçoivent un
        seul e-mail (PDF des lots concaténés) ; un fournisseur dont les lots diffèrent de ceux de fournisseurs
        quasi identiques est traité à part, en mode <b>solidaire</b>. <b>Par fournisseur</b> : chaque fournisseur
        reçoit un seul e-mail avec tous ses lots. Un lot déjà envoyé à un fournisseur depuis l'onglet 2 n'est plus proposé.
      </p>

      {!submission.pdfData && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ⚠ PDF d'origine introuvable sur le serveur : ré-importez-le dans l'onglet Soumission. Les envois sont bloqués tant qu'il manque.
        </p>
      )}

      {unvalidatedCount > 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {unvalidatedCount} lot(s) sans liste de fournisseurs validée {includeUnvalidated ? '(inclus dans le plan)' : '(exclus du plan)'} — validez-les dans l'onglet « 2. Validation &amp; envoi ».{' '}
          <label className="inline-flex items-center gap-1 cursor-pointer select-none underline">
            <input type="checkbox" checked={includeUnvalidated} onChange={(e) => setIncludeUnvalidated(e.target.checked)} />
            les inclure quand même
          </label>
        </p>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          {(['lot', 'fournisseur'] as Mode[]).map((m) => (
            <button
              key={m}
              className={`px-3 py-1.5 ${mode === m ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}
              onClick={() => setMode(m)}
            >
              {m === 'lot' ? 'Par lot (proposition de l\'agent)' : 'Par fournisseur'}
            </button>
          ))}
        </div>
        <input className="input max-w-xs" placeholder="Filtrer par fournisseur…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="text-sm text-slate-400">{units.length} envoi(s) à faire</span>
      </div>

      {units.length === 0 && <p className="text-sm text-slate-400">Aucun envoi à faire (tout est envoyé, ou aucun lot validé).</p>}

      {units.map((u) => (
        <div key={u.id} className="card">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <span
              className={`px-2 py-0.5 rounded-full text-xs ${
                u.kind === 'lot' ? 'bg-indigo-100 text-indigo-700' : u.kind === 'solidaire' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {u.kind === 'lot' ? `Envoi groupé · ${u.groups.length} fournisseurs` : u.kind === 'solidaire' ? 'Solidaire' : 'Par fournisseur'}
            </span>
            <h3 className="font-semibold text-slate-800">{unitLabel(u)}</h3>
            <button
              className="btn-primary !py-1 ml-auto"
              disabled={!submission.pdfData}
              onClick={() => setOpenUnitId(u.id)}
            >
              ✉ Préparer l'envoi ({u.lots.length} lot{u.lots.length > 1 ? 's' : ''})
            </button>
          </div>
          {u.note && <p className="text-xs text-amber-700 mb-2">{u.note}</p>}
          {u.kind === 'lot' && (
            <p className="text-xs text-slate-500 mb-2">
              {u.groups.map((g) => `${g.name} (${g.emails.join(', ') || '⚠ adresse manquante'})`).join(' · ')}
            </p>
          )}
          {u.kind !== 'lot' && u.groups[0].emails.length === 0 && <p className="text-xs text-red-600 mb-2">⚠ adresse e-mail manquante</p>}
          {u.kind !== 'lot' && u.groups[0].emails.length > 0 && <p className="text-xs text-slate-500 mb-2">{u.groups[0].emails.join(', ')}</p>}
          <ul className="space-y-1">
            {u.kind === 'lot'
              ? u.lots.map((l) => (
                  <li key={l.id} className="text-sm text-slate-700">
                    {l.cfcCode ? `CFC ${l.cfcCode} — ` : ''}
                    {l.title} <span className="text-xs text-slate-400">pages {l.pages.join(', ')}</span>
                  </li>
                ))
              : u.groups[0].entries.map((e) => (
                  <li key={e.lot.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={e.sentDate !== undefined}
                      checked={isChecked(u.groups[0], e)}
                      onChange={(ev) => toggle(u.groups[0], e.lot.id, ev.target.checked)}
                    />
                    <span className={e.sentDate !== undefined ? 'text-slate-400' : 'text-slate-700'}>
                      {e.lot.cfcCode ? `CFC ${e.lot.cfcCode} — ` : ''}
                      {e.lot.title}
                    </span>
                    <span className="text-xs text-slate-400">pages {e.lot.pages.join(', ')}</span>
                    {e.sentDate !== undefined && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        Envoyé{e.sentDate ? ` le ${e.sentDate}` : ''}
                      </span>
                    )}
                  </li>
                ))}
          </ul>
        </div>
      ))}

      {openUnit && (
        <SupplierSendModal
          unit={openUnit}
          label={unitLabel(openUnit)}
          submission={submission}
          onClose={() => setOpenUnitId(null)}
          onSent={() => {
            markSent(openUnit)
            setOpenUnitId(null)
          }}
        />
      )}
    </div>
  )
}

function SupplierSendModal({
  unit,
  label,
  submission,
  onClose,
  onSent,
}: {
  unit: SendUnit
  label: string
  submission: Submission
  onClose: () => void
  onSent: () => void
}) {
  const lots = unit.lots
  // `lots` est recalculé à chaque rendu du parent : on ne dépend que de la liste des lots cochés.
  const lotKey = lots.map((l) => l.id).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draft = useMemo(() => buildSupplierEmail(lots, submission.info), [lotKey])
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [bccText, setBccText] = useState([...new Set(unit.groups.flatMap((g) => g.emails))].join(', '))
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
      if (bccList.length === 0) throw new Error('Aucun destinataire pour cet envoi')
      await sendLotEmail({
        bcc: bccList,
        subject,
        text: body,
        html: buildEmailHtml(body),
        attachment: {
          filename: `${safeFileName(submission.info.siteNumber || submission.name) || 'soumission'}-${safeFileName(unit.kind === 'lot' ? lots.map((l) => l.chapterCode || l.cfcCode).filter(Boolean).join('-') || 'lots' : label).slice(0, 60)}.pdf`,
          content: toBase64(pdfBytes),
        },
      })
      onSent()
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
            Envoi — {label} ({lots.length} lot{lots.length > 1 ? 's' : ''})
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
              🚀 {sending ? 'Envoi…' : unit.groups.length > 1 ? `Envoyer aux ${unit.groups.length} fournisseurs` : `Envoyer à ${label}`}
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
