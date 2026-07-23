import { useEffect, useState } from 'react'
import type { Submission } from './types'
import { seedSuppliersIfEmpty } from './storage'
import SubmissionsList from './components/SubmissionsList'
import Workspace from './components/Workspace'

export default function App() {
  const [openSubmission, setOpenSubmission] = useState<Submission | null>(null)

  useEffect(() => {
    seedSuppliersIfEmpty([])
  }, [])

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-r from-brand-from to-brand-to text-white px-6 py-5">
        <h1 className="text-2xl font-bold">Outil sourcing — Demandes de prix soumission</h1>
        <p className="text-sm text-white/80 mt-1">
          Extraction par sous-chapitre → lots &amp; fournisseurs proposés → e-mail groupé avec PDF → suivi des offres
        </p>
      </header>

      {openSubmission ? (
        <Workspace
          submission={openSubmission}
          onChange={setOpenSubmission}
          onBack={() => setOpenSubmission(null)}
        />
      ) : (
        <SubmissionsList onOpen={setOpenSubmission} />
      )}
    </div>
  )
}
