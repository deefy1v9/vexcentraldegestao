import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import ProposalsNav from '@/components/propostas/ProposalsNav'
import ProposalsList from '@/components/propostas/ProposalsList'

export default async function PropostasPage() {
  // Propostas comerciais: exclusivo de administradores.
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Propostas" subtitle="Propostas comerciais e aditivos" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ProposalsNav />
        <ProposalsList />
      </div>
    </div>
  )
}
