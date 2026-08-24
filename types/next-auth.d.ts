import type { UserRole } from '@prisma/client'

/**
 * Augmentação de tipos do next-auth.
 *
 * `Session['user']` em next-auth v5 é `User & DefaultSession['user']`, então
 * acrescentar `role` aqui faz `session.user.role` existir com tipo em todo o
 * projeto — sem os `(session.user as any).role` espalhados pelas rotas, que
 * desligavam a checagem de tipos justamente no controle de acesso.
 */
declare module 'next-auth' {
  interface User {
    role?: UserRole
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: UserRole
  }
}
