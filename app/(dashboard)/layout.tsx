import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SessionProvider from '@/components/layout/SessionProvider'
import { CascaV2 } from '@/components/v2/CascaV2'

// Garante que o dashboard nunca seja renderizado de forma estática:
// a verificação de sessão precisa rodar a cada requisição.
export const dynamic = 'force-dynamic'



export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  // Chegou aqui com cookie (o middleware deixou passar), mas a sessão não vale
  // mais: limpa o cookie em vez de voltar para /login, que devolveria para cá
  if (!session) redirect('/api/sessao-expirada')

  const admin = session.user?.role === 'ADMIN'

  return (
    <SessionProvider session={session}>
      {/* A casca da versão 2 em todas as telas (o dono, 03/11). A anterior
          (AppShell, menu lateral) continua no código para voltar se preciso. */}
      <CascaV2 admin={admin} pessoa={{ nome: session.user?.name ?? 'Equipe VEX', email: session.user?.email ?? '' }}>
        {children}
      </CascaV2>
    </SessionProvider>
  )
}
