import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { Prisma } from '@prisma/client'

const ACTIVITY_TYPES = ['LIGACAO', 'FOLLOWUP', 'REUNIAO', 'PROPOSTA', 'OUTRO']
const STATUSES = ['PENDENTE', 'CONCLUIDA', 'CANCELADA']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  // Update parcial com whitelist: a lista de atividades envia só { status }
  // ao marcar como concluída.
  const data: Prisma.CrmActivityUpdateInput = {}

  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null
  if (typeof body.type === 'string' && ACTIVITY_TYPES.includes(body.type)) data.type = body.type
  if (body.dueDate !== undefined && body.dueDate) {
    const d = new Date(body.dueDate)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Data inválida' }, { status: 400 })
    }
    data.dueDate = d
  }
  if (typeof body.status === 'string' && STATUSES.includes(body.status)) {
    data.status = body.status
    data.completedAt = body.status === 'CONCLUIDA' ? new Date() : null
  }
  if (body.assigneeId !== undefined) {
    data.assignee = body.assigneeId
      ? { connect: { id: String(body.assigneeId) } }
      : { disconnect: true }
  }

  const activity = await prisma.crmActivity.update({
    where: { id },
    data,
    include: {
      contact: { select: { id: true, name: true, whatsappNumber: true } },
      assignee: { select: { id: true, name: true } },
    },
  })

  await logActivity(user.id, 'atualizou atividade de CRM', 'CRM', activity.title)
  return NextResponse.json(activity)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const activity = await prisma.crmActivity.delete({ where: { id } })

  await logActivity(user.id, 'removeu atividade de CRM', 'CRM', activity.title)
  return NextResponse.json({ ok: true })
}
