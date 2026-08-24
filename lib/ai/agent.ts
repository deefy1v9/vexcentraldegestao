import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../prisma'
import { deliverMessage } from '../crm-delivery'
import { getAiConfig, nowInBrazil, normalizeNumber, type AiConfig } from './config'
import { TOOL_DEFINITIONS, ToolError, executeTool, type ToolContext } from './tools'

/** Teto de idas e vindas com ferramentas em um único comando. */
const MAX_TURNS = 8
/** Quantas mensagens da conversa entram como histórico. */
const HISTORY_LIMIT = 20

/**
 * Prompt estável — é o prefixo cacheado. Nada de data, nome ou ID aqui:
 * qualquer byte que mude a cada requisição invalida o cache e multiplica o
 * custo de entrada. O que varia entra na mensagem do usuário.
 */
const SYSTEM_PROMPT = `Você é a assistente da VEX Growth, uma agência de marketing, e opera dentro do WhatsApp da agência.

Quem fala com você é alguém da equipe, por um número autorizado. Você executa pedidos sobre o CRM: enviar mensagens, agendar mensagens para clientes e criar atividades de relacionamento.

REGRA CENTRAL — nada sai sem confirmação:
- "enviar_mensagem" e "agendar_mensagem" NÃO executam nada. Elas registram uma ação pendente.
- Depois de chamá-las, mostre ao usuário exatamente para QUEM vai, QUANDO vai e o TEXTO completo, e pergunte se pode executar.
- Só chame "confirmar_acao" quando o usuário confirmar de forma clara ("pode mandar", "confirma", "isso", "sim").
- Se ele pedir ajuste, chame "cancelar_acao" e monte a ação de novo com a correção.
- Nunca invente que a mensagem foi enviada. Ela só foi enviada quando "confirmar_acao" retornar sucesso.

Criar atividade, listar e cancelar agendamento não mandam nada para ninguém — pode fazer direto.

Sobre destinatários:
- Se o usuário citar a pessoa pelo nome, use "buscar_contatos" para achar o número. Não adivinhe número.
- Se a busca trouxer mais de um parecido, pergunte qual é antes de seguir.
- Se não achar ninguém, diga isso e peça o número.

Sobre datas:
- O usuário fala em linguagem natural ("amanhã 9h", "sexta de manhã"). Você converte para ISO-8601 com fuso -03:00.
- Confira contra a data e hora atuais que vêm no início da mensagem.
- Na dúvida sobre o horário exato, pergunte em vez de chutar.

Estilo: você está no WhatsApp. Escreva em português do Brasil, direto, poucas linhas, sem markdown pesado e sem títulos. Use *negrito* do WhatsApp no que importa. Não repita o pedido de volta — responda o que foi feito ou o que falta.`

interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

