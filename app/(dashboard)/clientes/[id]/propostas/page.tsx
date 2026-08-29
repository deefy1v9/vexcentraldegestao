import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import ProposalsList from '@/components/propostas/ProposalsList'
import { ArrowLeft, Plus } from 'lucide-react'

export default async function ClientePropostasPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!client) redirect('/clientes')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title={`Propostas — ${client.name}`} subtitle="Histórico de propostas e aditivos do cliente" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <Link href={`/clientes/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" /> Voltar para o cliente
          </Link>
          <Link
            href={`/propostas/nova?clientId=${id}`}
            className="flex items-center gap-1.5 bg-[#030A8C] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#02077a] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova proposta
          </Link>
        </div>
        <ProposalsList clientId={id} />
      </div>
    </div>
  )
}
