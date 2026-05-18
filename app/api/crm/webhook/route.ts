import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event, data } = body

    // Only handle incoming messages
    if (event !== 'messages') return NextResponse.json({ ok: true })

    // Skip group messages
    if (data?.isGroup) return NextResponse.json({ ok: true })

    const fromMe: boolean = !!(data?.fromMe)

    // For messages sent by us, use the recipient (chatid/to) as the contact number
    // For messages received, use the sender (from) as the contact number
    const contactJid: string = fromMe
      ? (data?.chatid ?? data?.to ?? data?.chat ?? '')
      : (data?.from ?? '')
    const number = contactJid.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '')
    if (!number) return NextResponse.json({ ok: true })

    const content: string = data?.body || data?.text || '[Mídia]'
    const uazapiMsgId: string | undefined = data?.id

    // Find CRM contact by WhatsApp number
    const contact = await prisma.crmContact.findFirst({
      where: { whatsappNumber: { contains: number } },
      include: { conversations: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })

    if (!contact) return NextResponse.json({ ok: true })

    // Get or create conversation
    let conversationId = contact.conversations[0]?.id
    if (!conversationId) {
      const conv = await prisma.crmConversation.create({
        data: { contactId: contact.id, title: 'Conversa principal', status: 'ABERTO' },
      })
      conversationId = conv.id
    }

    // Avoid duplicate messages
    if (uazapiMsgId) {
      const exists = await prisma.crmMessage.findFirst({ where: { uazapiMsgId } })
      if (exists) return NextResponse.json({ ok: true })
    }

    await prisma.crmMessage.create({
      data: {
        conversationId,
        senderName: fromMe ? 'VEX Growth' : 'Cliente',
        content,
        fromClient: !fromMe,
        uazapiMsgId,
      },
    })

    await prisma.crmContact.update({
      where: { id: contact.id },
      data: { lastMessage: new Date() },
    })

    await prisma.crmConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ ok: true })
  }
}