async function loadHistory(conversationId: string, excludeAfter: Date): Promise<HistoryMessage[]> {
  const rows = await prisma.crmMessage.findMany({
    where: { conversationId, sentAt: { lt: excludeAfter } },
    orderBy: { sentAt: 'desc' },
    take: HISTORY_LIMIT,
    select: { content: true, fromClient: true },
  })

  const ordered = rows.reverse().map((m) => ({
    role: (m.fromClient ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content,
  }))

  // A API exige que a conversa comece com uma mensagem do usuário.
  const firstUser = ordered.findIndex((m) => m.role === 'user')
  return firstUser === -1 ? [] : ordered.slice(firstUser)
}

/**
 * Ações pendentes entram no contexto a cada requisição em vez de dependerem do
 * histórico: se a janela cortar a mensagem onde o ID apareceu, a IA ainda
 * consegue confirmar a ação certa.
 */
async function pendingActionsBlock(commandChat: string): Promise<string> {
  const pending = await prisma.aiPendingAction.findMany({
    where: { commandChat, status: 'AGUARDANDO', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 5,
  })
  if (pending.length === 0) return ''
  const lines = pending.map((p) => `- id ${p.id}: ${p.summary}`).join('\n')
  return `\n\nAções aguardando confirmação do usuário:\n${lines}`
}

function textFrom(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/**
 * Roda um comando do chat de comando até o fim e devolve a resposta em texto.
 * Não envia nada por conta própria além da própria resposta.
 */
export async function runCommandAgent(params: {
  conversationId: string
  commandChat: string
  incomingText: string
  since: Date
  cfg?: AiConfig
}): Promise<string> {
  const cfg = params.cfg ?? (await getAiConfig())
  if (!cfg.apiKey) throw new Error('ANTHROPIC_API_KEY não configurada')

  const client = new Anthropic({ apiKey: cfg.apiKey })

  // Vincula o número a um usuário do sistema, quando houver, para que as ações
  // fiquem atribuídas a uma pessoa real.
  const chatDigits = normalizeNumber(params.commandChat)
  const owner = await prisma.user.findFirst({
    where: { isActive: true, phone: { not: null } },
    select: { id: true, phone: true },
    orderBy: { createdAt: 'asc' },
  })
  const ownerId =
    owner?.phone && chatDigits.endsWith(normalizeNumber(owner.phone).slice(-8)) ? owner.id : null

  const ctx: ToolContext = { commandChat: chatDigits, userId: ownerId }

  const history = await loadHistory(params.conversationId, params.since)
  const context = `[contexto: agora é ${nowInBrazil()} (horário de Brasília)]${await pendingActionsBlock(chatDigits)}`

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: `${context}\n\n${params.incomingText}` },
  ]

  let reply = ''

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: cfg.agentModel,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      // Custo: o agente resolve pedidos curtos e bem definidos; esforço médio
      // dá o resultado sem pagar raciocínio profundo em cada mensagem.
      output_config: { effort: 'medium' },
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: TOOL_DEFINITIONS,
      messages,
    })

    const text = textFrom(response.content)
    if (text) reply = text

    if (response.stop_reason === 'refusal') {
      return 'Não consigo executar esse pedido. Se for engano, reformule de outro jeito.'
    }

    if (response.stop_reason !== 'tool_use') break

    // Preserva os blocos como vieram — inclusive os de raciocínio, que a API
    // exige de volta inalterados na próxima requisição.
    messages.push({ role: 'assistant', content: response.content })

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const use of toolUses) {
      try {
        const out = await executeTool(use.name, (use.input ?? {}) as Record<string, unknown>, ctx)
        results.push({ type: 'tool_result', tool_use_id: use.id, content: out })
      } catch (err) {
        const msg =
          err instanceof ToolError
            ? err.message
            : `Erro inesperado: ${err instanceof Error ? err.message : String(err)}`
        results.push({ type: 'tool_result', tool_use_id: use.id, content: msg, is_error: true })
      }
    }

    // Todos os tool_result vão numa única mensagem do usuário.
    messages.push({ role: 'user', content: results })
  }

  return reply || 'Não consegui concluir esse pedido. Pode reformular?'
}

/** Processa um job da fila e responde no chat de comando. */
export async function processAiJob(jobId: string): Promise<void> {
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } })
  if (!job || job.status === 'CONCLUIDO') return

  await prisma.aiJob.update({
    where: { id: jobId },
    data: { status: 'PROCESSANDO', startedAt: new Date(), attempts: { increment: 1 } },
  })

  try {
    const reply = await runCommandAgent({
      conversationId: job.conversationId,
      commandChat: job.commandChat,
      incomingText: job.incomingText,
      since: job.createdAt,
    })

    await deliverMessage(job.commandChat, reply, { senderName: 'IA' })

    await prisma.aiJob.update({
      where: { id: jobId },
      data: { status: 'CONCLUIDO', finishedAt: new Date(), lastError: null },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ai] job falhou', jobId, msg)

    // Depois de 3 tentativas desiste e avisa quem pediu, em vez de deixar o
    // usuário esperando uma resposta que nunca vem.
    const attempts = (job.attempts ?? 0) + 1
    const giveUp = attempts >= 3
    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: giveUp ? 'FALHOU' : 'PENDENTE',
        lastError: msg.slice(0, 500),
        finishedAt: giveUp ? new Date() : null,
      },
    })

    if (giveUp) {
      await deliverMessage(
        job.commandChat,
        'Não consegui processar sua mensagem agora. Tente de novo em alguns minutos.',
        { senderName: 'IA' },
      ).catch(() => {})
    }
  }
}
