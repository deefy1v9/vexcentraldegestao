import type Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../prisma'
import { deliverMessage, findContactByNumber } from '../crm-delivery'
import { formatBr, normalizeNumber } from './config'

export interface ToolContext {
  /** Número do chat de comando que está falando com a IA. */
  commandChat: string
  /** Usuário do sistema correspondente ao número, quando existir. */
  userId: string | null
}

/** Erro previsto de ferramenta: vira tool_result com is_error, não derruba o loop. */
export class ToolError extends Error {}

const ACTIVITY_TYPES = ['LIGACAO', 'FOLLOWUP', 'REUNIAO', 'PROPOSTA', 'OUTRO']

/**
 * Exige fuso explícito. Sem isso, "2026-08-25T09:00:00" seria interpretado no
 * fuso do container (UTC) e todo agendamento sairia 3 horas adiantado.
 */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

function parseWhen(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !ISO_WITH_OFFSET.test(value)) {
    throw new ToolError(
      `${field} precisa estar em ISO-8601 com fuso explícito. Exemplo: 2026-08-25T09:00:00-03:00`,
    )
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new ToolError(`${field} não é uma data válida`)
  return d
}

function requireText(value: unknown, field: string, max = 4000): string {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) throw new ToolError(`${field} é obrigatório`)
  if (s.length > max) throw new ToolError(`${field} excede ${max} caracteres`)
  return s
}

function requireNumber(value: unknown): string {
  const n = normalizeNumber(typeof value === 'string' ? value : '')
  if (n.length < 8) throw new ToolError('numero de WhatsApp inválido (informe com DDD)')
  return n
}

const PENDING_TTL_MS = 60 * 60 * 1000 // 1h

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'buscar_contatos',
    description:
      'Busca contatos do CRM por nome, número ou nome do cliente vinculado. Use antes de enviar ou agendar mensagem quando o usuário citar a pessoa pelo nome, para descobrir o número correto.',
    input_schema: {
      type: 'object',
      properties: {
        termo: {
          type: 'string',
          description: 'Nome ou parte do número. Vazio lista os contatos mais recentes.',
        },
      },
    },
  },
  {
    name: 'enviar_mensagem',
    description:
      'Prepara o envio IMEDIATO de uma mensagem de WhatsApp para alguém. NÃO envia na hora: cria uma ação pendente que só é executada depois que o usuário confirmar. Depois de chamar, mostre ao usuário o destinatário e o texto e peça confirmação.',
    input_schema: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'Número com DDD, apenas dígitos. Ex: 5511999998888' },
        texto: { type: 'string', description: 'Conteúdo exato da mensagem que será enviada.' },
      },
      required: ['numero', 'texto'],
    },
  },
  {
    name: 'agendar_mensagem',
    description:
      'Prepara o agendamento de uma mensagem para uma data/hora futura. NÃO agenda na hora: cria uma ação pendente que só é executada após confirmação do usuário.',
    input_schema: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'Número com DDD, apenas dígitos.' },
        texto: { type: 'string', description: 'Conteúdo exato da mensagem.' },
        quando: {
          type: 'string',
          description:
            'Data e hora em ISO-8601 COM fuso. Horário de Brasília usa -03:00. Ex: 2026-08-25T09:00:00-03:00',
        },
      },
      required: ['numero', 'texto', 'quando'],
    },
  },
  {
    name: 'confirmar_acao',
    description:
      'Executa de fato uma ação pendente depois que o usuário confirmou (disse "pode mandar", "confirma", "sim"). Só chame após confirmação explícita do usuário.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID da ação pendente.' } },
      required: ['id'],
    },
  },
  {
    name: 'cancelar_acao',
    description: 'Descarta uma ação pendente que o usuário recusou ou quer refazer.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID da ação pendente.' } },
      required: ['id'],
    },
  },
  {
    name: 'listar_agendamentos',
    description: 'Lista as mensagens já agendadas e ainda não enviadas.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cancelar_agendamento',
    description:
      'Cancela uma mensagem agendada que ainda não foi enviada. Não precisa de confirmação.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID do agendamento.' } },
      required: ['id'],
    },
  },
  {
    name: 'criar_atividade',
    description:
      'Cria uma atividade de relacionamento no CRM (ligação, follow-up, reunião, proposta) ligada a um contato. Não envia nada para o cliente, então não precisa de confirmação.',
    input_schema: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'Número do contato no WhatsApp, com DDD.' },
        titulo: { type: 'string', description: 'Título curto da atividade.' },
        tipo: { type: 'string', enum: ACTIVITY_TYPES, description: 'Tipo da atividade.' },
        data: {
          type: 'string',
          description: 'Data/hora em ISO-8601 com fuso. Ex: 2026-08-26T14:00:00-03:00',
        },
        notas: { type: 'string', description: 'Observações adicionais.' },
      },
      required: ['numero', 'titulo', 'data'],
    },
  },
  {
    name: 'listar_atividades',
    description: 'Lista as atividades de CRM pendentes, das mais próximas para as mais distantes.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'concluir_atividade',
    description: 'Marca uma atividade do CRM como concluída.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID da atividade.' } },
      required: ['id'],
    },
  },
]

