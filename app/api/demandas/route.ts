import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { isConfigured, uazSendText } from '@/lib/uazapi'
import { defaultAssignments, logTaskEvent, maybeImmediateReminder, taskShortId } from '@/lib/task-flow'
import { tierPriority } from '@/lib/client-tier'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const assigneeId = searchParams.get('assigneeId')

  const tasks = await prisma.task.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      ...(assigneeId ? { assigneeId } : {}),
    },
    include: {
      client: { select: { id: true, name: true, tier: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      producer: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      scheduler: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
    orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Quem distribui demanda é administrador; colaborador só executa a sua.
  if ((session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, status, priority, dueDate, clientId, assigneeId, tags, platform } = body

  if (!title || !String(title).trim()) {
    return NextResponse.json({ error: 'Informe o nome da demanda.' }, { status: 400 })
  }
  // Data final obrigatória: o processo de 3 dias (produção D-2, revisão D-1,
  // entrega D) deriva tudo dela — ninguém precisa informar mais nada.
  if (!dueDate) {
    return NextResponse.json({ error: 'Informe a data final da demanda — os prazos de produção e revisão são calculados a partir dela.' }, { status: 400 })
  }

  // Responsáveis padrão da operação (produção Igor, revisão Antonio,
  // agendamento Igor) — o formulário pode sobrepor por demanda.
  const defaults = await defaultAssignments()
  const producerId = body.producerId || defaults.producerId
  const reviewerId = body.reviewerId || defaults.reviewerId
  const schedulerId = body.schedulerId || defaults.schedulerId

  // Sem prioridade explícita, herda do grupo do cliente:
  // Scale → alta; Growth/Start → padrão (média)
  let inheritedPriority: string | null = null
  if (!priority && clientId) {
    const c = await prisma.client.findUnique({ where: { id: clientId }, select: { tier: true } })
    inheritedPriority = tierPriority(c?.tier)
  }

  const task = await prisma.task.create({
    data: {
      title,
      description,
      status: status || 'TODO',
      priority: priority || inheritedPriority || 'MEDIA',
      dueDate: dueDate ? new Date(dueDate) : null,
      clientId: clientId || null,
      // Responsável atual inicia no produtor (ou no que o form indicar)
      assigneeId: assigneeId || producerId || null,
      producerId: producerId || null,
      reviewerId: reviewerId || null,
      schedulerId: schedulerId || null,
      platform: platform || null,
      creatorId: (session.user as any).id,
      tags: tags || [],
    },
    include: {
      client: { select: { id: true, name: true, tier: true } },
      assignee: { select: { id: true, name: true, phone: true } },
      creator: { select: { id: true, name: true } },
      producer: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      scheduler: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
  })

  await logTaskEvent(task.id, 'CRIACAO', `Demanda criada por ${(session.user as any).name}`, (session.user as any).id)
  // Criada já dentro da janela D-2? Um único lembrete imediato ao produtor.
  maybeImmediateReminder(task.id).catch(() => {})

  await logActivity((session.user as any).id, 'criou demanda', 'Demandas', task.title)

  // Fire WhatsApp notification in background — don't block the response
  const assigneePhone = (task.assignee as any)?.phone as string | null | undefined
  if (assigneePhone) {
    isConfigured().then(async (configured) => {
      if (!configured) return
      const PRIORITY: Record<string, string> = {
        BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: '🔴 URGENTE',
      }
      const lines = [
        `📋 *Nova demanda atribuída a você* ${taskShortId(task.id)}`,
        ``,
        `*${task.title}*`,
        task.description ? task.description : null,
        ``,
        `• Prioridade: ${PRIORITY[task.priority] ?? task.priority}`,
        task.dueDate ? `• Prazo: ${new Date(task.dueDate).toLocaleDateString('pt-BR')}` : null,
        task.client ? `• Cliente: ${(task.client as any).name}` : null,
        `• Criado por: ${(task.creator as any)?.name ?? 'Sistema'}`,
      ]
      const text = lines.filter(Boolean).join('\n')
      await uazSendText(assigneePhone, text)
    }).catch(() => console.error('WhatsApp notification failed'))
  }

  return NextResponse.json(task, { status: 201 })
}
