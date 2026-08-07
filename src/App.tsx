import { useEffect, useState } from 'react'
import type { Submission } from './types'
import { seedSuppliersIfEmpty } from './storage'
import { buildSupplierSeed } from './data/suppliers'
import type { AuthUser } from './auth'
import { getUser, logout } from './auth'
import SubmissionsList from './components/SubmissionsList'
import Workspace from './components/Workspace'
import LoginScreen from './components/LoginScreen'

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getUser())
  const [openSubmission, setOpenSubmission] = useState<Submission | null>(null)

  useEffect(() => {
    if (user) seedSuppliersIfEmpty(buildSupplierSeed())
  }, [user])

  if (!user) {
    return <LoginScreen onAuthenticated={setUser} />
  }

  function handleLogout() {
    logout()
    setOpenSubmission(null)
    setUser(null)
  }

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-r from-brand-from to-brand-to text-white px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Outil sourcing — Demandes de prix soumission</h1>
          <p className="text-sm text-white/80 mt-1">
            Extraction par sous-chapitre → lots &amp; fournisseurs proposés → e-mail groupé avec PDF → suivi des offres
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-white/90">{user.name}</span>
          <button className="btn-secondary" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
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
