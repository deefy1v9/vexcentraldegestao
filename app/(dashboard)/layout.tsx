import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import SessionProvider from '@/components/layout/SessionProvider'

// Garante que o dashboard nunca seja renderizado de forma estática:
// a verificação de sessão precisa rodar a cada requisição.
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <div className="flex h-screen bg-[#F0F2F8] overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden my-3 mr-3 bg-white rounded-2xl shadow-sm border border-gray-100">
          {children}
        </main>
      </div>
    </SessionProvider>
  )
}
