import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import ConstrutorProcesso, { type EtapaRascunho, type ProcessoParaEditar } from '@/components/processos/ConstrutorProcesso'

/** Construtor de um processo (admin). `/processos/novo` começa do zero. */
export default async function ProcessoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') redirect('/demandas')
  const { id } = await params

  const [pessoas, equipes] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.team.findMany({
      where: { active: true },
      select: { id: true, name: true, color: true, _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    }),
  ])

  let inicial: ProcessoParaEditar
  if (id === 'novo') {
    inicial = {
      id: null, name: '', color: '#030A8C', description: '', active: true, taskCount: 0,
      stages: [{
        key: 'fim', name: 'Concluído', kind: 'FINAL', status: 'CONCLUIDO', role: '', defaultUserId: '', teamId: '',
        dueMode: 'DIAS_APOS_ENTRADA', dueDays: 0, fields: [], instructions: '', checklist: '', checklistRequired: false, notifyClient: false, clientPhrase: '',
      }],
    }
  } else {
    const p = await prisma.process.findUnique({
      where: { id },
      include: { stages: { orderBy: { position: 'asc' } }, _count: { select: { tasks: true } } },
    })
    if (!p) notFound()
    inicial = {
      id: p.id, name: p.name, color: p.color, description: p.description ?? '', active: p.active, taskCount: p._count.tasks,
      stages: p.stages.map((s): EtapaRascunho => ({
        id: s.id, key: s.id, name: s.name,
        kind: s.kind as EtapaRascunho['kind'], status: s.status as EtapaRascunho['status'],
        role: (s.role ?? '') as EtapaRascunho['role'], defaultUserId: s.defaultUserId ?? '', teamId: s.teamId ?? '',
        dueMode: s.dueMode as EtapaRascunho['dueMode'], dueDays: s.dueDays, fields: s.fields as EtapaRascunho['fields'],
        instructions: s.instructions ?? '', checklist: s.checklist.join('\n'), checklistRequired: s.checklistRequired,
        notifyClient: s.notifyClient, clientPhrase: s.clientPhrase ?? '',
      })),
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Processos" subtitle={id === 'novo' ? 'Novo processo' : inicial.name} />
      <ConstrutorProcesso
        inicial={inicial}
        pessoas={pessoas}
        equipes={equipes.map((t) => ({ id: t.id, name: t.name, color: t.color, memberCount: t._count.members }))}
      />
    </div>
  )
}
