import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidWebhookToken } from '@/lib/webhook-secret'
import { getAiConfig, isCommandNumber } from '@/lib/ai/config'
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

    // A UAZAPI tem dois formatos de payload conforme a versão:
    // antigo  { event: 'messages', data: { from, body, ... } }
    // atual   { EventType: 'messages', message: { sender, text, ... } }
    const event: string | undefined = body?.event ?? body?.EventType ?? body?.type
    const data = body?.data ?? body?.message

    // Só tratamos eventos de mensagem.
    if (event !== 'messages' || !data) {
      if (event && event !== 'connection' && event !== 'status') {
        // Evento desconhecido: registra um resumo para diagnóstico
        console.log('[webhook] evento ignorado:', String(event), JSON.stringify(body).slice(0, 300))
      }
      return NextResponse.json({ ok: true })
    }

    // Mensagens de grupo são ignoradas para evitar ruído.
    const chatJid: string = data?.chatid ?? data?.chat ?? ''
    if (data?.isGroup || /@g\.us$/.test(chatJid)) return NextResponse.json({ ok: true })

    const fromMe: boolean = !!(data?.fromMe || data?.wasSentByApi)

    // O WhatsApp pode identificar o remetente por um LID de privacidade
    // (ex: 1762...@lid) em vez do telefone. O número real costuma aparecer
    // em outro campo do payload — coletamos todos os candidatos.
    const rawCandidates = fromMe
      ? [data?.chatid, data?.to, data?.chat]
      : [data?.senderPn, data?.sender_pn, data?.participantPn, data?.chatid, data?.from, data?.sender, data?.participant]
    const candidates = [...new Set(
      rawCandidates
        .filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
        .filter((x: string) => !/@g\.us$/.test(x))
        .map((x: string) => x.replace(/@.*$/, '').replace(/\D/g, ''))
        .filter((x: string) => x.length >= 8),
    )]

    // Para o CRM, prefere o que parece um telefone BR real (55 + DDD + nº)
    const number = candidates.find((c) => /^55\d{10,11}$/.test(c)) ?? candidates[0] ?? ''
    if (!number) {
      console.log('[webhook] mensagem sem numero:', JSON.stringify(data).slice(0, 300))
      return NextResponse.json({ ok: true })
    }

    // `content` pode vir como string ou como objeto { text: ... } — e o
    // texto também aparece em body/text/caption conforme o tipo da mensagem
    const rawContent =
      data?.body ?? data?.text ??
      (typeof data?.content === 'string' ? data.content : data?.content?.text) ??
      data?.caption ?? data?.conversation
    const content: string = typeof rawContent === 'string' && rawContent.trim() ? rawContent : '[Mídia]'
    const uazapiMsgId: string | undefined = data?.id ?? data?.messageid

    // Confirmação de cobrança via WhatsApp foi DESATIVADA: o pagamento é
    // confirmado pelo webhook do Asaas. Mensagens dos admins seguem o fluxo
    // normal do CRM.

    // Eco das mensagens do antigo fluxo de cobrança: não polui o CRM
    if (fromMe && /Cobrança #[A-Z0-9]{3,8}/.test(content)) {
      return NextResponse.json({ ok: true })
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

    // Mensagem que saiu do próprio sistema (CRM, IA ou agendamento) já foi
    // gravada na hora do envio — o webhook só ecoa de volta. Casa por conteúdo
    // recente, e não por senderId, porque as mensagens da IA e as agendadas
    // não têm usuário associado (senderId nulo).
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
    // Só mensagens recebidas disparam a IA; o que nós enviamos, não.
    if (!fromMe) {
      const cfg = await getAiConfig().catch(() => null)
      if (cfg?.enabled && cfg.apiKey) {
        if (isCommandNumber(cfg, number)) {
          // Chat de comando: enfileira e processa em background. O job fica
          // gravado antes de responder, então uma queda do container no meio
          // é recuperada pelo despachante em vez de a mensagem sumir.
          const job = await prisma.aiJob.create({
            data: { conversationId, commandChat: number, incomingText: content },
          })
          void processAiJob(job.id).catch((err) =>
            console.error('[ai] processamento em background falhou', err),
          )
        } else if (cfg.draftsEnabled) {
          // Conversa de cliente: apenas sugere um rascunho no CRM.
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
