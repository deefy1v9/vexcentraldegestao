import type Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../prisma'
import { deliverMessage, findContactByNumber } from '../crm-delivery'
import { formatBr, normalizeNumber } from './config'
import { parseDueDay } from './media'
import { defaultAssignments, logTaskEvent, maybeImmediateReminder, taskShortId } from '../task-flow'
import { tierPriority } from '../client-tier'
import { isConfigured as uazConfigured, uazSendText } from '../uazapi'
import { getMonthSummary } from '../finance-summary'
import { CLIENT_LINK_SELECT, clientLinks } from '../client-links'

export interface ToolContext {
  /** Número do chat de comando que está falando com a IA. */
  commandChat: string
  /** Usuário do sistema correspondente ao número, quando existir. */
  userId: string | null
}

/** Erro previsto de ferramenta: vira tool_result com is_error, não derruba o loop. */
export class ToolError extends Error {}

const ACTIVITY_TYPES = ['LIGACAO', 'FOLLOWUP', 'REUNIAO', 'PROPOSTA', 'OUTRO']
const TASK_TYPES = ['post', 'carrossel', 'reels', 'story', 'vídeo', 'artigo', 'site', 'anúncio', 'outro']
const TASK_PRIORITIES = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']
const dayBr = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Competência pedida pela IA ("2026-09") ou o mês corrente em São Paulo. */
function competenceOf(value: unknown): { year: number; month: number } {
  const s = typeof value === 'string' ? value.trim() : ''
  const m = s.match(/^(\d{4})-(\d{2})$/)
  if (m) {
    const year = Number(m[1]); const month = Number(m[2])
    if (month >= 1 && month <= 12) return { year, month }
    throw new ToolError('competencia inválida: use AAAA-MM, por exemplo 2026-09')
  }
  if (s) throw new ToolError('competencia inválida: use AAAA-MM, por exemplo 2026-09')
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return { year: Number(hoje.slice(0, 4)), month: Number(hoje.slice(5, 7)) }
}

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
    name: 'buscar_clientes',
    description:
      'Busca clientes da agência pelo nome (parte do nome basta). Use antes de criar uma demanda quando o usuário citar o cliente, para obter o id certo.',
    input_schema: {
      type: 'object',
      properties: { termo: { type: 'string', description: 'Parte do nome do cliente. Vazio lista os ativos.' } },
    },
  },
  {
    name: 'perfil_cliente',
    description:
      'Ficha completa de um cliente: contrato, serviços contratados, situação financeira do mês, grupo e links dos perfis. Use depois de buscar_clientes.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'id do cliente (de buscar_clientes).' },
        competencia: { type: 'string', description: 'Mês da situação financeira no formato AAAA-MM. Vazio usa o mês atual.' },
      },
      required: ['clienteId'],
    },
  },
  {
    name: 'resumo_financeiro',
    description:
      'Números do mês: receita prevista, recebida, pendente, atrasada, custos, salários e resultado. Use para "como está o mês", "quanto entrou", "quanto falta receber".',
    input_schema: {
      type: 'object',
      properties: { competencia: { type: 'string', description: 'AAAA-MM. Vazio usa o mês atual.' } },
    },
  },
  {
    name: 'listar_recebiveis',
    description:
      'Contas a receber do mês, por cliente. Filtra por situação para responder "quem está devendo", "quem está atrasado", "o que vence essa semana".',
    input_schema: {
      type: 'object',
      properties: {
        competencia: { type: 'string', description: 'AAAA-MM. Vazio usa o mês atual.' },
        situacao: { type: 'string', enum: ['todas', 'pendentes', 'atrasadas', 'pagas'], description: 'Padrão: todas.' },
        clienteId: { type: 'string', description: 'Limita a um cliente (de buscar_clientes).' },
      },
    },
  },
  {
    name: 'registrar_pagamento',
    description:
      'Prepara a baixa de um pagamento recebido. NÃO dá baixa na hora: cria uma ação pendente que só é executada após o usuário confirmar. Mostre cliente, competência e valor antes de confirmar.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'id do cliente (de buscar_clientes).' },
        competencia: { type: 'string', description: 'AAAA-MM da parcela. Vazio usa o mês atual.' },
        conta: { type: 'string', description: 'Conta em que o dinheiro entrou, quando o usuário informar.' },
      },
      required: ['clienteId'],
    },
  },
  {
    name: 'buscar_equipe',
    description:
      'Lista as pessoas da equipe (colaboradores e administradores) com id, para atribuir demandas. Use quando o usuário disser para quem a demanda vai.',
    input_schema: {
      type: 'object',
      properties: { termo: { type: 'string', description: 'Parte do nome. Vazio lista todos os ativos.' } },
    },
  },
  {
    name: 'criar_demanda',
    description:
      'Prepara a criação de uma demanda (tarefa de produção) para alguém da equipe. NÃO cria na hora: registra uma ação pendente que só é executada depois que o usuário confirmar. Depois de chamar, mostre título, responsável, cliente, prazo e tipo, e pergunte se pode criar.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título curto e claro da demanda. Ex: "Carrossel · lavagem de couro"' },
        responsavelId: { type: 'string', description: 'id da pessoa que vai produzir (de buscar_equipe).' },
        clienteId: { type: 'string', description: 'id do cliente (de buscar_clientes). Omita se não houver cliente.' },
        prazo: { type: 'string', description: 'Data final no formato YYYY-MM-DD. Converta "amanhã", "sexta" etc. pela data atual do contexto.' },
        tipo: { type: 'string', enum: TASK_TYPES, description: 'Tipo do conteúdo.' },
        plataforma: { type: 'string', description: 'Instagram, LinkedIn, Facebook, Site... Omita se não souber.' },
        descricao: { type: 'string', description: 'Briefing: o que precisa ser feito, referências, observações do usuário.' },
        prioridade: { type: 'string', enum: TASK_PRIORITIES, description: 'Só informe se o usuário indicar urgência.' },
      },
      required: ['titulo', 'responsavelId', 'prazo'],
    },
  },
  {
    name: 'listar_demandas',
    description:
      'Lista demandas abertas (não concluídas), das mais urgentes para as mais distantes. Filtra por pessoa ou cliente quando informado.',
    input_schema: {
      type: 'object',
      properties: {
        responsavelId: { type: 'string', description: 'id da pessoa (de buscar_equipe).' },
        clienteId: { type: 'string', description: 'id do cliente (de buscar_clientes).' },
      },
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

  if (toolName === 'criar_demanda') {
    return createTaskFromPayload(payload, ctx)
  }

  if (toolName === 'registrar_pagamento') {
    return settlePaymentFromPayload(payload)
  }

  throw new ToolError(`Ação "${toolName}" não pode ser executada`)
}

/** Dá baixa nas parcelas pendentes do cliente na competência. Histórico pago nunca é reescrito. */
async function settlePaymentFromPayload(payload: Input): Promise<string> {
  const clienteId = requireText(payload.clienteId, 'clienteId', 60)
  const { year, month } = competenceOf(payload.competencia)
  const conta = typeof payload.conta === 'string' && payload.conta.trim() ? payload.conta.trim().slice(0, 80) : null
  const client = await prisma.client.findUnique({ where: { id: clienteId }, select: { name: true } })
  if (!client) throw new ToolError('Cliente não encontrado.')
  const pendentes = await prisma.clientPayment.findMany({
    where: { clientId: clienteId, year, month, status: 'PENDENTE' },
    select: { id: true, amount: true },
  })
  if (pendentes.length === 0) throw new ToolError(`Nenhuma parcela pendente de ${client.name} em ${MESES[month - 1]}/${year}.`)
  const total = pendentes.reduce((s, p) => s + p.amount, 0)
  const agora = new Date()
  await prisma.clientPayment.updateMany({
    where: { id: { in: pendentes.map((p) => p.id) } },
    data: { status: 'PAGO', paidAt: agora, ...(conta ? { receivedAccount: conta } : {}) },
  })
  return `Pagamento de ${reais(total)} de ${client.name} registrado em ${MESES[month - 1]}/${year}${conta ? ` (conta ${conta})` : ''}. ${pendentes.length} parcela(s) quitada(s).`
}

/** Cria a demanda de fato: mesmas regras do formulário (papéis, prioridade herdada, lembrete, aviso). */
async function createTaskFromPayload(payload: Input, ctx: ToolContext): Promise<string> {
  const titulo = requireText(payload.titulo, 'titulo', 200)
  const responsavelId = requireText(payload.responsavelId, 'responsavelId', 60)
  const prazo = parseDueDay(payload.prazo)
  if (!prazo) throw new ToolError('prazo precisa estar no formato YYYY-MM-DD')
  const responsavel = await prisma.user.findFirst({ where: { id: responsavelId, isActive: true }, select: { id: true, name: true, phone: true } })
  if (!responsavel) throw new ToolError('Responsável não encontrado. Use buscar_equipe.')
  const clienteId = typeof payload.clienteId === 'string' && payload.clienteId ? payload.clienteId : null
  const cliente = clienteId ? await prisma.client.findUnique({ where: { id: clienteId }, select: { id: true, name: true, tier: true } }) : null
  if (clienteId && !cliente) throw new ToolError('Cliente não encontrado. Use buscar_clientes.')

  const defaults = await defaultAssignments()
  // Quem pediu pelo WhatsApp revisa, se for da equipe; senão o revisor padrão
  const reviewerId = ctx.userId ?? defaults.reviewerId
  const creatorId = ctx.userId ?? defaults.reviewerId ?? responsavel.id
  const prioridade = typeof payload.prioridade === 'string' && TASK_PRIORITIES.includes(payload.prioridade)
    ? payload.prioridade : tierPriority(cliente?.tier)
  const tipo = typeof payload.tipo === 'string' && payload.tipo ? payload.tipo : null
  const plataforma = typeof payload.plataforma === 'string' && payload.plataforma ? payload.plataforma : null
  const descricao = typeof payload.descricao === 'string' && payload.descricao.trim() ? payload.descricao.trim() : null
  const curto = cliente ? cliente.name.split(' /')[0] : ''
  const title = cliente && !titulo.toLowerCase().startsWith(curto.split(' ')[0].toLowerCase()) ? `${curto} · ${titulo}` : titulo

  const task = await prisma.task.create({
    data: {
      title, description: descricao, status: 'TODO', priority: prioridade as 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE',
      dueDate: prazo, scheduledFor: prazo, clientId: cliente?.id ?? null,
      assigneeId: responsavel.id, producerId: responsavel.id, schedulerId: responsavel.id, reviewerId,
      creatorId, platform: plataforma, contentType: tipo, tags: ['WhatsApp'],
    },
  })
  await logTaskEvent(task.id, 'CRIACAO', 'Demanda criada pelo assistente no WhatsApp', ctx.userId)
  maybeImmediateReminder(task.id).catch(() => {})
  if (responsavel.phone && (await uazConfigured().catch(() => false))) {
    const linhas = [
      `📋 *Nova demanda atribuída a você* ${taskShortId(task.number)}`, '', `*${task.title}*`, descricao,
      '', `• Prazo: ${dayBr(prazo)}`, cliente ? `• Cliente: ${cliente.name}` : null, tipo ? `• Tipo: ${tipo}` : null,
    ].filter((l): l is string => l !== null)
    uazSendText(responsavel.phone, linhas.join('\n')).catch(() => {})
  }
  return `Demanda ${taskShortId(task.number)} "${task.title}" criada para ${responsavel.name}, prazo ${dayBr(prazo)}.`
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

    case 'buscar_clientes': {
      const termo = typeof input.termo === 'string' ? input.termo.trim() : ''
      const list = await prisma.client.findMany({
        where: { status: 'ATIVO', ...(termo ? { OR: [{ name: { contains: termo, mode: 'insensitive' as const } }, { legalName: { contains: termo, mode: 'insensitive' as const } }] } : {}) },
        select: { id: true, name: true, tier: true },
        orderBy: { name: 'asc' },
        take: 20,
      })
      if (list.length === 0) return 'Nenhum cliente encontrado.'
      return list.map((c) => `- ${c.name} | id: ${c.id}${c.tier ? ` | grupo ${c.tier}` : ''}`).join('\n')
    }

    case 'perfil_cliente': {
      const id = requireText(input.clienteId, 'clienteId', 60)
      const { year, month } = competenceOf(input.competencia)
      const c = await prisma.client.findUnique({
        where: { id },
        select: {
          id: true, name: true, legalName: true, cnpj: true, status: true, tier: true, niche: true,
          paymentDay: true, contractStart: true, contractEnd: true, monthlyValue: true, notes: true,
          ...CLIENT_LINK_SELECT,
          services: { select: { serviceName: true, contractType: true, priceCents: true, status: true, startDate: true, endDate: true } },
        },
      })
      if (!c) throw new ToolError('Cliente não encontrado. Use buscar_clientes.')
      const pagamentos = await prisma.clientPayment.findMany({
        where: { clientId: id, year, month, status: { not: 'CANCELADO' } },
        select: { amount: true, status: true, dueDate: true },
      })
      const soma = (f: (p: (typeof pagamentos)[number]) => boolean) => pagamentos.filter(f).reduce((s, p) => s + p.amount, 0)
      const hoje = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T00:00:00Z`)
      const ativos = c.services.filter((s) => s.status === 'ATIVO')
      const linhas = [
        `${c.name}${c.legalName ? ` (${c.legalName})` : ''} · ${c.status} · grupo ${c.tier ?? 'não classificado'}`,
        c.cnpj ? `CNPJ ${c.cnpj}` : null,
        c.niche ? `Segmento: ${c.niche}` : null,
        `Contrato: início ${c.contractStart ? dayBr(c.contractStart) : '—'}${c.contractEnd ? `, fim ${dayBr(c.contractEnd)}` : ''} · vencimento dia ${c.paymentDay ?? '—'}`,
        `Ticket recorrente no cadastro: ${reais(c.monthlyValue ?? 0)}`,
        '',
        `Serviços ativos (${ativos.length}):`,
        ...ativos.map((s) => `  - ${s.serviceName} · ${s.contractType} · ${brl(s.priceCents ?? 0)}${s.endDate ? ` · até ${dayBr(s.endDate)}` : ''}`),
        '',
        `Financeiro de ${MESES[month - 1]}/${year}: previsto ${reais(soma(() => true))} · recebido ${reais(soma((p) => p.status === 'PAGO'))} · em aberto ${reais(soma((p) => p.status === 'PENDENTE'))} · atrasado ${reais(soma((p) => p.status === 'PENDENTE' && p.dueDate < hoje))}`,
      ]
      const links = clientLinks(c)
      if (links.length > 0) linhas.push('', `Perfis: ${links.map((l) => `${l.label} ${l.url}`).join(' · ')}`)
      if (c.notes) linhas.push('', `Observações: ${c.notes.slice(0, 800)}`)
      return linhas.filter((l) => l !== null).join('\n')
    }

    case 'resumo_financeiro': {
      const { year, month } = competenceOf(input.competencia)
      const s = await getMonthSummary(year, month)
      return [
        `Financeiro de ${MESES[month - 1]}/${year}`,
        `Receita prevista: ${brl(s.previstaCents)} (recorrente ${brl(s.previstaRecorrenteCents)} + avulsa ${brl(s.previstaAvulsaCents)})`,
        `Recebido: ${brl(s.recebidaCents)}`,
        `Em aberto: ${brl(s.pendenteCents)} · Atrasado: ${brl(s.atrasadaCents)}`,
        `Custos: ${brl(s.custosPagosCents)} pagos de ${brl(s.custosPrevistosCents)} previstos`,
        `Salários: ${brl(s.salariosPagosCents)} pagos de ${brl(s.salariosPrevistosCents)} previstos`,
        `Resultado previsto: ${brl(s.resultadoPrevistoCents)} · Lucro realizado: ${brl(s.lucroRealizadoCents)}`,
        `MRR ${brl(s.mrrCents)} · ${s.activeClients} clientes ativos`,
      ].join('\n')
    }

    case 'listar_recebiveis': {
      const { year, month } = competenceOf(input.competencia)
      const situacao = typeof input.situacao === 'string' ? input.situacao : 'todas'
      const clienteId = typeof input.clienteId === 'string' && input.clienteId ? input.clienteId : null
      const pagamentos = await prisma.clientPayment.findMany({
        where: { year, month, status: { not: 'CANCELADO' }, ...(clienteId ? { clientId: clienteId } : {}) },
        select: { amount: true, status: true, dueDate: true, client: { select: { name: true, id: true } }, service: { select: { serviceName: true } } },
        orderBy: [{ dueDate: 'asc' }],
      })
      const hoje = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T00:00:00Z`)
      const filtrados = pagamentos.filter((p) => {
        if (situacao === 'pagas') return p.status === 'PAGO'
        if (situacao === 'pendentes') return p.status === 'PENDENTE'
        if (situacao === 'atrasadas') return p.status === 'PENDENTE' && p.dueDate < hoje
        return true
      })
      if (filtrados.length === 0) return `Nada em ${MESES[month - 1]}/${year} com esse filtro.`
      // Agrupa por cliente: a resposta no WhatsApp precisa caber na tela
      const porCliente = new Map<string, { nome: string; id: string; total: number; pago: number; aberto: number; atrasado: number; venc: Date }>()
      for (const p of filtrados) {
        const k = p.client.id
        const cur = porCliente.get(k) ?? { nome: p.client.name, id: k, total: 0, pago: 0, aberto: 0, atrasado: 0, venc: p.dueDate }
        cur.total += p.amount
        if (p.status === 'PAGO') cur.pago += p.amount
        else { cur.aberto += p.amount; if (p.dueDate < hoje) cur.atrasado += p.amount }
        if (p.dueDate < cur.venc) cur.venc = p.dueDate
        porCliente.set(k, cur)
      }
      const linhas = [...porCliente.values()]
        .sort((a, b) => b.atrasado - a.atrasado || a.venc.getTime() - b.venc.getTime())
        .map((c) => {
          const marca = c.atrasado > 0 ? 'ATRASADO' : c.aberto > 0 ? 'em aberto' : 'pago'
          return `- ${c.nome} | ${reais(c.total)} | vence ${dayBr(c.venc)} | ${marca}${c.aberto > 0 && c.pago > 0 ? ` (pago ${reais(c.pago)}, falta ${reais(c.aberto)})` : ''} | id: ${c.id}`
        })
      const totalAberto = [...porCliente.values()].reduce((s, c) => s + c.aberto, 0)
      const totalAtraso = [...porCliente.values()].reduce((s, c) => s + c.atrasado, 0)
      return [`${MESES[month - 1]}/${year} · ${porCliente.size} cliente(s)`, ...linhas, '', `Em aberto: ${reais(totalAberto)} · Atrasado: ${reais(totalAtraso)}`].join('\n')
    }

    case 'registrar_pagamento': {
      const clienteId = requireText(input.clienteId, 'clienteId', 60)
      const { year, month } = competenceOf(input.competencia)
      const client = await prisma.client.findUnique({ where: { id: clienteId }, select: { name: true } })
      if (!client) throw new ToolError('Cliente não encontrado. Use buscar_clientes.')
      const pendentes = await prisma.clientPayment.findMany({ where: { clientId: clienteId, year, month, status: 'PENDENTE' }, select: { amount: true } })
      if (pendentes.length === 0) throw new ToolError(`Nenhuma parcela pendente de ${client.name} em ${MESES[month - 1]}/${year}.`)
      const total = pendentes.reduce((s, p) => s + p.amount, 0)
      const conta = typeof input.conta === 'string' && input.conta.trim() ? input.conta.trim() : null
      return createPendingAction(
        ctx, 'registrar_pagamento',
        { clienteId, competencia: `${year}-${String(month).padStart(2, '0')}`, conta },
        `Dar baixa em ${reais(total)} de ${client.name} · ${MESES[month - 1]}/${year} · ${pendentes.length} parcela(s)${conta ? ` · conta ${conta}` : ''}`,
      )
    }

    case 'buscar_equipe': {
      const termo = typeof input.termo === 'string' ? input.termo.trim() : ''
      const list = await prisma.user.findMany({
        where: { isActive: true, ...(termo ? { name: { contains: termo, mode: 'insensitive' as const } } : {}) },
        select: { id: true, name: true, role: true },
        orderBy: { name: 'asc' },
        take: 20,
      })
      if (list.length === 0) return 'Ninguém encontrado na equipe.'
      return list.map((u) => `- ${u.name} | id: ${u.id} | ${u.role === 'ADMIN' ? 'administrador' : 'colaborador'}`).join('\n')
    }

    case 'criar_demanda': {
      const titulo = requireText(input.titulo, 'titulo', 200)
      const responsavelId = requireText(input.responsavelId, 'responsavelId', 60)
      const prazo = parseDueDay(input.prazo)
      if (!prazo) throw new ToolError('prazo precisa estar no formato YYYY-MM-DD')
      const responsavel = await prisma.user.findFirst({ where: { id: responsavelId, isActive: true }, select: { name: true } })
      if (!responsavel) throw new ToolError('Responsável não encontrado. Use buscar_equipe para achar o id.')
      const clienteId = typeof input.clienteId === 'string' && input.clienteId ? input.clienteId : null
      const cliente = clienteId ? await prisma.client.findUnique({ where: { id: clienteId }, select: { name: true } }) : null
      if (clienteId && !cliente) throw new ToolError('Cliente não encontrado. Use buscar_clientes para achar o id.')
      const payload: Input = {
        titulo, responsavelId, clienteId, prazo: prazo.toISOString().slice(0, 10),
        tipo: input.tipo, plataforma: input.plataforma, descricao: input.descricao, prioridade: input.prioridade,
      }
      const partes = [`Criar demanda "${titulo}" para ${responsavel.name}`, cliente ? `cliente ${cliente.name}` : 'sem cliente', `prazo ${dayBr(prazo)}`]
      if (typeof input.tipo === 'string' && input.tipo) partes.push(`tipo ${input.tipo}`)
      if (typeof input.prioridade === 'string' && input.prioridade) partes.push(`prioridade ${input.prioridade}`)
      return createPendingAction(ctx, 'criar_demanda', payload, partes.join(' · '))
    }

    case 'listar_demandas': {
      const responsavelId = typeof input.responsavelId === 'string' && input.responsavelId ? input.responsavelId : null
      const clienteId = typeof input.clienteId === 'string' && input.clienteId ? input.clienteId : null
      const list = await prisma.task.findMany({
        where: {
          status: { not: 'CONCLUIDO' },
          ...(responsavelId ? { OR: [{ assigneeId: responsavelId }, { producerId: responsavelId }] } : {}),
          ...(clienteId ? { clientId: clienteId } : {}),
        },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { number: 'asc' }],
        take: 25,
        include: { client: { select: { name: true } }, assignee: { select: { name: true } } },
      })
      if (list.length === 0) return 'Nenhuma demanda aberta com esse filtro.'
      return list.map((t) => `- ${taskShortId(t.number)} | ${t.dueDate ? dayBr(t.dueDate) : 'sem prazo'} | ${t.status} | ${t.title} | ${t.assignee?.name ?? 'sem responsável'}`).join('\n')
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