// ─── Execução ───────────────────────────────────────────────────────────────

type Input = Record<string, unknown>

async function createPendingAction(
  ctx: ToolContext,
  toolName: string,
  payload: Input,
  summary: string,
): Promise<string> {
  const action = await prisma.aiPendingAction.create({
    data: {
      commandChat: ctx.commandChat,
      toolName,
      payload: JSON.stringify(payload),
      summary,
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    },
  })
  return [
    `Ação registrada e AGUARDANDO CONFIRMAÇÃO (id: ${action.id}).`,
    `Resumo: ${summary}`,
    'Nada foi enviado ainda. Mostre isso ao usuário e pergunte se pode executar.',
    'Quando ele confirmar, chame confirmar_acao com esse id.',
  ].join('\n')
}

async function executePendingPayload(
  toolName: string,
  payload: Input,
  ctx: ToolContext,
): Promise<string> {
  if (toolName === 'enviar_mensagem') {
    const numero = requireNumber(payload.numero)
    const texto = requireText(payload.texto, 'texto')
    await deliverMessage(numero, texto, { senderName: 'IA', senderId: ctx.userId })
    return `Mensagem enviada para ${numero}.`
  }

  if (toolName === 'agendar_mensagem') {
    const numero = requireNumber(payload.numero)
    const texto = requireText(payload.texto, 'texto')
    const quando = parseWhen(payload.quando, 'quando')
    const contact = await findContactByNumber(numero)
    const sched = await prisma.scheduledMessage.create({
      data: {
        contactId: contact?.id ?? null,
        whatsappNumber: numero,
        content: texto,
        scheduledFor: quando,
        createdById: ctx.userId,
        createdByAi: true,
      },
    })
    return `Mensagem agendada para ${numero} em ${formatBr(quando)} (id: ${sched.id}).`
  }

  throw new ToolError(`Ação "${toolName}" não pode ser executada`)
}

