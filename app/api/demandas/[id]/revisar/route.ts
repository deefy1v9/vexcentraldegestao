import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { logTaskEvent, notifyWhatsApp } from '@/lib/task-flow'
import { TIER_LABEL, Tier } from '@/lib/client-tier'

/**
 * Revisão: aprovar (→ Aprovado para Agendamento, volta ao produtor/agendador)
 * ou solicitar ajustes (→ Em Andamento, volta ao produtor, comentário
 * obrigatório). O link do Drive é sempre preservado.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const userName = (session.user as any).name ?? 'Revisor'
  const isAdmin = (session.user as any).role === 'ADMIN'

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body.action === 'aprovar' ? 'aprovar' : body.action === 'ajustes' ? 'ajustes' : null
  const note = body.note ? String(body.note).trim() : ''

  if (!action) return NextResponse.json({ error: 'action deve ser "aprovar" ou "ajustes"' }, { status: 400 })
  if (action === 'ajustes' && !note) {
    return NextResponse.json({ error: 'Descreva o que precisa ser corrigido.' }, { status: 400 })
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      producer: { select: { id: true, name: true } },
      scheduler: { select: { id: true, name: true } },
      client: { select: { name: true, tier: true } },
    },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (task.status !== 'EM_REVISAO') {
    return NextResponse.json({ error: 'A demanda não está em revisão.' }, { status: 400 })
  }

  const allowed = isAdmin || task.reviewerId === userId
  if (!allowed) return NextResponse.json({ error: 'Apenas o revisor pode aprovar ou solicitar ajustes.' }, { status: 403 })

  if (action === 'aprovar') {
    const nextAssignee = task.schedulerId ?? task.producerId
    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: 'APROVADO',
        assigneeId: nextAssignee,
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewNote: note || null,
      },
      include: {
        client: { select: { id: true, name: true, tier: true } },
        assignee: { select: { id: true, name: true } },
        producer: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        scheduler: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    })

    await logTaskEvent(id, 'APROVACAO', `${userName} aprovou a demanda${note ? ` — obs.: ${note}` : ''}`, userId)
    await logActivity(userId, 'aprovou demanda', 'Demandas', task.title)
    const tierSuffix = task.client?.tier ? `\nCliente ${TIER_LABEL[task.client.tier as Tier]}.` : ''
    await notifyWhatsApp(nextAssignee, `Demanda aprovada para agendamento: ${task.title}.${tierSuffix}`)
    await logTaskEvent(id, 'LEMBRETE', `Aviso de aprovação enviado para ${updated.assignee?.name ?? 'responsável'} (WhatsApp)`)

    return NextResponse.json(updated)
  }

  // Solicitar ajustes — volta ao produtor, preservando o link do Drive
  const nextAssignee = task.producerId ?? task.assigneeId
  const updated = await prisma.task.update({
    where: { id },
    data: {
      status: 'EM_ANDAMENTO',
      assigneeId: nextAssignee,
    },
    include: {
      client: { select: { id: true, name: true, tier: true } },
      assignee: { select: { id: true, name: true } },
      producer: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      scheduler: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
  })

  await prisma.taskComment.create({ data: { taskId: id, userId, content: `[Ajustes solicitados] ${note}` } }).catch(() => {})
  await logTaskEvent(id, 'AJUSTES', `${userName} solicitou ajustes: ${note}`, userId)
  await logActivity(userId, 'solicitou ajustes na demanda', 'Demandas', task.title)
  await notifyWhatsApp(
    nextAssignee,
    `Ajustes solicitados na demanda: ${task.title}.${task.client?.tier ? `\nCliente ${TIER_LABEL[task.client.tier as Tier]}.` : ''}`,
  )
  await logTaskEvent(id, 'LEMBRETE', `Aviso de ajustes enviado para ${updated.assignee?.name ?? 'responsável'} (WhatsApp)`)

  return NextResponse.json(updated)
}
