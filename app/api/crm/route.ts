import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contacts = await prisma.crmContact.findMany({
    include: {
      client: { select: { id: true, name: true, phone: true } },
      conversations: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        include: {
          messages: { orderBy: { sentAt: 'desc' }, take: 1 },
        },
      },
    },
    orderBy: { lastMessage: { sort: 'desc', nulls: 'last' } },
  })

  return NextResponse.json(contacts)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { clientId, whatsappNumber } = body

  const contact = await prisma.crmContact.create({
    data: {
      clientId,
      whatsappNumber,
      conversations: {
        create: { title: 'Conversa principal', status: 'ABERTO' },
      },
    },
    include: {
      client: { select: { id: true, name: true } },
      conversations: true,
    },
  })

  return NextResponse.json(contact, { status: 201 })
}
