import { Suspense } from 'react'
import { CLIENT_LINK_SELECT } from '@/lib/client-links'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import Header from '@/components/layout/Header'
import DemandasWorkspace from '@/components/demandas/DemandasWorkspace'
import { visibilityWhere } from '@/lib/demandas-core'

export default async function DemandasPage() {
  const session = await auth()
  const isAdmin = session?.user?.role === 'ADMIN'
  const userId = session?.user?.id ?? ''

  const [tasks, clients, users] = await Promise.all([
    prisma.task.findMany({
      // Colaborador só recebe as demandas em que tem papel
      where: visibilityWhere(userId, isAdmin),
      include: {
        client: { select: { id: true, name: true, tier: true, ...CLIENT_LINK_SELECT } },
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        producer: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        scheduler: { select: { id: true, name: true } },
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
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Demandas" subtitle="Fila, quadro e calendário das entregas" />
      {/* Filtros e visão vivem na URL (useSearchParams) */}
      <Suspense fallback={<p className="p-6 text-sm text-gray-400">Carregando demandas…</p>}>
        <DemandasWorkspace
          initialTasks={tasks}
          clients={clients}
          users={users}
          currentUserId={session?.user?.id ?? ''}
          isAdmin={session?.user?.role === 'ADMIN'}
        />
      </Suspense>
    </div>
  )
}
