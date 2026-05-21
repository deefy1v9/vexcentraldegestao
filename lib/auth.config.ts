import type { NextAuthConfig } from 'next-auth'
import { NextResponse } from 'next/server'

/**
 * Configuração de autenticação compartilhada e segura para o Edge Runtime.
 *
 * IMPORTANTE: NÃO importe Prisma, bcrypt ou qualquer módulo de Node aqui —
 * este arquivo é usado pelo middleware.ts, que roda no Edge Runtime.
 * O provider de credenciais (que usa Prisma/bcrypt) fica só em lib/auth.ts.
 */
export const authConfig = {
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
      return isLoggedIn
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
