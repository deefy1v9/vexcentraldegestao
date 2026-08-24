import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { normalizeNumber } from '@/lib/ai/config'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const contactId = searchParams.get('contactId')

  const messages = await prisma.scheduledMessage.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(contactId ? { contactId } : {}),
    },
    include: {
      contact: { select: { id: true, name: true, whatsappNumber: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 200,
  })

  return NextResponse.json(messages)
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => ({}))

  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 })

  const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null
  if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json({ error: 'Data inválida' }, { status: 400 })
  }
  if (scheduledFor.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'A data precisa ser no futuro' }, { status: 400 })
  }

  // Aceita o contato do CRM ou um número solto.
  let contactId: string | null =
    typeof body.contactId === 'string' && body.contactId ? body.contactId : null
  let whatsappNumber = normalizeNumber(body.whatsappNumber)

  if (contactId) {
    const contact = await prisma.crmContact.findUnique({ where: { id: contactId } })
    if (!contact) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
    whatsappNumber = contact.whatsappNumber
  } else if (whatsappNumber) {
    const contact = await prisma.crmContact.findUnique({ where: { whatsappNumber } })
    contactId = contact?.id ?? null
  }

  if (!whatsappNumber) {
    return NextResponse.json({ error: 'Informe um contato ou um número' }, { status: 400 })
  }

  const scheduled = await prisma.scheduledMessage.create({
    data: {
      contactId,
      whatsappNumber,
      content,
      scheduledFor,
      createdById: user.id,
    },
    include: {
      contact: { select: { id: true, name: true, whatsappNumber: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  await logActivity(user.id, 'agendou mensagem de WhatsApp', 'CRM', whatsappNumber)
  return NextResponse.json(scheduled, { status: 201 })
}