export async function executeTool(
  name: string,
  input: Input,
  ctx: ToolContext,
): Promise<string> {
  switch (name) {
    case 'buscar_contatos': {
      const termo = typeof input.termo === 'string' ? input.termo.trim() : ''
      const digits = normalizeNumber(termo)
      const contacts = await prisma.crmContact.findMany({
        where: termo
          ? {
              OR: [
                { name: { contains: termo, mode: 'insensitive' as const } },
                ...(digits ? [{ whatsappNumber: { contains: digits } }] : []),
                { client: { name: { contains: termo, mode: 'insensitive' as const } } },
              ],
            }
          : undefined,
        include: { client: { select: { name: true } } },
        orderBy: { lastMessage: { sort: 'desc', nulls: 'last' } },
        take: 15,
      })
      if (contacts.length === 0) return 'Nenhum contato encontrado.'
      return contacts
        .map(
          (c) =>
            `- ${c.name ?? 'sem nome'} | numero: ${c.whatsappNumber}${c.client ? ` | cliente: ${c.client.name}` : ''}`,
        )
        .join('\n')
    }

    case 'enviar_mensagem': {
      const numero = requireNumber(input.numero)
      const texto = requireText(input.texto, 'texto')
      const contact = await findContactByNumber(numero)
      const quem = contact?.name ? `${contact.name} (${numero})` : numero
      return createPendingAction(
        ctx,
        'enviar_mensagem',
        { numero, texto },
        `Enviar agora para ${quem}: "${texto}"`,
      )
    }

    case 'agendar_mensagem': {
      const numero = requireNumber(input.numero)
      const texto = requireText(input.texto, 'texto')
      const quando = parseWhen(input.quando, 'quando')
      if (quando.getTime() <= Date.now()) {
        throw new ToolError(
          'A data do agendamento precisa ser no futuro. Confira o horário informado.',
        )
      }
      const contact = await findContactByNumber(numero)
      const quem = contact?.name ? `${contact.name} (${numero})` : numero
      return createPendingAction(
        ctx,
        'agendar_mensagem',
        { numero, texto, quando: quando.toISOString() },
        `Agendar para ${quem} em ${formatBr(quando)}: "${texto}"`,
      )
    }

    case 'confirmar_acao': {
      const id = requireText(input.id, 'id', 60)
      const action = await prisma.aiPendingAction.findUnique({ where: { id } })
      if (!action) throw new ToolError('Ação não encontrada.')
      if (action.commandChat !== ctx.commandChat) {
        throw new ToolError('Ação não pertence a esta conversa.')
      }
      if (action.status !== 'AGUARDANDO') {
        throw new ToolError(`Esta ação já está como ${action.status}.`)
      }
      if (action.expiresAt.getTime() < Date.now()) {
        await prisma.aiPendingAction.update({
          where: { id },
          data: { status: 'EXPIRADA', resolvedAt: new Date() },
        })
        throw new ToolError('Ação expirou (limite de 1 hora). Refaça o pedido.')
      }

      let result: string
      try {
        result = await executePendingPayload(
          action.toolName,
          JSON.parse(action.payload) as Input,
          ctx,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await prisma.aiPendingAction.update({
          where: { id },
          data: { status: 'FALHOU', resultInfo: msg, resolvedAt: new Date() },
        })
        throw new ToolError(`Falha ao executar: ${msg}`)
      }

      await prisma.aiPendingAction.update({
        where: { id },
        data: { status: 'CONFIRMADA', resultInfo: result, resolvedAt: new Date() },
      })
      return result
    }

    case 'cancelar_acao': {
      const id = requireText(input.id, 'id', 60)
      const action = await prisma.aiPendingAction.findUnique({ where: { id } })
      if (!action || action.commandChat !== ctx.commandChat) {
        throw new ToolError('Ação não encontrada.')
      }
      if (action.status !== 'AGUARDANDO') {
        throw new ToolError(`Esta ação já está como ${action.status}.`)
      }
      await prisma.aiPendingAction.update({
        where: { id },
        data: { status: 'CANCELADA', resolvedAt: new Date() },
      })
      return 'Ação cancelada. Nada foi enviado.'
    }

    case 'listar_agendamentos': {
      const list = await prisma.scheduledMessage.findMany({
        where: { status: 'PENDENTE' },
        orderBy: { scheduledFor: 'asc' },
        take: 20,
        include: { contact: { select: { name: true } } },
      })
      if (list.length === 0) return 'Nenhuma mensagem agendada.'
      return list
        .map(
          (m) =>
            `- id: ${m.id} | ${formatBr(m.scheduledFor)} | para ${m.contact?.name ?? m.whatsappNumber} | "${m.content}"`,
        )
        .join('\n')
    }

    case 'cancelar_agendamento': {
      const id = requireText(input.id, 'id', 60)
      const sched = await prisma.scheduledMessage.findUnique({ where: { id } })
      if (!sched) throw new ToolError('Agendamento não encontrado.')
      if (sched.status !== 'PENDENTE') {
        throw new ToolError(`Este agendamento já está como ${sched.status}.`)
      }
      await prisma.scheduledMessage.update({ where: { id }, data: { status: 'CANCELADA' } })
      return `Agendamento cancelado (era ${formatBr(sched.scheduledFor)} para ${sched.whatsappNumber}).`
    }

    case 'criar_atividade': {
      const numero = requireNumber(input.numero)
      const titulo = requireText(input.titulo, 'titulo', 200)
      const data = parseWhen(input.data, 'data')
      const tipo =
        typeof input.tipo === 'string' && ACTIVITY_TYPES.includes(input.tipo)
          ? input.tipo
          : 'FOLLOWUP'
      const notas =
        typeof input.notas === 'string' && input.notas.trim() ? input.notas.trim() : null

      const contact = await findContactByNumber(numero)
      if (!contact) {
        throw new ToolError(
          `Nenhum contato do CRM com o número ${numero}. Use buscar_contatos para achar o número certo.`,
        )
      }

      const activity = await prisma.crmActivity.create({
        data: {
          contactId: contact.id,
          type: tipo,
          title: titulo,
          notes: notas,
          dueDate: data,
          assigneeId: ctx.userId,
          createdById: ctx.userId,
          createdByAi: true,
        },
      })
      return `Atividade "${titulo}" criada para ${contact.name ?? numero} em ${formatBr(data)} (id: ${activity.id}).`
    }

    case 'listar_atividades': {
      const list = await prisma.crmActivity.findMany({
        where: { status: 'PENDENTE' },
        orderBy: { dueDate: 'asc' },
        take: 20,
        include: { contact: { select: { name: true, whatsappNumber: true } } },
      })
      if (list.length === 0) return 'Nenhuma atividade pendente.'
      return list
        .map(
          (a) =>
            `- id: ${a.id} | ${formatBr(a.dueDate)} | ${a.type} | ${a.title} | contato: ${a.contact.name ?? a.contact.whatsappNumber}`,
        )
        .join('\n')
    }

    case 'concluir_atividade': {
      const id = requireText(input.id, 'id', 60)
      const activity = await prisma.crmActivity.findUnique({ where: { id } })
      if (!activity) throw new ToolError('Atividade não encontrada.')
      await prisma.crmActivity.update({
        where: { id },
        data: { status: 'CONCLUIDA', completedAt: new Date() },
      })
      return `Atividade "${activity.title}" marcada como concluída.`
    }

    default:
      throw new ToolError(`Ferramenta desconhecida: ${name}`)
  }
}
