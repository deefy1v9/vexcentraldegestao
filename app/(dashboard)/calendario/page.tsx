import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import CalendarView from '@/components/calendario/CalendarView'

export default async function CalendarioPage() {
  // Agenda da agência: restrita a administradores.
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const now = new Date()

  const [events, clients, users] = await Promise.all([
    prisma.calendarEvent.findMany({
      include: {
        client: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'asc' },
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
      <Header title="Calendário" subtitle="Prazos, entregas e reuniões dos clientes" />
      <CalendarView initialEvents={events} clients={clients} users={users} />
    </div>
  )
}
