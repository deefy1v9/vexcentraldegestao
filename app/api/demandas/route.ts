import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { isConfigured, uazSendText } from '@/lib/uazapi'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const assigneeId = searchParams.get('assigneeId')

  const tasks = await prisma.task.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      ...(assigneeId ? { assigneeId } : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
    orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = await req.json()
  const { title, description, status, priority, dueDate, clientId, assigneeId, tags } = body

  const task = await prisma.task.create({
    data: {
      title,
      description,
      status: status || 'TODO',
      priority: priority || 'MEDIA',
      dueDate: dueDate ? new Date(dueDate) : null,
      clientId: clientId || null,
      assigneeId: assigneeId || null,
      creatorId: user.id,
      tags: tags || [],
    },
    include: {
      client: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, phone: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
  })

  await logActivity(user.id, 'criou demanda', 'Demandas', task.title)

  // Fire WhatsApp notification in background — don't block the response
  const assigneePhone = task.assignee?.phone
  if (assigneePhone) {
    isConfigured().then(async (configured) => {
      if (!configured) return
      const PRIORITY: Record<string, string> = {
        BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: '🔴 URGENTE',
      }
      const lines = [
        `📋 *Nova demanda atribuída a você*`,
        ``,
        `*${task.title}*`,
        task.description ? task.description : null,
        ``,
        `• Prioridade: ${PRIORITY[task.priority] ?? task.priority}`,
        task.dueDate ? `• Prazo: ${new Date(task.dueDate).toLocaleDateString('pt-BR')}` : null,
        task.client ? `• Cliente: ${task.client.name}` : null,
        `• Criado por: ${task.creator?.name ?? 'Sistema'}`,
      ]
      const text = lines.filter(Boolean).join('\n')
      await uazSendText(assigneePhone, text)
    }).catch(() => console.error('WhatsApp notification failed'))
  }

  return NextResponse.json(task, { status: 201 })
}
