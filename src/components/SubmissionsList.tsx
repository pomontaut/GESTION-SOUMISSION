import { useEffect, useState } from 'react'
import type { Submission } from '../types'
import { emptySubmissionInfo, uid } from '../types'
import { deleteSubmission, getSubmission, listSubmissions, saveSubmission } from '../storage'

export default function SubmissionsList({ onOpen }: { onOpen: (s: Submission) => void }) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [openingId, setOpeningId] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setSubmissions(await listSubmissions())
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function open(s: Submission) {
    setOpeningId(s.id)
    try {
      const full = await getSubmission(s.id)
      onOpen(full ?? s)
    } finally {
      setOpeningId(null)
    }
  }

  async function createNew() {
    const now = new Date().toISOString()
    const submission: Submission = {
      id: uid(),
      name: 'Sans nom',
      createdAt: now,
      updatedAt: now,
      info: emptySubmissionInfo(),
      zones: [],
      lots: [],
    }
    await saveSubmission(submission)
    onOpen(submission)
  }

  async function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Supprimer définitivement cette soumission ?')) return
    await deleteSubmission(id)
    refresh()
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-800">Mes soumissions</h2>
        <button className="btn-primary" onClick={createNew}>
          + Nouvelle soumission
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : submissions.length === 0 ? (
        <div className="card text-center text-slate-500">
          Aucune soumission pour l'instant. Cliquez sur « + Nouvelle soumission » pour commencer.
        </div>
      ) : (
        <div className="grid gap-3">
          {submissions.map((s) => (
            <button
              key={s.id}
              onClick={() => open(s)}
              disabled={openingId === s.id}
              className="card text-left flex items-center justify-between hover:border-indigo-300 transition-colors disabled:opacity-60"
            >
              <div>
                <div className="font-medium text-slate-800">
                  📁 {s.info.projectName || s.name || 'Sans nom'}
                </div>
                <div className="text-sm text-slate-500 mt-0.5">
                  {s.info.siteNumber ? `N° ${s.info.siteNumber} · ` : ''}
                  {s.lots.length} lot(s) · mis à jour le {new Date(s.updatedAt).toLocaleDateString('fr-CH')}
                  {openingId === s.id ? ' · ouverture…' : ''}
                </div>
              </div>
              <span className="btn-danger" onClick={(e) => remove(s.id, e)}>
                Supprimer
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
