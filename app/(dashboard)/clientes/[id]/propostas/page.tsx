import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import ProposalsList from '@/components/propostas/ProposalsList'
import { Button } from '@/components/vex/button'
import { Painel } from '@/components/vex/vireo'
import { ArrowLeft, Plus } from 'lucide-react'

export default async function ClientePropostasPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!client) redirect('/clientes')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title={`Propostas — ${client.name}`}
        subtitle="Histórico de propostas e aditivos do cliente"
        acoes={(
          <>
            <Button asChild variant="ghost">
              <Link href={`/clientes/${id}`}><ArrowLeft /> Voltar para o cliente</Link>
            </Button>
            <Button asChild>
              <Link href={`/propostas/nova?clientId=${id}`}><Plus /> Nova proposta</Link>
            </Button>
          </>
        )}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pt-2 pb-8">
        <Painel rotulo="Cliente" titulo="Propostas e aditivos">
          <ProposalsList clientId={id} />
        </Painel>
      </div>
    </div>
  )
}
