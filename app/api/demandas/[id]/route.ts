import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { isConfigured, uazSendText } from '@/lib/uazapi'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const previous = await prisma.task.findUnique({ where: { id }, select: { status: true } })

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...body,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      clientId: body.clientId || null,
      assigneeId: body.assigneeId || null,
    },
    include: {
      client: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  })

  await logActivity((session.user as any).id, 'atualizou demanda', 'Demandas', task.title)

  // Notificar admins quando tarefa for concluída
  if (previous?.status !== 'CONCLUIDO' && task.status === 'CONCLUIDO') {
    isConfigured().then(async (configured) => {
      if (!configured) return
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true, NOT: { phone: '' } },
        select: { phone: true, name: true },
      })
      const collaboratorName = (session.user as any)?.name ?? 'Colaborador'
      const lines = [
        `✅ *Demanda concluída!*`,
        ``,
        `*${task.title}*`,
        task.client ? `• Cliente: ${(task.client as any).name}` : null,
        `• Concluído por: ${collaboratorName}`,
        task.dueDate ? `• Prazo era: ${new Date(task.dueDate).toLocaleDateString('pt-BR')}` : null,
      ]
      const text = lines.filter(Boolean).join('\n')
      await Promise.all(
        admins.filter((a) => a.phone).map((a) => uazSendText(a.phone!, text).catch(() => {}))
      )
    }).catch(() => {})
  }

  return NextResponse.json(task)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const task = await prisma.task.delete({ where: { id } })
  await logActivity((session.user as any).id, 'removeu demanda', 'Demandas', task.title)
  return NextResponse.json({ ok: true })
}
