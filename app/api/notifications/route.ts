import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const isAdmin = user.role === 'ADMIN'
  const userId = user.id
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const notifications: {
    id: string
    type: 'overdue_payment' | 'task_completed'
    title: string
    description: string
    createdAt: string
  }[] = []

  if (isAdmin) {
    // Overdue payments
    const overduePayments = await prisma.clientPayment.findMany({
      where: {
        status: 'PENDENTE',
        dueDate: { lt: now },
      },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 10,
    })

    for (const payment of overduePayments) {
      const daysOverdue = Math.floor((now.getTime() - new Date(payment.dueDate).getTime()) / (1000 * 60 * 60 * 24))
      notifications.push({
        id: `payment-${payment.id}`,
        type: 'overdue_payment',
        title: `Pagamento em atraso — ${payment.client.name}`,
        description: `Venceu há ${daysOverdue} dia(s)`,
        createdAt: payment.dueDate.toISOString(),
      })
    }

    // Tasks completed in last 24h
    const completedTasks = await prisma.task.findMany({
      where: {
        status: 'CONCLUIDO',
        updatedAt: { gte: yesterday },
      },
      include: {
        assignee: { select: { name: true } },
        client: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    })

    for (const task of completedTasks) {
      notifications.push({
        id: `task-${task.id}`,
        type: 'task_completed',
        title: `Demanda concluída — ${task.title}`,
        description: task.assignee
          ? `Finalizado por ${task.assignee.name}${task.client ? ` · ${task.client.name}` : ''}`
          : 'Sem responsável',
        createdAt: task.updatedAt.toISOString(),
      })
    }
  } else {
    // Collaborator: only their completed tasks from last 24h
    const completedTasks = await prisma.task.findMany({
      where: {
        status: 'CONCLUIDO',
        assigneeId: userId,
        updatedAt: { gte: yesterday },
      },
      include: { client: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
    })

    for (const task of completedTasks) {
      notifications.push({
        id: `task-${task.id}`,
        type: 'task_completed',
        title: `Demanda concluída — ${task.title}`,
        description: task.client ? task.client.name : 'Sem cliente',
        createdAt: task.updatedAt.toISOString(),
      })
    }
  }

  // Sort all by date desc
  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return NextResponse.json(notifications)
}
