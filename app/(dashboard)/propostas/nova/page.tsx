import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import ProposalsNav from '@/components/propostas/ProposalsNav'
import ProposalWizard from '@/components/propostas/ProposalWizard'

export default async function NovaPropostaPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; kind?: string; parentId?: string }>
}) {
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const { clientId, kind, parentId } = await searchParams
  const clients = await prisma.client.findMany({
    where: { status: 'ATIVO' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  const isAddendum = kind === 'ADITIVO'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title={isAddendum ? 'Novo aditivo' : 'Nova proposta'}
        subtitle={isAddendum ? 'Altera o contrato sem tocar no documento original' : 'Cliente, serviços e valores'}
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ProposalsNav showNew={false} />
        <ProposalWizard
          clients={clients}
          initialClientId={clientId}
          kind={isAddendum ? 'ADITIVO' : 'PROPOSTA'}
          parentId={parentId}
        />
      </div>
    </div>
  )
}
