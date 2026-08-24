import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

const ACTIVITY_TYPES = ['LIGACAO', 'FOLLOWUP', 'REUNIAO', 'PROPOSTA', 'OUTRO']

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get('contactId')
  const status = searchParams.get('status')

  const activities = await prisma.crmActivity.findMany({
    where: {
      ...(contactId ? { contactId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          whatsappNumber: true,
          client: { select: { id: true, name: true } },
        },
      },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    take: 200,
  })

  return NextResponse.json(activities)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => ({}))

  const contactId = typeof body.contactId === 'string' ? body.contactId : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!contactId) return NextResponse.json({ error: 'contactId é obrigatório' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 })

  const dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: 'Data inválida' }, { status: 400 })
  }

  const contact = await prisma.crmContact.findUnique({ where: { id: contactId } })
  if (!contact) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })

  const activity = await prisma.crmActivity.create({
    data: {
      contactId,
      title,
      type:
        typeof body.type === 'string' && ACTIVITY_TYPES.includes(body.type)
          ? body.type
          : 'FOLLOWUP',
      notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
      dueDate,
      assigneeId: typeof body.assigneeId === 'string' && body.assigneeId ? body.assigneeId : user.id,
      createdById: user.id,
    },
    include: {
      contact: { select: { id: true, name: true, whatsappNumber: true } },
      assignee: { select: { id: true, name: true } },
    },
  })

  await logActivity(user.id, 'criou atividade de CRM', 'CRM', title)
  return NextResponse.json(activity, { status: 201 })
}
