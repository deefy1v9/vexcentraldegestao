import type { DefaultSession } from 'next-auth'

/**
 * A sessão do VEX carrega o id e o papel do usuário (ADMIN | COLABORADOR),
 * gravados no token pelo callback de `lib/auth.config.ts`. Sem esta
 * declaração cada tela precisaria de um cast para ler esses campos.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
    } & DefaultSession['user']
  }

  interface User {
    role?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
  }
}
