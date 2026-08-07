export interface AuthUser {
  id: string
  email: string
  name: string
}

const TOKEN_KEY = 'gs_token'
const USER_KEY = 'gs_user'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (body?.error) return body.error
  } catch {
    // ignore
  }
  return `Erreur ${res.status}`
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  const { token, user } = await res.json()
  setSession(token, user)
  return user
}

export async function register(
  name: string,
  email: string,
  password: string,
  registrationCode: string,
): Promise<AuthUser> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, registrationCode }),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  const { token, user } = await res.json()
  setSession(token, user)
  return user
}
