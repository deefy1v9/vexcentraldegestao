import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import ProposalEditor from '@/components/propostas/ProposalEditor'

export default async function EditarPropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const { id } = await params
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Editar proposta" subtitle="Valores, prazos e serviços" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ProposalEditor id={id} />
      </div>
    </div>
  )
}
