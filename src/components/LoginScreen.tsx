import { useState } from 'react'
import type { AuthUser } from '../auth'
import { login, register } from '../auth'

export default function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [registrationCode, setRegistrationCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const user =
        mode === 'login'
          ? await login(email, password)
          : await register(name, email, password, registrationCode)
      onAuthenticated(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Outil sourcing — Demandes de prix</h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === 'login' ? 'Connectez-vous à votre compte' : 'Créez votre compte'}
          </p>
        </div>

        {mode === 'register' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>

        {mode === 'register' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Code d'invitation</label>
            <input
              className="input"
              value={registrationCode}
              onChange={(e) => setRegistrationCode(e.target.value)}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" className="btn-primary w-full justify-center" disabled={submitting}>
          {submitting ? 'Patientez...' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
        </button>

        <button
          type="button"
          className="text-sm text-indigo-600 hover:underline w-full text-center"
          onClick={() => {
            setError(null)
            setMode(mode === 'login' ? 'register' : 'login')
          }}
        >
          {mode === 'login' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
        </button>
      </form>
    </div>
  )
}
