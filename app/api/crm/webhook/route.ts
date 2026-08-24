import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidWebhookToken } from '@/lib/webhook-secret'
import { getAiConfig, isCommandNumber, normalizeNumber } from '@/lib/ai/config'
import { processAiJob } from '@/lib/ai/agent'
import { generateDraft } from '@/lib/ai/drafts'

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
    const number = normalizeNumber(
      contactJid.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, ''),
    )
    if (!number) return NextResponse.json({ ok: true })

    const content: string = data?.body || data?.text || '[Mídia]'
    const uazapiMsgId: string | undefined = data?.id

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

    // Mensagem que saiu do próprio sistema (pelo CRM, pela IA ou por um
    // agendamento) já foi gravada na hora do envio — o webhook só ecoa de
    // volta. Casa por conteúdo recente em vez de por senderId, porque as
    // mensagens da IA não têm usuário associado.
    if (fromMe) {
      const jaRegistrada = await prisma.crmMessage.findFirst({
        where: {
          conversationId,
          content,
          fromClient: false,
          sentAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
      })
      if (jaRegistrada) return NextResponse.json({ ok: true })
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

    // ─── Camada de IA ────────────────────────────────────────────────────
    // Só mensagens recebidas disparam IA. Mensagens que nós enviamos, não.
    if (!fromMe) {
      const cfg = await getAiConfig().catch(() => null)

      if (cfg?.enabled && cfg.apiKey) {
        if (isCommandNumber(cfg, number)) {
          // Chat de comando: enfileira e processa em background. O job fica
          // gravado antes de responder, então se o container cair no meio o
          // despachante reprocessa em vez de a mensagem sumir.
          const job = await prisma.aiJob.create({
            data: { conversationId, commandChat: number, incomingText: content },
          })
          void processAiJob(job.id).catch((err) =>
            console.error('[ai] processamento em background falhou', err),
          )
        } else if (cfg.draftsEnabled) {
          // Conversa de cliente: apenas sugere uma resposta no CRM.
          // A IA nunca responde o cliente sozinha.
          void generateDraft({ conversationId, cfg }).catch((err) =>
            console.error('[ai] geração de rascunho falhou', err),
          )
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ ok: true })
  }
}
