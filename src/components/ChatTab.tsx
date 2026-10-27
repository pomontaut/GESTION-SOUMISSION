import { useEffect, useRef, useState } from 'react'
import type { Submission } from '../types'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}
interface Consigne {
  id: string
  scope: string
  text: string
}

const SCOPE_LABELS: Record<string, string> = {
  general: 'Général',
  recherche_fournisseurs: 'Recherche fournisseurs',
  detection_lots: 'Détection des lots',
  tco: 'TCO',
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

export default function ChatTab({ submission }: { submission: Submission }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [consignes, setConsignes] = useState<Consigne[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

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

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    setInput('')
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: text }])
    try {
      await check(
        await fetch('/api/agent-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, context: submissionContext(submission) }),
        }),
      )
      await load()
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
      <div className="lg:col-span-2 card flex flex-col" style={{ minHeight: '60vh' }}>
        <h2 className="text-lg font-semibold mb-1">Chat avec l'agent</h2>
        <p className="text-sm text-slate-500 mb-4">
          Écrivez ici vos retours (« pour ce type de lot, il faut aussi consulter X », « ne propose plus Y pour… »). L'agent
          reformule la règle et la mémorise : elle est réappliquée à chaque nouvelle analyse. Il connaît les lots de la
          soumission ouverte.
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
          <button className="btn-primary" disabled={sending || !input.trim()} onClick={send}>
            Envoyer
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-1">Consignes mémorisées ({consignes.length})</h3>
        <p className="text-xs text-slate-500 mb-3">Règles que l'agent applique. Supprimez celles qui ne sont plus bonnes.</p>
        {consignes.length === 0 && <p className="text-sm text-slate-400">Aucune consigne.</p>}
        <ul className="space-y-2">
          {consignes.map((c) => (
            <li key={c.id} className="text-sm border border-slate-200 rounded-lg p-2">
              <span className="text-xs text-slate-500">{SCOPE_LABELS[c.scope] ?? c.scope}</span>
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
