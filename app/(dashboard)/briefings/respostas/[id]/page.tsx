import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import { perguntasDe } from '@/lib/briefing'
import VerResposta from '@/components/briefings/VerResposta'

export const dynamic = 'force-dynamic'

/** Uma resposta de briefing (admin). Abrir marca como lida. */
export default async function RespostaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') redirect('/demandas')
  const { id } = await params

  const r = await prisma.briefingResponse.findUnique({
    where: { id },
    include: { template: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } },
  })
  if (!r) notFound()
  if (!r.readAt) await prisma.briefingResponse.update({ where: { id }, data: { readAt: new Date() } })
  const clientes = await prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Briefings" subtitle={`${r.template.name} · ${r.client?.name ?? r.companyName ?? 'sem cliente'}`} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <VerResposta
          resposta={{
            id: r.id,
            briefing: r.template.name,
            briefingId: r.template.id,
            cliente: r.client,
            empresa: r.companyName,
            pessoa: r.respondentName,
            email: r.respondentEmail,
            criadaEm: r.createdAt.toISOString(),
            alertas: r.alerts,
            resumo: r.summary,
            resumoEm: r.summaryAt?.toISOString() ?? null,
            perguntas: perguntasDe(r.questions),
            respostas: r.answers as Record<string, string | string[]>,
          }}
          clientes={clientes}
        />
      </div>
    </div>
  )
}
