import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { isConfigured, uazSendMedia } from '@/lib/uazapi'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const conv = await prisma.crmConversation.findUnique({
    where: { id },
    include: { contact: true },
  })
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const dataUrl = `data:${file.type || 'application/octet-stream'};base64,${base64}`

  let mediaType = 'document'
  if (file.type.startsWith('image/')) mediaType = 'image'
  else if (file.type.startsWith('video/')) mediaType = 'video'
  else if (file.type.startsWith('audio/')) mediaType = 'audio'

  const userId = user.id
  const userName = user.name || 'Colaborador'

  const message = await prisma.crmMessage.create({
    data: {
      conversationId: id,
      senderId: userId,
      senderName: userName,
      content: `📎 ${file.name}`,
      messageType: 'MEDIA',
      fromClient: false,
    },
    include: { sender: { select: { id: true, name: true } } },
  })

  await prisma.crmContact.update({
    where: { id: conv.contactId },
    data: { lastMessage: new Date() },
  })
  await prisma.crmConversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  })

  if (await isConfigured() && conv.contact.whatsappNumber) {
    try {
      await uazSendMedia(conv.contact.whatsappNumber, mediaType, dataUrl, undefined, file.name)
    } catch {
      console.error('UazAPI media send failed')
    }
  }

  return NextResponse.json(message, { status: 201 })
}
