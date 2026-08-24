import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { Prisma } from '@prisma/client'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  // Whitelist com semântica de update parcial: o calendário envia apenas
  // `{ status }` ao marcar um evento como concluído. Tratar campo ausente
  // como null apagava cliente, responsável e data final do evento.
  const data: Prisma.CalendarEventUpdateInput = {}

  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (body.description !== undefined) {
    data.description = body.description ? String(body.description) : null
  }
  if (body.startDate !== undefined && body.startDate) data.startDate = new Date(body.startDate)
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null
  if (typeof body.type === 'string' && body.type) data.type = body.type
  if (typeof body.status === 'string' && body.status) data.status = body.status
  if (body.clientId !== undefined) {
    data.client = body.clientId ? { connect: { id: String(body.clientId) } } : { disconnect: true }
  }
  if (body.assignedTo !== undefined) {
    data.assignedUser = body.assignedTo
      ? { connect: { id: String(body.assignedTo) } }
      : { disconnect: true }
  }

  const event = await prisma.calendarEvent.update({
    where: { id },
    data,
    include: {
      client: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true } },
    },
  })

  await logActivity(user.id, 'atualizou evento', 'Calendário', event.title)
  return NextResponse.json(event)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const event = await prisma.calendarEvent.delete({ where: { id } })
  await logActivity(user.id, 'removeu evento', 'Calendário', event.title)
  return NextResponse.json({ ok: true })
}
