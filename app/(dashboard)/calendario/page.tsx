import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import CalendarView from '@/components/calendario/CalendarView'

export default async function CalendarioPage() {
  // Agenda da agência: restrita a administradores.
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const [events, tasks, clients, users, aiItems] = await Promise.all([
    prisma.calendarEvent.findMany({
      include: {
        client: { select: { id: true, name: true, tier: true } },
        assignedUser: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'asc' },
    }),
    // Demandas com data entram no calendário — mesma fonte do Kanban
    prisma.task.findMany({
      where: { dueDate: { not: null } },
      select: {
        id: true, number: true, title: true, status: true, priority: true, dueDate: true,
        contentType: true, platform: true,
        client: { select: { id: true, name: true, tier: true, operationalGroup: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.client.findMany({
      where: { status: 'ATIVO' },
      select: { id: true, name: true, tier: true, operationalGroup: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    // Demandas originadas do planejamento com IA (para o filtro e o selo)
    prisma.planItem.findMany({
      where: { createdTaskId: { not: null } },
      select: { createdTaskId: true },
    }),
  ])

  const aiTaskIds = aiItems.map((i) => i.createdTaskId).filter((id): id is string => !!id)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Calendário" subtitle="Planejamento operacional: entregas, demandas e prazos" />
      <CalendarView
        initialEvents={events}
        initialTasks={tasks.map((t) => ({
          ...t,
          dueDate: t.dueDate as Date,
        }))}
        aiTaskIds={aiTaskIds}
        clients={clients}
        users={users}
      />
    </div>
  )
}
