import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import ProposalDetail from '@/components/propostas/ProposalDetail'

export default async function PropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const { id } = await params
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Proposta" subtitle="Prévia, documentos e histórico" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ProposalDetail id={id} />
      </div>
    </div>
  )
}
