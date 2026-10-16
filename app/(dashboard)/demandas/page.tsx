import { Suspense } from 'react'
import { CLIENT_LINK_SELECT } from '@/lib/client-links'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import Header from '@/components/layout/Header'
import DemandasWorkspace from '@/components/demandas/DemandasWorkspace'
import { visibilityWhere } from '@/lib/demandas-core'
import { attachOrphanTasks, ensureDefaultProcesses, listProcesses, myTeamIds } from '@/lib/processos-server'

export default async function DemandasPage() {
  const session = await auth()
  const isAdmin = session?.user?.role === 'ADMIN'
  const userId = session?.user?.id ?? ''

  // Toda demanda anda num processo: os padrão existem e as antigas ganham etapa
  await ensureDefaultProcesses()
  await attachOrphanTasks()
  const teamIds = await myTeamIds(userId)

  const [tasks, clients, users, processos] = await Promise.all([
    prisma.task.findMany({
      // Colaborador só recebe as demandas em que tem papel
      where: visibilityWhere(userId, isAdmin, teamIds),
      include: {
        client: { select: { id: true, name: true, tier: true, ...CLIENT_LINK_SELECT } },
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        producer: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        scheduler: { select: { id: true, name: true } },
        process: { select: { id: true, name: true, color: true } },
        stage: { select: { id: true, name: true, kind: true, dueMode: true, dueDays: true, position: true } },
        team: { select: { id: true, name: true, color: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.client.findMany({
      where: { status: 'ATIVO' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    listProcesses({ onlyActive: true }),
  ])
  const processes = processos.map((p) => ({ id: p.id, name: p.name, color: p.color, stageCount: p.stages.length }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Demandas" subtitle="Tarefas por processo, quadro e calendário" />
      {/* Filtros e visão vivem na URL (useSearchParams) */}
      <Suspense fallback={<p className="p-6 text-sm text-gray-400">Carregando demandas…</p>}>
        <DemandasWorkspace
          initialTasks={tasks}
          clients={clients}
          users={users}
          processes={processes}
          myTeamIds={teamIds}
          currentUserId={session?.user?.id ?? ''}
          isAdmin={session?.user?.role === 'ADMIN'}
        />
      </Suspense>
    </div>
  )
}
