import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { isConfigured, uazSendText } from '@/lib/uazapi'
import { validateDragTransition, logTaskEvent, TaskStatusValue } from '@/lib/task-flow'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, tier: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      producer: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      scheduler: { select: { id: true, name: true } },
      comments: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
      attachments: {
        orderBy: { createdAt: 'asc' },
      },
      events: {
        include: { user: { select: { id: true, name: true } } },
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

  const previous = await prisma.task.findUnique({
    where: { id },
    select: { status: true, assigneeId: true, driveLink: true, title: true },
  })
  const assigneeChanged = Object.prototype.hasOwnProperty.call(body, 'assigneeId') &&
    (body.assigneeId || null) !== (previous?.assigneeId ?? null)
  if (!previous) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Colaborador só mexe no andamento das demandas atribuídas a ele; todo o
  // resto (título, prazo, cliente, responsável) é decisão de administrador.
  const isAdmin = (session.user as any).role === 'ADMIN'
  if (!isAdmin && previous.assigneeId !== (session.user as any).id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Só grava os campos presentes no corpo. Espalhar o body inteiro apagava
  // prazo/cliente/responsável a cada arrasto de card, que envia só o status.
  const data: Record<string, unknown> = {}
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  if (has('status') && body.status !== previous.status) {
    // Regras do fluxo valem também no backend: revisão exige link do Drive,
    // aprovação e conclusão têm rotas próprias; admin só fura com justificativa
    const verdict = validateDragTransition(
      { status: previous.status, driveLink: previous.driveLink },
      body.status as TaskStatusValue,
      isAdmin,
      body.overrideReason,
    )
    if (verdict.error && !verdict.overrideOk) {
      return NextResponse.json({ error: verdict.error, needsOverride: !!verdict.needsOverride }, { status: 400 })
    }
    data.status = body.status
    if (verdict.overrideOk) {
      await logTaskEvent(
        id,
        'JUSTIFICATIVA',
        `${(session.user as any).name} moveu ${previous.status} → ${body.status} fora do fluxo. Justificativa: ${String(body.overrideReason).trim()}`,
        (session.user as any).id,
      )
    } else {
      await logTaskEvent(id, 'STATUS', `Status: ${previous.status} → ${body.status}`, (session.user as any).id)
    }
  }
  if (has('position')) data.position = body.position

  if (isAdmin) {
    if (has('title')) data.title = body.title
    if (has('description')) data.description = body.description || null
    if (has('priority')) data.priority = body.priority
    if (has('tags')) data.tags = body.tags
    if (has('platform')) data.platform = body.platform || null
    if (has('dueDate')) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
    if (has('clientId')) data.clientId = body.clientId || null
    if (has('assigneeId')) data.assigneeId = body.assigneeId || null
    if (has('producerId')) data.producerId = body.producerId || null
    if (has('reviewerId')) data.reviewerId = body.reviewerId || null
    if (has('schedulerId')) data.schedulerId = body.schedulerId || null
  }
  // O produtor pode salvar/atualizar o link do Drive sem mudar o status
  if (has('driveLink') && (isAdmin || previous.assigneeId === (session.user as any).id)) {
    data.driveLink = body.driveLink || null
    if (body.driveLink) {
      await logTaskEvent(id, 'LINK_DRIVE', `Link do Drive atualizado`, (session.user as any).id)
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data,
    include: {
      client: { select: { id: true, name: true, tier: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      producer: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      scheduler: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
  })

  // Troca de responsável fica registrada na linha do tempo da demanda
  if (isAdmin && assigneeChanged) {
    await logTaskEvent(
      id,
      'RESPONSAVEL',
      `${(session.user as any).name} alterou o responsável para ${task.assignee?.name ?? 'ninguém'}`,
      (session.user as any).id,
    )
  }

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
  // Apagar demanda é ação de administrador.
  if ((session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const task = await prisma.task.delete({ where: { id } })
  await logActivity((session.user as any).id, 'removeu demanda', 'Demandas', task.title)
  return NextResponse.json({ ok: true })
}
