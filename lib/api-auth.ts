import { NextResponse } from 'next/server'
import { auth } from './auth'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'COLABORADOR'
}

/** Retorna o usuário da sessão atual, ou null se não autenticado. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user) return null
  return session.user as unknown as SessionUser
}

/**
 * Exige um usuário autenticado.
 * Uso: `const u = await requireUser(); if (u instanceof NextResponse) return u`
 * — depois disso, `u` é um SessionUser.
 */
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return user
}

/** Exige um usuário com papel ADMIN. */
export async function requireAdmin(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return user
}
