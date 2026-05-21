import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

/**
 * Middleware de autenticação: roda ANTES de qualquer página ser renderizada.
 * Garante que rotas protegidas nunca sejam servidas sem sessão válida.
 *
 * Obs.: o Next.js 16 exige um export de função reconhecível (default ou
 * `middleware`). O padrão `export const { auth: middleware }` do next-auth
 * NÃO é aceito aqui — por isso usamos `export default`.
 */
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  // Protege todas as rotas, exceto:
  // - /api/*    (as rotas de API fazem sua própria checagem de sessão)
  // - /_next/*  (assets internos do Next)
  // - arquivos com extensão (favicon.ico, imagens, etc.)
  matcher: ['/((?!api|_next|.*\\..*).*)'],
}
