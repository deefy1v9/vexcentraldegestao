import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { Prisma } from '@prisma/client'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  // Só grava os campos presentes no corpo. Espalhar o body inteiro e tratar
  // campo ausente como null apagava cliente, responsável e data final a cada
  // mudança de status — e o calendário envia apenas { status } ao concluir
  // um evento. Mesma correção já aplicada em /api/demandas/[id].
  const data: Prisma.CalendarEventUpdateInput = {}
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  if (has('title') && String(body.title).trim()) data.title = String(body.title).trim()
  if (has('description')) data.description = body.description ? String(body.description) : null
  if (has('type') && body.type) data.type = String(body.type)
  if (has('status') && body.status) data.status = String(body.status)

  if (has('startDate') && body.startDate) {
    const d = new Date(body.startDate)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Data inicial inválida' }, { status: 400 })
    }
    data.startDate = d
  }

  if (has('endDate')) {
    if (body.endDate) {
      const d = new Date(body.endDate)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Data final inválida' }, { status: 400 })
      }
      data.endDate = d
    } else {
      data.endDate = null
    }
  }

  if (has('clientId')) {
    data.client = body.clientId ? { connect: { id: String(body.clientId) } } : { disconnect: true }
  }
  if (has('assignedTo')) {
    data.assignedUser = body.assignedTo
      ? { connect: { id: String(body.assignedTo) } }
      : { disconnect: true }
  }

  const event = await prisma.calendarEvent.update({ where: { id }, data })

  await logActivity(user.id, 'atualizou evento', 'Calendário', event.title)
  return NextResponse.json(event)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const event = await prisma.calendarEvent.delete({ where: { id } })
  await logActivity(user.id, 'removeu evento', 'Calendário', event.title)
  return NextResponse.json({ ok: true })
}
