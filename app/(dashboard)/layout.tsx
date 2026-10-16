import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SessionProvider from '@/components/layout/SessionProvider'
import { AppShell } from '@/components/shell/AppShell'
import type { Contexto } from '@/components/shell/TrocarContexto'

// Garante que o dashboard nunca seja renderizado de forma estática:
// a verificação de sessão precisa rodar a cada requisição.
export const dynamic = 'force-dynamic'


/**
 * Os contextos do seletor no pé do trilho. Por enquanto só a Central da
 * VEX Growth: a área da VEX Sales saiu em 15/10 (o dono) e volta quando a
 * receita dela vier do que a Central cobra.
 */
function contextosDe(): Contexto[] {
  return [{
    id: 'central',
    nome: 'VEX Growth',
    legenda: 'Central de Gestão',
    href: '/dashboard',
    logo: '/logoaa.png',
  }]
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  const admin = session.user?.role === 'ADMIN'
  // Qual produto está aberto quem decide é a rota, no cliente (TrocarContexto).
  const contextos = contextosDe()

  return (
    <SessionProvider session={session}>
      <AppShell
        admin={admin}
        contextos={contextos}
        pessoa={{
          nome: session.user?.name ?? 'Equipe VEX',
          email: session.user?.email ?? '',
          papel: admin ? 'Administrador da conta' : 'Equipe',
          avatar: session.user?.image ?? null,
          perfilHref: '/colaboradores',
        }}
      >
        {children}
      </AppShell>
    </SessionProvider>
  )
}
