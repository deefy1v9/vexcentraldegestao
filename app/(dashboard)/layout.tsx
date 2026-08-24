import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import SessionProvider from '@/components/layout/SessionProvider'
import { MobileNavProvider } from '@/components/layout/MobileNav'

// Garante que o dashboard nunca seja renderizado de forma estática:
// a verificação de sessão precisa rodar a cada requisição.
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <MobileNavProvider>
        {/* h-dvh (não h-screen) para não brigar com a barra de URL do mobile.
            No mobile o conteúdo é full-bleed; margens e cantos arredondados só
            entram no desktop (lg+), onde a sidebar fica ao lado. */}
        <div className="flex h-dvh bg-[#F0F2F8] overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col overflow-hidden bg-white shadow-sm border border-gray-100 lg:my-3 lg:mr-3 lg:rounded-2xl min-w-0">
            {children}
          </main>
        </div>
      </MobileNavProvider>
    </SessionProvider>
  )
}
