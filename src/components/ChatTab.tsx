import { useEffect, useRef, useState } from 'react'
import { toBase64 } from '../pdf/base64'
import type { Submission } from '../types'
import { ALL_CATEGORIES } from '../data/suppliers'
import { applyRulesToExistingLots } from '../agent/rules'
import { listAgentRules, listSuppliers } from '../storage'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}
interface Consigne {
  id: string
  scope: string
  text: string
  rule?: unknown
}

const SCOPE_LABELS: Record<string, string> = {
  general: 'Général',
  recherche_fournisseurs: 'Recherche fournisseurs',
  detection_lots: 'Détection des lots',
  tco: 'TCO',
}

interface Attachment {
  name: string
  mediaType?: string
  base64?: string
  text?: string
}

const MAX_FILES = 5
const MAX_TOTAL_BYTES = 10 * 1024 * 1024
const NATIVE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** Lit un fichier déposé : PDF/images tels quels, tableaux Excel et textes convertis en texte. */
async function readAttachment(file: File): Promise<Attachment> {
  const lower = file.name.toLowerCase()
  if (NATIVE_TYPES.includes(file.type)) {
    return { name: file.name, mediaType: file.type, base64: toBase64(new Uint8Array(await file.arrayBuffer())) }
  }
  if (lower.endsWith('.xlsx')) {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const parts: string[] = []
    wb.eachSheet((ws) => {
      parts.push(`# Feuille « ${ws.name} »`)
      ws.eachRow((row) => {
        const cells = (row.values as unknown[]).slice(1).map((v) => {
          if (v && typeof v === 'object' && 'result' in v) return String((v as { result: unknown }).result ?? '')
          if (v && typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text ?? '')
          return v == null ? '' : String(v)
        })
        parts.push(cells.join(' ; '))
      })
    })
    return { name: file.name, text: parts.join('\n') }
  }
  if (file.type.startsWith('text/') || /\.(txt|csv|md|json|tsv)$/.test(lower)) {
    return { name: file.name, text: await file.text() }
  }
  throw new Error(`Format non pris en charge : ${file.name} (PDF, images, Excel .xlsx, texte/CSV)`)
}

