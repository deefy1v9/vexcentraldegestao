import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { isConfigured, uazSendText } from '@/lib/uazapi'
import { Prisma, TaskStatus, TaskPriority } from '@prisma/client'

const STATUSES: string[] = ['BACKLOG', 'TODO', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDO']
const PRIORITIES: string[] = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      comments: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
      attachments: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(task)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  // Whitelist com semântica de update parcial: o Kanban envia apenas
  // `{ status }` ao arrastar um card. Um spread do body (ou tratar campo
  // ausente como null) apagava prazo, cliente e responsável a cada arrasto —
  // e permitia reescrever `creatorId`.
  const data: Prisma.TaskUpdateInput = {}

  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (body.description !== undefined) {
    data.description = body.description ? String(body.description) : null
  }
  if (typeof body.status === 'string' && STATUSES.includes(body.status)) {
    data.status = body.status as TaskStatus
  }
  if (typeof body.priority === 'string' && PRIORITIES.includes(body.priority)) {
    data.priority = body.priority as TaskPriority
  }
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body.position !== undefined && !Number.isNaN(Number(body.position))) {
    data.position = Number(body.position)
  }
  if (Array.isArray(body.tags)) data.tags = body.tags.map(String)
  if (body.clientId !== undefined) {
    data.client = body.clientId ? { connect: { id: String(body.clientId) } } : { disconnect: true }
  }
  if (body.assigneeId !== undefined) {
    data.assignee = body.assigneeId
      ? { connect: { id: String(body.assigneeId) } }
      : { disconnect: true }
  }

  const previous = await prisma.task.findUnique({ where: { id }, select: { status: true } })
  if (!previous) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const task = await prisma.task.update({
    where: { id },
    data,
    include: {
      client: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  })

  await logActivity(user.id, 'atualizou demanda', 'Demandas', task.title)

  // Notificar admins quando tarefa for concluída
  if (previous.status !== 'CONCLUIDO' && task.status === 'CONCLUIDO') {
    isConfigured().then(async (configured) => {
      if (!configured) return
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true, NOT: { phone: '' } },
        select: { phone: true, name: true },
      })
      const lines = [
        `✅ *Demanda concluída!*`,
        ``,
        `*${task.title}*`,
        task.client ? `• Cliente: ${task.client.name}` : null,
        `• Concluído por: ${user.name}`,
        task.dueDate ? `• Prazo era: ${new Date(task.dueDate).toLocaleDateString('pt-BR')}` : null,
      ]
      const text = lines.filter(Boolean).join('\n')
      await Promise.all(
        admins.filter((a) => a.phone).map((a) => uazSendText(a.phone!, text).catch(() => {})),
      )
    }).catch(() => {})
  }

  return NextResponse.json(task)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params

  // Apagar uma demanda é destrutivo (leva junto comentários e anexos):
  // permitido apenas ao administrador ou a quem criou a demanda.
  const existing = await prisma.task.findUnique({ where: { id }, select: { creatorId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (user.role !== 'ADMIN' && existing.creatorId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const task = await prisma.task.delete({ where: { id } })
  await logActivity(user.id, 'removeu demanda', 'Demandas', task.title)
  return NextResponse.json({ ok: true })
}
