import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = (session.user as any).role === 'ADMIN'
  const userId = (session.user as any).id
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

  // Demandas aguardando ação do usuário (revisão/agendamento)
  const waitingTasks = await prisma.task.findMany({
    where: {
      status: { in: ['EM_REVISAO', 'APROVADO'] },
      OR: [
        { status: 'EM_REVISAO', reviewerId: userId },
        { status: 'APROVADO', schedulerId: userId },
      ],
    },
    include: { client: { select: { name: true, tier: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  })
  const TIER_PT: Record<string, string> = { START: 'Start', GROWTH: 'Growth', SCALE: 'Scale' }
  for (const t of waitingTasks) {
    const isReview = t.status === 'EM_REVISAO'
    const tierNote = t.client?.tier ? ` · Cliente ${TIER_PT[t.client.tier]}` : ''
    notifications.push({
      id: `${isReview ? 'review' : 'schedule'}-${t.id}`,
      type: 'task_completed',
      title: isReview ? `Aguardando sua revisão — ${t.title}` : `Aguardando agendamento — ${t.title}`,
      description: `${t.client ? t.client.name : 'Sem cliente'}${tierNote}`,
      createdAt: t.updatedAt.toISOString(),
    })
  }

  // Remove o que este usuário já marcou como lido (persistido no banco)
  const dismissed = await prisma.notificationDismissal.findMany({
    where: { userId, notifId: { in: notifications.map((n) => n.id) } },
    select: { notifId: true },
  })
  const dismissedIds = new Set(dismissed.map((d) => d.notifId))
  const visible = notifications.filter((n) => !dismissedIds.has(n.id))

  // Sort all by date desc
  visible.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return NextResponse.json(visible)
}

/** Marca notificações como lidas — a dispensa vale para sempre, por usuário. */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 100)
    : []
  if (ids.length === 0) return NextResponse.json({ error: 'ids obrigatório' }, { status: 400 })

  await prisma.notificationDismissal.createMany({
    data: ids.map((notifId) => ({ userId, notifId })),
    skipDuplicates: true,
  })

  return NextResponse.json({ ok: true })
}