async function check(res: Response): Promise<Response> {
  if (!res.ok) {
    let message = `Erreur ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return res
}

/** Résumé compact des lots de la soumission ouverte, donné à l'agent comme contexte. */
function submissionContext(s: Submission): string {
  const lines = s.lots.slice(0, 80).map((l) => {
    const names = l.suppliers.map((x) => x.name).join(', ') || 'aucun fournisseur'
    return `- ${l.cfcCode} ${l.chapterCode} « ${l.title} » (${l.prestationType}) → ${names}`
  })
  return `Soumission « ${s.info.projectName || s.name} »\n${lines.join('\n')}`
}

export default function ChatTab({ submission, onUpdate }: { submission: Submission; onUpdate: (s: Submission) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [consignes, setConsignes] = useState<Consigne[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applyInfo, setApplyInfo] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)

  async function load() {
    const data = await check(await fetch('/api/agent-chat')).then((r) => r.json())
    setMessages(data.messages)
    setConsignes(data.consignes)
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  /** Applique toutes les règles exécutables aux lots déjà extraits de la soumission ouverte. */
  async function applyRules(): Promise<void> {
    const [suppliers, rules] = await Promise.all([listSuppliers(), listAgentRules()])
    const { lots, changed } = applyRulesToExistingLots(submission.lots, suppliers, rules)
    if (changed > 0) onUpdate({ ...submission, lots })
    setApplyInfo(
      changed > 0
        ? `${changed} lot(s) mis à jour par les règles (fournisseurs ajoutés/retirés). Vérifiez-les dans « 2. Validation & envoi ».`
        : 'Les règles sont déjà reflétées dans tous les lots : rien à modifier.',
    )
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setError(null)
    try {
      if (attachments.length + list.length > MAX_FILES) throw new Error(`${MAX_FILES} pièces jointes maximum par message`)
      const total = list.reduce((n, f) => n + f.size, 0) + attachments.reduce((n, a) => n + (a.base64?.length ?? a.text?.length ?? 0), 0)
      if (total > MAX_TOTAL_BYTES) throw new Error('Pièces jointes trop volumineuses (10 Mo au total)')
      const read = await Promise.all(list.map(readAttachment))
      setAttachments((a) => [...a, ...read])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture du fichier impossible')
    }
  }

  async function send() {
    const text = input.trim()
    if ((!text && attachments.length === 0) || sending) return
    setSending(true)
    setError(null)
    setInput('')
    const sentFiles = attachments
    setAttachments([])
    setMessages((m) => [
      ...m,
      { id: `tmp-${Date.now()}`, role: 'user', content: [text, sentFiles.length ? `📎 ${sentFiles.map((f) => f.name).join(', ')}` : ''].filter(Boolean).join('\n') },
    ])
    try {
      const reply = await check(
        await fetch('/api/agent-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, context: submissionContext(submission), categories: ALL_CATEGORIES, attachments: sentFiles }),
        }),
      )
      const data = await reply.json()
      await load()
      if (data.rulesChanged) await applyRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSending(false)
    }
  }

  async function removeConsigne(id: string) {
    if (!confirm('Supprimer cette consigne ? L\'agent ne l\'appliquera plus.')) return
    try {
      await check(await fetch(`/api/agent-chat/consignes/${id}`, { method: 'DELETE' }))
      setConsignes((c) => c.filter((x) => x.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div
        className={`lg:col-span-2 card flex flex-col ${dragging ? 'ring-2 ring-indigo-400 bg-indigo-50' : ''}`}
        style={{ minHeight: '60vh' }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addFiles(e.dataTransfer.files)
        }}
      >
        <h2 className="text-lg font-semibold mb-1">Chat avec l'agent</h2>
        <p className="text-sm text-slate-500 mb-4">
          Écrivez ici vos retours (« pour ce type de lot, il faut aussi consulter X », « ne propose plus Y pour… »). L'agent
          reformule la règle et la mémorise : elle est réappliquée à chaque nouvelle analyse. Il connaît les lots de la
          soumission ouverte. Joignez un fichier avec 📎 ou en le glissant ici (PDF, image, Excel, texte ; 5 max, 10 Mo).
        </p>
        <div className="flex-1 space-y-3 overflow-y-auto mb-4" style={{ maxHeight: '55vh' }}>
          {messages.length === 0 && !sending && <p className="text-sm text-slate-400">Aucun message pour l'instant.</p>}
          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
              <div
                className={`inline-block max-w-[85%] text-left whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {sending && <p className="text-sm text-slate-400">L'agent réfléchit…</p>}
          <div ref={endRef} />
        </div>
        {error && <p className="text-sm text-red-600 mb-2">⚠ {error}</p>}
        {dragging && <p className="text-sm text-indigo-600 mb-2">Déposez vos fichiers ici (PDF, image, Excel, texte)</p>}
        {attachments.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
            {attachments.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 rounded-full px-2 py-1">
                📎 {a.name}
                <button className="text-slate-400 hover:text-red-600" onClick={() => setAttachments((l) => l.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            rows={2}
            placeholder="Votre commentaire d'amélioration… (Entrée pour envoyer, Maj+Entrée pour un retour à la ligne)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.xlsx,.csv,.tsv,.txt,.md,.json"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <button className="btn-secondary" title="Joindre un fichier (ou glissez-le dans la fenêtre)" onClick={() => fileInputRef.current?.click()}>
            📎
          </button>
          <button className="btn-primary" disabled={sending || (!input.trim() && attachments.length === 0)} onClick={send}>
            Envoyer
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-1">Consignes mémorisées ({consignes.length})</h3>
        <p className="text-xs text-slate-500 mb-3">
          ⚙ = règle appliquée automatiquement (nouvelles soumissions + lots ouverts). Sans ⚙ = consigne texte relue par les agents. Supprimez celles qui ne sont plus bonnes.
        </p>
        <button className="btn-secondary mb-3" onClick={() => applyRules().catch((e) => setError(e.message))}>
          Appliquer aux lots de cette soumission
        </button>
        {applyInfo && <p className="text-xs text-emerald-700 mb-3">{applyInfo}</p>}
        {consignes.length === 0 && <p className="text-sm text-slate-400">Aucune consigne.</p>}
        <ul className="space-y-2">
          {consignes.map((c) => (
            <li key={c.id} className="text-sm border border-slate-200 rounded-lg p-2">
              <span className="text-xs text-slate-500">{c.rule ? '⚙ ' : ''}{SCOPE_LABELS[c.scope] ?? c.scope}</span>
              <div>{c.text}</div>
              <button className="text-xs text-red-600 mt-1" onClick={() => removeConsigne(c.id)}>
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
