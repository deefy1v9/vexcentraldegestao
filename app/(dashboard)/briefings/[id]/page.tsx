import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import { perguntasDe } from '@/lib/briefing'
import EditorBriefing from '@/components/briefings/EditorBriefing'
import LinksPorCliente from '@/components/briefings/LinksPorCliente'

export const dynamic = 'force-dynamic'

/** Um briefing (admin): editar as perguntas e gerar o link de cada cliente. */
export default async function BriefingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') redirect('/demandas')
  const { id } = await params

  const [b, clientes, convites] = await Promise.all([
    prisma.briefingTemplate.findUnique({ where: { id }, include: { _count: { select: { responses: true } } } }),
    prisma.client.findMany({ where: { status: { not: 'INATIVO' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.briefingInvite.findMany({
      where: { templateId: id },
      include: { client: { select: { name: true } }, responses: { select: { id: true, createdAt: true }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  if (!b) notFound()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Briefings" subtitle={b.name} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
          <EditorBriefing
            inicial={{ id: b.id, name: b.name, description: b.description ?? '', active: b.active, perguntas: perguntasDe(b.questions), publicToken: b.publicToken, respostas: b._count.responses }}
          />
          <LinksPorCliente
            briefingId={b.id}
            ativo={b.active}
            clientes={clientes}
            convites={convites.map((c) => ({
              id: c.id, token: c.token, cliente: c.client.name, criadoEm: c.createdAt.toISOString(), abertoEm: c.openedAt?.toISOString() ?? null,
              respostaId: c.responses[0]?.id ?? null, respondidoEm: c.responses[0]?.createdAt.toISOString() ?? null,
            }))}
          />
        </div>
      </div>
    </div>
  )
}
