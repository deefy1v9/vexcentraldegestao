import { notFound } from 'next/navigation'
import { CLIENT_LINK_SELECT } from '@/lib/client-links'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import Header from '@/components/layout/Header'
import TaskPage from '@/components/demandas/TaskPage'

/** Demanda em página própria (link compartilhável, sem popup). */
export default async function DemandaPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, { id }] = await Promise.all([auth(), params])

  const [task, clients, users] = await Promise.all([
    prisma.task.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, tier: true, ...CLIENT_LINK_SELECT } },
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        producer: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        scheduler: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.client.findMany({ where: { status: 'ATIVO' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  if (!task) notFound()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title={`Demanda #${task.number}`} subtitle={task.client?.name ?? 'Sem cliente'} />
      <TaskPage
        task={task}
        users={users}
        clients={clients}
        currentUserId={session?.user?.id ?? ''}
        isAdmin={session?.user?.role === 'ADMIN'}
      />
    </div>
  )
}
