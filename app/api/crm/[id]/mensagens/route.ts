import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isConfigured, uazSendText } from '@/lib/uazapi'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const messages = await prisma.crmMessage.findMany({
    where: { conversationId: id },
    include: { sender: { select: { id: true, name: true } } },
    orderBy: { sentAt: 'asc' },
  })

  return NextResponse.json(messages)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { content, whatsappNumber } = await req.json()

  const userId = (session.user as any).id
  const userName = session.user?.name || 'Colaborador'

  const message = await prisma.crmMessage.create({
    data: {
      conversationId: id,
      senderId: userId,
      senderName: userName,
      content,
      fromClient: false,
    },
    include: { sender: { select: { id: true, name: true } } },
  })

  await prisma.crmConversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  })

  const conv = await prisma.crmConversation.findUnique({
    where: { id },
    include: { contact: true },
  })
  if (conv?.contact) {
    await prisma.crmContact.update({
      where: { id: conv.contactId },
      data: { lastMessage: new Date() },
    })
  }

  if (await isConfigured() && whatsappNumber) {
    try {
      await uazSendText(whatsappNumber, content)
    } catch {
      console.error('UazAPI send failed')
    }
  }

  return NextResponse.json(message, { status: 201 })
}
