import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../prisma'
import { getAiConfig, nowInBrazil, type AiConfig } from './config'

const HISTORY_LIMIT = 12

/**
 * Prompt estável (prefixo cacheado). O rascunho é sempre revisado por uma
 * pessoa antes de sair, então a instrução é ser útil e conservador — não
 * prometer nada em nome da agência.
 */
const DRAFT_SYSTEM = `Você redige rascunhos de resposta para o WhatsApp de uma agência de marketing brasileira, a VEX Growth.

Uma pessoa da equipe vai ler seu rascunho e decidir se envia. Você nunca fala direto com o cliente.

Escreva a resposta que a equipe mandaria para a última mensagem do cliente:
- Português do Brasil, tom profissional e cordial, sem formalidade exagerada.
- Curto: normalmente 1 a 3 frases. É WhatsApp, não e-mail.
- Sem markdown, sem títulos, sem assinatura.

Nunca prometa prazo, valor, desconto ou entrega que não esteja explícito no histórico da conversa. Se o cliente pedir algo que exige uma decisão da agência, escreva uma resposta que reconhece o pedido e diz que a equipe vai retornar — não decida no lugar dela.

Se a última mensagem não pedir resposta (só um "ok", "obrigado", um emoji), responda exatamente: SEM_RESPOSTA

Devolva apenas o texto do rascunho, mais nada.`

/**
 * Gera uma sugestão de resposta para a última mensagem do cliente e guarda como
 * rascunho pendente. Substitui o rascunho anterior da conversa: só a sugestão
 * mais recente interessa.
 */
export async function generateDraft(params: {
  conversationId: string
  basedOnMsgId?: string | null
  cfg?: AiConfig
}): Promise<void> {
  const cfg = params.cfg ?? (await getAiConfig())
  if (!cfg.enabled || !cfg.draftsEnabled || !cfg.apiKey) return

  const conversation = await prisma.crmConversation.findUnique({
    where: { id: params.conversationId },
    include: {
      contact: { include: { client: { select: { name: true, niche: true } } } },
    },
  })
  if (!conversation) return

  const rows = await prisma.crmMessage.findMany({
    where: { conversationId: params.conversationId },
    orderBy: { sentAt: 'desc' },
    take: HISTORY_LIMIT,
    select: { content: true, fromClient: true },
  })
  if (rows.length === 0) return

  const transcript = rows
    .reverse()
    .map((m) => `${m.fromClient ? 'Cliente' : 'Equipe'}: ${m.content}`)
    .join('\n')

  const contact = conversation.contact
  const quem = contact.client
    ? `${contact.name ?? 'contato'} — cliente ${contact.client.name}${contact.client.niche ? ` (${contact.client.niche})` : ''}`
    : (contact.name ?? 'contato sem cadastro')

  const client = new Anthropic({ apiKey: cfg.apiKey })

  let suggestion: string
  try {
    const response = await client.messages.create({
      model: cfg.draftModel,
      max_tokens: 1000,
      system: [{ type: 'text', text: DRAFT_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `[agora: ${nowInBrazil()}]\nConversa com: ${quem}\n\n--- histórico ---\n${transcript}\n--- fim ---\n\nEscreva o rascunho de resposta para a última mensagem do cliente.`,
        },
      ],
    })

    if (response.stop_reason === 'refusal') return

    suggestion = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
  } catch (err) {
    // Rascunho é conveniência: falhar aqui não pode quebrar o recebimento da
    // mensagem no CRM.
    console.error('[ai] rascunho falhou', err instanceof Error ? err.message : err)
    return
  }

  if (!suggestion || suggestion === 'SEM_RESPOSTA') return

  await prisma.$transaction([
    prisma.aiDraft.updateMany({
      where: { conversationId: params.conversationId, status: 'PENDENTE' },
      data: { status: 'SUBSTITUIDO', resolvedAt: new Date() },
    }),
    prisma.aiDraft.create({
      data: {
        conversationId: params.conversationId,
        content: suggestion,
        basedOnMsgId: params.basedOnMsgId ?? null,
      },
    }),
  ])
}
