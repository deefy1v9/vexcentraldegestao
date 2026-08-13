import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidWebhookToken } from '@/lib/webhook-secret'
import { handleBillingReply } from '@/lib/billing-whatsapp'

export async function POST(req: NextRequest) {
  try {
    // Endpoint público (chamado pela UAZAPI): exige o token compartilhado.
    const token = new URL(req.url).searchParams.get('token')
    if (!isValidWebhookToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { event, data } = body

    // Só tratamos eventos de mensagem.
    if (event !== 'messages') return NextResponse.json({ ok: true })

    // Mensagens de grupo são ignoradas para evitar ruído.
    // Remova esta linha para também capturar grupos no CRM.
    if (data?.isGroup) return NextResponse.json({ ok: true })

    const fromMe: boolean = !!(data?.fromMe)

    // Para mensagens enviadas por nós, o contato é o destinatário;
    // para mensagens recebidas, é o remetente.
    const contactJid: string = fromMe
      ? (data?.chatid ?? data?.to ?? data?.chat ?? '')
      : (data?.from ?? '')
    const number = contactJid
      .replace(/@s\.whatsapp\.net$/, '')
      .replace(/@g\.us$/, '')
      .replace(/\D/g, '')
    if (!number) return NextResponse.json({ ok: true })

    const content: string = data?.body || data?.text || '[Mídia]'
    const uazapiMsgId: string | undefined = data?.id

    // Confirmação de cobrança via WhatsApp: mensagens recebidas de um
    // administrador autorizado passam primeiro pelo fluxo financeiro. Se a
    // mensagem for consumida lá, não entra no CRM (é conversa interna).
    if (!fromMe) {
      try {
        const handled = await handleBillingReply(number, content)
        if (handled) return NextResponse.json({ ok: true })
      } catch (err) {
        // Falha no fluxo de cobrança nunca derruba o webhook do CRM
        console.error('Billing reply error:', err)
      }
    }

    // Nome de exibição do contato — melhor esforço a partir do payload.
    const contactName: string =
      (!fromMe && (data?.senderName || data?.pushName || data?.notifyName)) ||
      data?.chatName ||
      number

    // Captura QUALQUER número: cria o contato e a conversa se ainda não existirem.
    const contact = await prisma.crmContact.upsert({
      where: { whatsappNumber: number },
      update: { lastMessage: new Date() },
      create: {
        whatsappNumber: number,
        name: contactName,
        lastMessage: new Date(),
        conversations: { create: { title: 'Conversa principal', status: 'ABERTO' } },
      },
      include: { conversations: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })

    // Pega ou cria a conversa.
    let conversationId = contact.conversations[0]?.id
    if (!conversationId) {
      const conv = await prisma.crmConversation.create({
        data: { contactId: contact.id, title: 'Conversa principal', status: 'ABERTO' },
      })
      conversationId = conv.id
    }

    // Evita registrar a mesma mensagem duas vezes.
    if (uazapiMsgId) {
      const exists = await prisma.crmMessage.findFirst({ where: { uazapiMsgId } })
      if (exists) return NextResponse.json({ ok: true })
    }

    // Mensagem enviada pelo próprio CRM (tem senderId) já foi gravada pela
    // rota de envio — o webhook só ecoa de volta. Não duplica.
    if (fromMe) {
      const crmSent = await prisma.crmMessage.findFirst({
        where: {
          conversationId,
          content,
          senderId: { not: null },
          sentAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
      })
      if (crmSent) return NextResponse.json({ ok: true })
    }

    await prisma.crmMessage.create({
      data: {
        conversationId,
        senderName: fromMe ? 'Você' : contactName,
        content,
        fromClient: !fromMe,
        uazapiMsgId,
      },
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
