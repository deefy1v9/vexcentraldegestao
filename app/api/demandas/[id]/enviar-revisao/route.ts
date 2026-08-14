import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { isValidDriveLink, logTaskEvent, notifyWhatsApp, taskShortId } from '@/lib/task-flow'
import { TIER_LABEL, Tier } from '@/lib/client-tier'

/**
 * Produção concluída → envia a demanda para revisão.
 * Exige link válido do Google Drive; registra quem enviou e quando, move
 * para EM_REVISAO, passa a bola ao revisor e avisa pelo WhatsApp.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const isAdmin = (session.user as any).role === 'ADMIN'

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const driveLink = String(body.driveLink ?? '').trim()
  const note = body.note ? String(body.note).trim() : ''

  if (!isValidDriveLink(driveLink)) {
    return NextResponse.json(
      { error: 'Informe um link válido do Google Drive (https://drive.google.com/... ou https://docs.google.com/...).' },
      { status: 400 },
    )
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      reviewer: { select: { id: true, name: true } },
      client: { select: { name: true, tier: true } },
    },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (task.status === 'CONCLUIDO' || task.status === 'APROVADO') {
    return NextResponse.json({ error: 'Esta demanda já passou da fase de produção.' }, { status: 400 })
  }

  // Só o produtor, o responsável atual ou um administrador enviam
  const allowed = isAdmin || task.producerId === userId || task.assigneeId === userId
  if (!allowed) return NextResponse.json({ error: 'Apenas o responsável pela produção pode enviar para revisão.' }, { status: 403 })

  if (!task.reviewerId) {
    return NextResponse.json({ error: 'Defina o responsável pela revisão antes de enviar.' }, { status: 400 })
  }

  const updated = await prisma.task.update({
    where: { id },
    data: {
      driveLink,
      driveLinkSentAt: new Date(),
      driveLinkSentBy: userId,
      status: 'EM_REVISAO',
      assigneeId: task.reviewerId,
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

  const senderName = (session.user as any).name ?? 'Usuário'
  await logTaskEvent(id, 'ENVIO_REVISAO', `${senderName} enviou para revisão com link do Drive${note ? ` — obs.: ${note}` : ''}`, userId)
  if (note) {
    await prisma.taskComment.create({ data: { taskId: id, userId, content: `[Para o revisor] ${note}` } }).catch(() => {})
  }
  await logActivity(userId, 'enviou demanda para revisão', 'Demandas', task.title)

  // Aviso pelo WhatsApp já conectado, com as mesmas informações da mensagem
  // de atribuição: ID, cliente, prazo de revisão (D-1), link e quem enviou
  const reviewDue = task.dueDate
    ? new Date(new Date(task.dueDate).getTime() - 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')
    : null
  const reviewMsg = [
    `📝 *Nova demanda para revisão* ${taskShortId(task.number)}`,
    ``,
    `*${task.title}*`,
    ``,
    task.client ? `• Cliente: ${task.client.name}` : null,
    reviewDue ? `• Revisar até: ${reviewDue}` : null,
    task.dueDate ? `• Data final: ${new Date(task.dueDate).toLocaleDateString('pt-BR')}` : null,
    `• Link: ${driveLink}`,
    `• Enviada por: ${senderName}`,
    note ? `• Obs.: ${note}` : null,
    task.client?.tier ? `\nCliente ${TIER_LABEL[task.client.tier as Tier]}.` : null,
  ].filter(Boolean).join('\n')
  await notifyWhatsApp(task.reviewerId, reviewMsg)
  await logTaskEvent(id, 'LEMBRETE', `Aviso de revisão enviado para ${task.reviewer?.name ?? 'revisor'} (WhatsApp)`)

  return NextResponse.json(updated)
}
