import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import Header from '@/components/layout/Header'
import KanbanBoard from '@/components/demandas/KanbanBoard'

export default async function DemandasPage() {
  const session = await auth()

  const [tasks, clients, users] = await Promise.all([
    prisma.task.findMany({
      include: {
        client: { select: { id: true, name: true } },
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
      <Header title="Demandas" subtitle="Gestão de tarefas e entregas dos colaboradores" />
      <KanbanBoard
        initialTasks={tasks}
        clients={clients}
        users={users}
        currentUserId={(session?.user as any)?.id}
        isAdmin={(session?.user as any)?.role === 'ADMIN'}
      />
    </div>
  )
}
