import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set')
}

export interface AuthUser {
  id: string
  email: string
  name: string
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET as string, { expiresIn: '30d' })
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  if (!token) {
    res.status(401).json({ error: 'Authentification requise' })
    return
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET as string) as AuthUser
    next()
  } catch {
    res.status(401).json({ error: 'Session invalide, merci de vous reconnecter' })
  }
}
