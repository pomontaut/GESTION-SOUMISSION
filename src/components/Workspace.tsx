import { useEffect, useRef, useState } from 'react'
import type { Submission } from '../types'
import { saveSubmission } from '../storage'
import ExtractionTab from './ExtractionTab'
import LotsTab from './LotsTab'
import ValidationTab from './ValidationTab'
import DashboardTab from './DashboardTab'
import AnnexeTab from './AnnexeTab'
import ChatTab from './ChatTab'

type TabKey = 'extraction' | 'lots' | 'validation' | 'dashboard' | 'chat' | 'annexe'

// "lots" has no nav button - the agent (runLotAgent) now does that work automatically right
// after the PDF is imported. The tab itself stays reachable as a per-lot correction screen,
// opened from "validation" or "dashboard" when a lot's automatic suppliers/e-mail need a
// manual fix - it returns to whichever of the two opened it (see editReturnTab below).
const TABS: { key: TabKey; label: string }[] = [
  { key: 'extraction', label: '1. Soumission' },
  { key: 'validation', label: '2. Validation & envoi' },
  { key: 'dashboard', label: '3. Suivi' },
  { key: 'chat', label: '4. Chat agent' },
  { key: 'annexe', label: '5. Annexe — Méthode de détection' },
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
  const [editReturnTab, setEditReturnTab] = useState<TabKey>('validation')
  const saveTimeout = useRef<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  function openLotEditor(lotId: string) {
    setEditLotId(lotId)
    setEditReturnTab(tab === 'dashboard' ? 'dashboard' : 'validation')
    setTab('lots')
  }

  function update(next: Submission) {
    const withTimestamp = { ...next, updatedAt: new Date().toISOString() }
    onChange(withTimestamp)
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current)
    saveTimeout.current = window.setTimeout(() => {
      saveSubmission(withTimestamp)
        .then(() => setSaveError(null))
        .catch((err) => {
          console.error('Enregistrement impossible', err)
          setSaveError(err instanceof Error ? err.message : 'Erreur inconnue')
        })
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

      {saveError && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-sm px-6 py-2">
          ⚠ Enregistrement sur le serveur impossible ({saveError}). Le PDF et vos modifications ne sont pas sauvegardés : ne fermez pas la page et réessayez (une nouvelle modification relance l'enregistrement).
        </div>
      )}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {tab === 'extraction' && (
          <ExtractionTab submission={submission} onUpdate={update} onImported={() => setTab('validation')} />
        )}
        {tab === 'lots' && (
          <LotsTab
            submission={submission}
            onUpdate={update}
            initialSelectedId={editLotId}
            onBack={() => setTab(editReturnTab)}
          />
        )}
        {tab === 'validation' && (
          <ValidationTab submission={submission} onUpdate={update} onEditLot={openLotEditor} />
        )}
        {tab === 'dashboard' && <DashboardTab submission={submission} onUpdate={update} onEditLot={openLotEditor} />}
        {tab === 'chat' && <ChatTab submission={submission} />}
        {tab === 'annexe' && <AnnexeTab />}
      </div>
    </div>
  )
}
