import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const year = searchParams.get('year')

  const where: Record<string, unknown> = {}
  if (month && year) {
    const start = new Date(Number(year), Number(month) - 1, 1)
    const end = new Date(Number(year), Number(month), 0, 23, 59, 59)
    where.startDate = { gte: start, lte: end }
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true } },
    },
    orderBy: { startDate: 'asc' },
  })

  return NextResponse.json(events)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = await req.json()
  const event = await prisma.calendarEvent.create({
    data: {
      title: body.title,
      description: body.description,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      type: body.type || 'ENTREGA',
      status: body.status || 'PENDENTE',
      clientId: body.clientId || null,
      assignedTo: body.assignedTo || null,
    },
    include: {
      client: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true } },
    },
  })

  await logActivity(user.id, 'criou evento', 'Calendário', body.title)
  return NextResponse.json(event, { status: 201 })
}
