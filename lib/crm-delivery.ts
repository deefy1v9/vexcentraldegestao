import { prisma } from './prisma'
import { isConfigured, uazSendText } from './uazapi'
import { normalizeNumber } from './ai/config'

/**
 * Envia uma mensagem de WhatsApp E registra no CRM, criando contato e conversa
 * se ainda não existirem. Usado pelo agente de IA e pelo despachante de
 * mensagens agendadas, para que tudo que sai apareça no histórico da conversa.
 */
export async function deliverMessage(
  rawNumber: string,
  content: string,
  opts: { senderName?: string; senderId?: string | null } = {},
): Promise<{ conversationId: string; contactId: string }> {
  const number = normalizeNumber(rawNumber)
  if (!number) throw new Error('Número de WhatsApp inválido')
  if (!content.trim()) throw new Error('Mensagem vazia')

  if (!(await isConfigured())) {
    throw new Error('UAZAPI não configurada — não é possível enviar mensagens')
  }

  const contact = await prisma.crmContact.upsert({
    where: { whatsappNumber: number },
    update: { lastMessage: new Date() },
    create: {
      whatsappNumber: number,
      name: number,
      lastMessage: new Date(),
      conversations: { create: { title: 'Conversa principal', status: 'ABERTO' } },
    },
    include: { conversations: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })

  let conversationId = contact.conversations[0]?.id
  if (!conversationId) {
    const conv = await prisma.crmConversation.create({
      data: { contactId: contact.id, title: 'Conversa principal', status: 'ABERTO' },
    })
    conversationId = conv.id
  }

  // Envia primeiro: se a UAZAPI falhar, não queremos uma mensagem registrada
  // no CRM que o destinatário nunca recebeu.
  await uazSendText(number, content)

  await prisma.crmMessage.create({
    data: {
      conversationId,
      senderId: opts.senderId ?? null,
      senderName: opts.senderName ?? 'IA',
      content,
      fromClient: false,
    },
  })

  await prisma.crmConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  })

  return { conversationId, contactId: contact.id }
}

/** Resolve um contato do CRM a partir de um número, se já existir. */
export async function findContactByNumber(rawNumber: string) {
  const number = normalizeNumber(rawNumber)
  if (!number) return null
  return prisma.crmContact.findUnique({
    where: { whatsappNumber: number },
    include: { client: { select: { id: true, name: true } } },
  })
}
