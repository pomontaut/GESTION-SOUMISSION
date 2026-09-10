import { useEffect, useRef, useState } from 'react'
import type { Submission } from '../types'
import { saveSubmission } from '../storage'
import ExtractionTab from './ExtractionTab'
import LotsTab from './LotsTab'
import DashboardTab from './DashboardTab'
import AnnexeTab from './AnnexeTab'

type TabKey = 'extraction' | 'lots' | 'dashboard' | 'annexe'

// "lots" has no nav button - the agent (runLotAgent) now does that work automatically right
// after the PDF is imported. The tab itself stays reachable as a per-lot correction screen,
// opened from the dashboard when a lot's automatic suppliers/e-mail need a manual fix.
const TABS: { key: TabKey; label: string }[] = [
  { key: 'extraction', label: '1. Soumission' },
  { key: 'dashboard', label: '2. Suivi & envois' },
  { key: 'annexe', label: '3. Annexe — Méthode de détection' },
]

export default function Workspace({
  submission,
  onChange,
  onBack,
}: {
  submission: Submission
  onChange: (s: Submission) => void
  onBack: () => void
}) {
  const [tab, setTab] = useState<TabKey>('extraction')
  const [editLotId, setEditLotId] = useState<string | null>(null)
  const saveTimeout = useRef<number | null>(null)

  function openLotEditor(lotId: string) {
    setEditLotId(lotId)
    setTab('lots')
  }

  function update(next: Submission) {
    const withTimestamp = { ...next, updatedAt: new Date().toISOString() }
    onChange(withTimestamp)
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current)
    saveTimeout.current = window.setTimeout(() => {
      saveSubmission(withTimestamp)
    }, 300)
  }

  useEffect(() => {
    return () => {
      if (saveTimeout.current) window.clearTimeout(saveTimeout.current)
    }
  }, [])

  return (
    <div>
      <nav className="bg-white border-b border-slate-200 px-6 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-button ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="bg-slate-50 px-6 py-3 flex items-center justify-between border-b border-slate-200">
        <span className="font-medium text-slate-700">
          📁 {submission.info.projectName || submission.name || 'Sans nom'}
        </span>
        <button className="btn-secondary" onClick={onBack}>
          ← Mes soumissions
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {tab === 'extraction' && (
          <ExtractionTab submission={submission} onUpdate={update} onImported={() => setTab('dashboard')} />
        )}
        {tab === 'lots' && (
          <LotsTab
            submission={submission}
            onUpdate={update}
            initialSelectedId={editLotId}
            onBack={() => setTab('dashboard')}
          />
        )}
        {tab === 'dashboard' && <DashboardTab submission={submission} onUpdate={update} onEditLot={openLotEditor} />}
        {tab === 'annexe' && <AnnexeTab />}
      </div>
    </div>
  )
}
