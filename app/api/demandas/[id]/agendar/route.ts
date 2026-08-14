import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { logTaskEvent } from '@/lib/task-flow'

/**
 * Confirmação do agendamento — a única porta para "Concluído" no fluxo.
 * Somente o responsável pelo agendamento ou um administrador. Preserva o
 * link do Drive e todo o histórico de produção e revisão.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const userName = (session.user as any).name ?? 'Usuário'
  const isAdmin = (session.user as any).role === 'ADMIN'

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const date = body.date ? String(body.date) : ''
  const time = body.time ? String(body.time) : ''
  const platform = body.platform ? String(body.platform).trim() : ''
  const publicationLink = body.publicationLink ? String(body.publicationLink).trim() : ''
  const note = body.note ? String(body.note).trim() : ''

  if (!date || !time || !platform) {
    return NextResponse.json({ error: 'Data, horário e plataforma do agendamento são obrigatórios.' }, { status: 400 })
  }
  const scheduledFor = new Date(`${date}T${time}:00`)
  if (Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json({ error: 'Data ou horário inválido.' }, { status: 400 })
  }

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (task.status !== 'APROVADO') {
    return NextResponse.json({ error: 'A demanda precisa estar em "Aprovado para Agendamento".' }, { status: 400 })
  }

  const allowed = isAdmin || task.schedulerId === userId || task.assigneeId === userId
  if (!allowed) {
    return NextResponse.json({ error: 'Apenas o responsável pelo agendamento pode confirmar.' }, { status: 403 })
  }

  const updated = await prisma.task.update({
    where: { id },
    data: {
      status: 'CONCLUIDO',
      scheduledById: userId,
      scheduledAt: new Date(),
      scheduledFor,
      scheduledPlatform: platform,
      publicationLink: publicationLink || null,
      scheduleNote: note || null,
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

  const when = scheduledFor.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  await logTaskEvent(
    id,
    'AGENDAMENTO',
    `${userName} confirmou o agendamento: ${when} · ${platform}${publicationLink ? ` · ${publicationLink}` : ''}${note ? ` — obs.: ${note}` : ''}`,
    userId,
  )
  await logActivity(userId, 'confirmou agendamento da demanda', 'Demandas', task.title)

  return NextResponse.json(updated)
}
