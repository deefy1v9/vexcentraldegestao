import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import { Button } from '@/components/vex/button'
import ProposalsNav from '@/components/propostas/ProposalsNav'
import ProposalsList from '@/components/propostas/ProposalsList'

export default async function PropostasPage() {
  // Propostas comerciais: exclusivo de administradores.
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Propostas"
        subtitle="Propostas comerciais e aditivos"
        acoes={<Button asChild><Link href="/propostas/nova"><Plus /> Nova proposta</Link></Button>}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-8 pt-2">
        <ProposalsNav showNew={false} />
        <ProposalsList />
      </div>
    </div>
  )
}
