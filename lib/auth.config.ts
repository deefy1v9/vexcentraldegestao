import type { NextAuthConfig } from 'next-auth'
import { NextResponse } from 'next/server'

/**
 * Configuração de autenticação compartilhada e segura para o Edge Runtime.
 *
 * IMPORTANTE: NÃO importe Prisma, bcrypt ou qualquer módulo de Node aqui —
 * este arquivo é usado pelo middleware.ts, que roda no Edge Runtime.
 * O provider de credenciais (que usa Prisma/bcrypt) fica só em lib/auth.ts.
 */
/**
 * Rotas que só administradores acessam. O colaborador fica com o dashboard,
 * a lista de clientes (somente leitura) e as próprias demandas.
 */
const ADMIN_ONLY = [
  /^\/colaboradores/,
  /^\/calendario/,
  /^\/crm/,
  /^\/financeiro/,
  /^\/logs/,
  /^\/clientes\/novo/,
  /^\/clientes\/[^/]+\/editar/,
]

export const authConfig = {
  // Necessário ao rodar atrás de um proxy reverso (Traefik) fora da Vercel.
  // Sem isto o next-auth v5 lança UntrustedHost e a sessão nunca resolve.
  trustHost: true,
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    /**
     * Executado pelo middleware a cada requisição. Decide se a rota pode
     * ser acessada. Sem sessão → next-auth redireciona para /login.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnLogin = nextUrl.pathname === '/login'

      if (isOnLogin) {
        // Já autenticado tentando ver o login → vai para o dashboard.
        if (isLoggedIn) return NextResponse.redirect(new URL('/dashboard', nextUrl.origin))
        return true
      }

      // Qualquer outra rota exige sessão válida.
      if (!isLoggedIn) return false

      // Áreas exclusivas de administrador. Barrar aqui cobre também as
      // telas que são client components (cadastro/edição de cliente), onde
      // não dá para checar a sessão no servidor.
      const isAdmin = (auth?.user as { role?: string } | undefined)?.role === 'ADMIN'
      if (!isAdmin && ADMIN_ONLY.some((r) => r.test(nextUrl.pathname))) {
        return NextResponse.redirect(new URL('/dashboard', nextUrl.origin))
      }

      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        ;(session.user as { role?: unknown }).role = token.role
        ;(session.user as { id?: unknown }).id = token.id
      }
      return session
    },
  },
} satisfies NextAuthConfig
