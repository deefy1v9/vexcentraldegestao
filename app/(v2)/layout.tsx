import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import SessionProvider from '@/components/layout/SessionProvider'
import { CascaV2 } from '@/components/v2/CascaV2'

// A sessão é conferida a cada requisição, como no painel principal
export const dynamic = 'force-dynamic'

/**
 * Prévia da versão 2 da Central (03/11): casca com trilho flutuante e abas em
 * pílula. Só administrador, enquanto é prévia.
 */
export default async function LayoutV2({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/api/sessao-expirada')
  if (session.user?.role !== 'ADMIN') redirect('/dashboard')
  return (
    <SessionProvider session={session}>
      <CascaV2 admin pessoa={{ nome: session.user?.name ?? 'Equipe VEX', email: session.user?.email ?? '' }}>{children}</CascaV2>
    </SessionProvider>
  )
}
