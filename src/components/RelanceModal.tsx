import { useState } from 'react'
import type { FollowUpEntry, Lot, SubmissionInfo } from '../types'
import { sendRelances } from '../storage'
import { buildEmailHtml } from '../email/htmlEmail'

export interface RelanceTarget {
  lot: Lot
  entry: FollowUpEntry
}

const TEMPLATE_KEY = 'relanceTemplate'

/** E-mail type de relance : variables {fournisseur} {lot} {cfc} {projet} {envoi} (« , envoyée le … » ou vide). */
export function defaultRelanceTemplate(info: SubmissionInfo, projet: string): { subject: string; body: string } {
  return {
    subject: `RELANCE – Demande de prix – ${projet} – CFC {cfc} {lot}`,
    body: [
      'Bonjour,',
      '',
      `Sauf erreur de notre part, nous n'avons pas encore reçu votre offre pour la demande de prix « {lot} » (CFC {cfc}) du projet ${projet}{envoi}.`,
      info.deadline
        ? `Nous vous remercions de nous la faire parvenir d'ici le ${info.deadline}.`
        : 'Nous vous remercions de nous la faire parvenir dans les meilleurs délais.',
      "Si vous ne souhaitez pas remettre d'offre, merci de nous en informer.",
      '',
      'Meilleures salutations,',
      info.calculatorName,
      info.calculatorPhone,
    ].join('\n'),
  }
}

function loadTemplate(): { subject: string; body: string } | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function fill(tpl: string, t: RelanceTarget, projet: string): string {
  const envoi = t.entry.sentDate ? `, envoyée le ${t.entry.sentDate}` : ''
  return tpl
    .replace(/\{fournisseur\}/g, t.entry.name)
    .replace(/\{lot\}/g, t.lot.title)
    .replace(/\{cfc\}/g, t.lot.cfcCode)
    .replace(/\{projet\}/g, projet)
    .replace(/\{envoi\}/g, envoi)
}

const splitEmails = (s: string) =>
  s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)

export default function RelanceModal({
  targets,
  info,
  projet,
  onClose,
  onSent,
}: {
  targets: RelanceTarget[]
  info: SubmissionInfo
  projet: string
  onClose: () => void
  /** Appelé avec les fournisseurs effectivement relancés (clé `lotId|supplierId`). */
  onSent: (sentKeys: string[]) => void
}) {
  const initial = loadTemplate() ?? defaultRelanceTemplate(info, projet)
  const [subject, setSubject] = useState(initial.subject)
  const [body, setBody] = useState(initial.body)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { ok: boolean; error?: string }> | null>(null)

  const keyOf = (t: RelanceTarget) => `${t.lot.id}|${t.entry.supplierId}`
  const active = targets.filter((t) => !excluded.has(keyOf(t)))
  const sample = active[0] ?? targets[0]

  function saveTemplate() {
    try {
      localStorage.setItem(TEMPLATE_KEY, JSON.stringify({ subject, body }))
    } catch {
      // stockage indisponible : le modèle reste valable pour cet envoi
    }
  }

  async function handleSend() {
    setError(null)
    setSending(true)
    saveTemplate()
    try {
      const messages = active.map((t) => {
        const text = fill(body, t, projet)
        return { id: keyOf(t), to: splitEmails(t.entry.email), subject: fill(subject, t, projet), text, html: buildEmailHtml(text) }
      })
      const { results: res } = await sendRelances(messages)
      const map: Record<string, { ok: boolean; error?: string }> = {}
      for (const r of res) map[r.id] = r
      setResults(map)
      const ok = res.filter((r) => r.ok).map((r) => r.id)
      if (ok.length) onSent(ok)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'envoi")
    } finally {
      setSending(false)
    }
  }

  const done = results !== null
  const failed = done ? Object.values(results!).filter((r) => !r.ok).length : 0

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-3">
          <h3 className="font-semibold text-slate-800">Relance en masse — {active.length} fournisseur(s)</h3>
          <button className="ml-auto text-slate-400 hover:text-slate-700 text-xl leading-none" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Un e-mail individuel part à chaque fournisseur (ils ne se voient pas entre eux) ; une copie de chacun arrive dans la boîte d'envoi soumissions@induni.ch.
        </p>

        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 mb-4 max-h-48 overflow-y-auto">
          {targets.map((t) => {
            const k = keyOf(t)
            const r = results?.[k]
            const invalid = splitEmails(t.entry.email).length === 0
            return (
              <label key={k} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  disabled={done}
                  checked={!excluded.has(k)}
                  onChange={(e) =>
                    setExcluded((prev) => {
                      const n = new Set(prev)
                      if (e.target.checked) n.delete(k)
                      else n.add(k)
                      return n
                    })
                  }
                />
                <span className="font-medium">{t.entry.name}</span>
                <span className="text-xs text-slate-400">
                  CFC {t.lot.cfcCode} · {t.entry.email || 'pas d\'adresse'}
                </span>
                {invalid && !r && <span className="text-xs text-amber-600 ml-auto">adresse manquante</span>}
                {r && (
                  <span className={`text-xs ml-auto ${r.ok ? 'text-green-600' : 'text-red-600'}`}>
                    {r.ok ? '✓ envoyé' : `✗ ${r.error ?? 'échec'}`}
                  </span>
                )}
              </label>
            )
          })}
        </div>

        <label className="label">Objet</label>
        <input className="input mb-2" value={subject} disabled={done} onChange={(e) => setSubject(e.target.value)} />
        <label className="label">E-mail type</label>
        <textarea className="input h-52 text-sm" value={body} disabled={done} onChange={(e) => setBody(e.target.value)} />
        <p className="text-xs text-slate-400 mt-1">
          Variables remplacées pour chaque fournisseur : {'{fournisseur}'} {'{lot}'} {'{cfc}'} {'{projet}'} {'{envoi}'} (« , envoyée le … »).
        </p>
        {sample && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-slate-500">Aperçu pour {sample.entry.name}</summary>
            <div className="mt-1 p-2 bg-slate-50 rounded border border-slate-200 whitespace-pre-wrap text-xs">
              <b>{fill(subject, sample, projet)}</b>
              {'\n\n'}
              {fill(body, sample, projet)}
            </div>
          </details>
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        {done && (
          <p className={`text-sm mt-3 ${failed ? 'text-amber-700' : 'text-green-700'}`}>
            {Object.values(results!).length - failed} relance(s) envoyée(s), datée(s) dans le suivi
            {failed ? ` — ${failed} en échec (non datée(s), à refaire)` : ''}.
          </p>
        )}

        <div className="flex gap-2 mt-4">
          {!done && (
            <button className="btn-primary" disabled={sending || active.length === 0 || !subject.trim() || !body.trim()} onClick={handleSend}>
              {sending ? '⏳ Envoi…' : `✉️ Envoyer ${active.length} relance(s)`}
            </button>
          )}
          <button className="btn-secondary" onClick={saveTemplate} disabled={done} title="Mémorise cet e-mail type dans ce navigateur">
            Mémoriser comme e-mail type
          </button>
          <button className="btn-secondary ml-auto" onClick={onClose}>
            {done ? 'Fermer' : 'Annuler'}
          </button>
        </div>
      </div>
    </div>
  )
}
