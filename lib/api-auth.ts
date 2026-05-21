import { NextResponse } from 'next/server'
import { auth } from './auth'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'COLABORADOR'
}

type Guard =
  | { user: SessionUser; response: null }
  | { user: null; response: NextResponse }

/** Retorna o usuário da sessão atual, ou null se não autenticado. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user) return null
  return session.user as unknown as SessionUser
}

/**
 * Exige um usuário autenticado.
 * Uso: `const { user, response } = await requireUser(); if (response) return response`
 */
export async function requireUser(): Promise<Guard> {
  const user = await getSessionUser()
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { user, response: null }
}

/** Exige um usuário com papel ADMIN. */
export async function requireAdmin(): Promise<Guard> {
  const user = await getSessionUser()
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (user.role !== 'ADMIN') {
    return { user: null, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, response: null }
}
