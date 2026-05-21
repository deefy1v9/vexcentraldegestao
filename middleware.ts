import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

/**
 * Middleware de autenticação: roda ANTES de qualquer página ser renderizada.
 * Garante que rotas protegidas nunca sejam servidas sem sessão válida —
 * inclusive páginas que o Next poderia tentar renderizar estaticamente.
 */
export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  // Protege todas as rotas, exceto:
  // - /api/*        (as rotas de API fazem sua própria checagem de sessão)
  // - /_next/*      (assets internos do Next)
  // - arquivos com extensão (favicon.ico, imagens, etc.)
  matcher: ['/((?!api|_next|.*\\..*).*)'],
}
