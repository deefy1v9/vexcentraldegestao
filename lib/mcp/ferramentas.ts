import { z } from 'zod'
import { prisma } from '../prisma'
import { executeTool, ToolError } from '../ai/tools'
import { prazoAtual } from '../processos'
import { taskShortId } from '../task-flow'
import { ordenarPorRisco, riscoDeChurn, type NivelDeRisco } from './churn'

/**
 * As ferramentas do conector de IA, TODAS só de leitura. Oito vêm do
 * assistente do WhatsApp (mesmas contas da Central), chamadas por uma lista
 * fechada: as de escrita do assistente nunca chegam aqui. As outras quatro
 * são do conector: demandas por prazo, processos, contas a pagar e risco de
 * churn. Testado em scripts/tests/mcp-ferramentas.test.ts.
 */

export interface ContextoMcp { userId: string; conexaoId: string; appName: string; base: string; agora: Date }

export class FerramentaErro extends Error {}

export interface Ferramenta {
  nome: string
  titulo: string
  descricao: string
  entrada: z.ZodRawShape
  /** leitura (padrão) ou acoes: só aparece para conexão autorizada com ações */
  escopo?: 'leitura' | 'acoes'
  /** false = altera dados da Central (o assistente pede permissão antes) */
  somenteLeitura?: boolean
  executar(ctx: ContextoMcp, args: Record<string, unknown>): Promise<string>
}

/* ------------------------------ datas em Brasília ------------------------------ */

/** "2026-10-23" do instante em Brasília. */
export const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
/** Meia-noite de Brasília do dia "AAAA-MM-DD" (sem horário de verão). */
export const inicioDoDiaSP = (dia: string) => new Date(`${dia}T00:00:00-03:00`)
const dataBr = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export type SituacaoDoPrazo = 'atrasada' | 'hoje' | 'semana' | 'depois' | 'sem'

/** Onde o prazo cai, contado em dias de Brasília. */
export function situacaoDoPrazo(prazo: Date | null, agora: Date): SituacaoDoPrazo {
  if (!prazo) return 'sem'
  const hoje = diaSP(agora)
  const dia = diaSP(prazo)
  if (dia < hoje) return 'atrasada'
  if (dia === hoje) return 'hoje'
  const em7 = diaSP(new Date(inicioDoDiaSP(hoje).getTime() + 7 * 864e5))
  return dia < em7 ? 'semana' : 'depois'
}

/** Competência "AAAA-MM" ou o mês atual de Brasília. */
export function competencia(valor: unknown, agora: Date): { year: number; month: number } {
  const s = typeof valor === 'string' ? valor.trim() : ''
  const m = /^(\d{4})-(\d{2})$/.exec(s)
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]) }
  if (s) throw new FerramentaErro('competencia inválida: use AAAA-MM, por exemplo 2026-10')
  const hoje = diaSP(agora)
  return { year: Number(hoje.slice(0, 4)), month: Number(hoje.slice(5, 7)) }
}

/* ------------------------------ as do assistente (lista fechada) ------------------------------ */

const texto = (d: string) => z.string().optional().describe(d)
const competenciaCampo = texto('Mês no formato AAAA-MM. Vazio usa o mês atual.')

/** Só estas oito, todas de leitura. Escrita do assistente nunca entra aqui. */
export const LEITURA_DO_ASSISTENTE = [
  'buscar_clientes', 'perfil_cliente', 'resumo_financeiro', 'listar_recebiveis',
  'saldo_caixa', 'extrato_caixa', 'buscar_equipe', 'listar_demandas',
] as const

const DO_ASSISTENTE: Record<(typeof LEITURA_DO_ASSISTENTE)[number], Omit<Ferramenta, 'nome' | 'executar'>> = {
  buscar_clientes: {
    titulo: 'Buscar clientes', descricao: 'Clientes da agência pelo nome (parte basta). Vazio lista os ativos. Use para achar o id antes das outras consultas.',
    entrada: { termo: texto('Parte do nome do cliente.') },
  },
  perfil_cliente: {
    titulo: 'Perfil do cliente', descricao: 'Ficha do cliente: contrato, serviços contratados, situação financeira do mês, grupo e links. Use depois de buscar_clientes.',
    entrada: { clienteId: z.string().describe('id do cliente (de buscar_clientes).'), competencia: competenciaCampo },
  },
  resumo_financeiro: {
    titulo: 'Resumo financeiro do mês', descricao: 'Números do mês: receita prevista, recebida, pendente, atrasada, custos, salários e resultado.',
    entrada: { competencia: competenciaCampo },
  },
  listar_recebiveis: {
    titulo: 'Contas a receber', descricao: 'Contas a receber do mês por cliente: quem está devendo, quem atrasou, o que vence.',
    entrada: {
      competencia: competenciaCampo,
      situacao: z.enum(['todas', 'pendentes', 'atrasadas', 'pagas']).optional().describe('Padrão: todas.'),
      clienteId: texto('Limita a um cliente (de buscar_clientes).'),
    },
  },
  saldo_caixa: {
    titulo: 'Saldo do caixa', descricao: 'Saldo do caixa da empresa e os totais do mês: entradas, saídas e retiradas dos sócios.',
    entrada: { competencia: competenciaCampo },
  },
  extrato_caixa: {
    titulo: 'Extrato do caixa', descricao: 'Últimos lançamentos do caixa, do mais novo para o mais antigo.',
    entrada: { competencia: competenciaCampo, tipo: z.enum(['todos', 'ENTRADA', 'SAIDA', 'RETIRADA', 'APORTE']).optional().describe('Padrão: todos.') },
  },
  buscar_equipe: {
    titulo: 'Equipe', descricao: 'Pessoas da equipe com id, para filtrar demandas por pessoa.',
    entrada: { termo: texto('Parte do nome. Vazio lista todos os ativos.') },
  },
  listar_demandas: {
    titulo: 'Demandas abertas', descricao: 'Demandas não concluídas, das mais urgentes para as mais distantes, por pessoa ou cliente.',
    entrada: { responsavelId: texto('id da pessoa (de buscar_equipe).'), clienteId: texto('id do cliente (de buscar_clientes).') },
  },
}

const reaproveitadas: Ferramenta[] = LEITURA_DO_ASSISTENTE.map((nome) => ({
  nome,
  ...DO_ASSISTENTE[nome],
  async executar(ctx, args) {
    try {
      return await executeTool(nome, args, { commandChat: `mcp:${ctx.conexaoId}`, userId: ctx.userId })
    } catch (e) {
      if (e instanceof ToolError) throw new FerramentaErro(e.message)
      throw e
    }
  },
}))

/* ------------------------------ as do conector ------------------------------ */

const demandasPorPrazo: Ferramenta = {
  nome: 'demandas_por_prazo',
  titulo: 'Demandas por prazo',
  descricao: 'Demandas atrasadas, de hoje ou da semana, pelo prazo da etapa atual (o mesmo da tela Minhas tarefas). Filtra por cliente ou pessoa.',
  entrada: {
    situacao: z.enum(['atrasadas', 'hoje', 'semana']).optional().describe('Padrão: atrasadas.'),
    clienteId: texto('id do cliente (de buscar_clientes).'),
    responsavelId: texto('id da pessoa (de buscar_equipe).'),
  },
  async executar(ctx, args) {
    const situacao = (args.situacao as string) || 'atrasadas'
    const alvo = situacao === 'atrasadas' ? 'atrasada' : situacao
    const tasks = await prisma.task.findMany({
      where: {
        status: { not: 'CONCLUIDO' },
        ...(typeof args.clienteId === 'string' && args.clienteId ? { clientId: args.clienteId } : {}),
        ...(typeof args.responsavelId === 'string' && args.responsavelId ? { assigneeId: args.responsavelId } : {}),
      },
      include: { client: { select: { name: true } }, assignee: { select: { name: true } }, stage: true },
      take: 500,
    })
    const hoje0 = inicioDoDiaSP(diaSP(ctx.agora))
    const lista = tasks
      .map((t) => ({ t, prazo: prazoAtual(t.stage, t, ctx.agora, hoje0) }))
      .filter(({ prazo }) => situacaoDoPrazo(prazo, ctx.agora) === alvo)
      .sort((a, b) => (a.prazo?.getTime() ?? 0) - (b.prazo?.getTime() ?? 0))
      .slice(0, 50)
    if (lista.length === 0) return `Nenhuma demanda ${situacao === 'atrasadas' ? 'atrasada' : situacao === 'hoje' ? 'para hoje' : 'para esta semana'} com esse filtro.`
    return [
      `${lista.length} demanda(s) ${situacao === 'atrasadas' ? 'atrasada(s)' : situacao === 'hoje' ? 'para hoje' : 'nos próximos 7 dias'}:`,
      ...lista.map(({ t, prazo }) => `- ${taskShortId(t.number)} | prazo da etapa ${prazo ? dataBr(prazo) : '—'} | ${t.stage?.name ?? t.status} | ${t.title} | ${t.client?.name ?? 'sem cliente'} | ${t.assignee?.name ?? 'sem responsável'} | ${ctx.base}/demandas?t=${t.id}`),
    ].join('\n')
  },
}

const processosEmAndamento: Ferramenta = {
  nome: 'processos_em_andamento',
  titulo: 'Processos em andamento',
  descricao: 'Quantas demandas abertas há em cada etapa de cada processo, e quantas estão atrasadas.',
  entrada: {},
  async executar(ctx) {
    const tasks = await prisma.task.findMany({
      where: { status: { not: 'CONCLUIDO' }, processId: { not: null } },
      include: { process: { select: { name: true } }, stage: true },
    })
    const hoje0 = inicioDoDiaSP(diaSP(ctx.agora))
    const porProcesso = new Map<string, Map<string, { total: number; atrasadas: number; pos: number }>>()
    for (const t of tasks) {
      const p = t.process?.name ?? 'Sem processo'
      const e = t.stage?.name ?? t.status
      const etapas = porProcesso.get(p) ?? new Map()
      const c = etapas.get(e) ?? { total: 0, atrasadas: 0, pos: t.stage?.position ?? 99 }
      c.total++
      if (situacaoDoPrazo(prazoAtual(t.stage, t, ctx.agora, hoje0), ctx.agora) === 'atrasada') c.atrasadas++
      etapas.set(e, c)
      porProcesso.set(p, etapas)
    }
    if (porProcesso.size === 0) return 'Nenhuma demanda aberta em processo.'
    return [...porProcesso.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([p, etapas]) => {
      const linhas = [...etapas.entries()].sort((a, b) => a[1].pos - b[1].pos)
        .map(([e, c]) => `  - ${e}: ${c.total}${c.atrasadas ? ` (${c.atrasadas} atrasada(s))` : ''}`)
      return `${p}\n${linhas.join('\n')}`
    }).join('\n')
  },
}

const contasAPagar: Ferramenta = {
  nome: 'contas_a_pagar',
  titulo: 'Contas a pagar',
  descricao: 'Custos e salários ainda não pagos do mês (e os parcelados que vencem nele), com vencimento e valor.',
  entrada: { competencia: competenciaCampo },
  async executar(ctx, args) {
    const { year, month } = competencia(args.competencia, ctx.agora)
    const inicio = new Date(Date.UTC(year, month - 1, 1, 3))
    const fim = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1, 3))
    const es = await prisma.financialEntry.findMany({
      where: {
        type: { not: 'RECEITA' }, status: 'PENDENTE',
        OR: [{ year, month }, { month: null, dueDate: { gte: inicio, lt: fim } }],
      },
      orderBy: [{ dueDate: 'asc' }, { date: 'asc' }],
    })
    if (es.length === 0) return `Nada a pagar em ${String(month).padStart(2, '0')}/${year}.`
    const total = es.reduce((s, e) => s + e.amount, 0)
    return [
      `A pagar em ${String(month).padStart(2, '0')}/${year}: ${reais(total)}`,
      ...es.map((e) => `- ${dataBr(e.dueDate ?? e.date)} | ${reais(e.amount)} | ${e.category} | ${e.name ?? e.description}`),
    ].join('\n')
  },
}

const riscoDeChurnFerramenta: Ferramenta = {
  nome: 'risco_de_churn',
  titulo: 'Risco de churn',
  descricao: 'Risco de cada cliente ativo cancelar, com os motivos: pagamento atrasado, contrato acabando, serviço encerrado, demandas atrasadas, grupo rebaixado, sem entrega. Do maior risco para o menor.',
  entrada: {
    clienteId: texto('Só este cliente (de buscar_clientes).'),
    nivel: z.enum(['alto', 'medio', 'todos']).optional().describe('Padrão: todos. "medio" traz médio e alto.'),
  },
  async executar(ctx, args) {
    const clienteId = typeof args.clienteId === 'string' && args.clienteId ? args.clienteId : null
    const nivel = (args.nivel as string) || 'todos'
    const hoje0 = inicioDoDiaSP(diaSP(ctx.agora))
    const ha90 = new Date(ctx.agora.getTime() - 90 * 864e5)
    const clientes = await prisma.client.findMany({
      where: { status: 'ATIVO', ...(clienteId ? { id: clienteId } : {}) },
      select: {
        id: true, name: true, contractEnd: true,
        services: { select: { status: true, endedAt: true, serviceName: true, customName: true } },
        payments: { where: { status: { not: 'PAGO' }, dueDate: { lt: hoje0 } }, select: { amount: true, dueDate: true, status: true } },
        tierHistory: { where: { createdAt: { gte: ha90 } }, select: { fromTier: true, toTier: true } },
      },
    })
    const ids = clientes.map((c) => c.id)
    const abertas = await prisma.task.findMany({ where: { clientId: { in: ids }, status: { not: 'CONCLUIDO' } }, include: { stage: true } })
    const ultimas = await prisma.task.groupBy({ by: ['clientId'], where: { clientId: { in: ids }, status: 'CONCLUIDO' }, _max: { updatedAt: true } })
    const PESO: Record<string, number> = { SCALE: 3, GROWTH: 2, START: 1 }
    const resultado = clientes.map((c) => riscoDeChurn({
      id: c.id,
      nome: c.name,
      contractEnd: c.contractEnd,
      servicosAtivos: c.services.filter((s) => s.status === 'ATIVO' && !s.endedAt).length,
      servicosEncerradosRecentes: c.services.filter((s) => s.endedAt).map((s) => ({ nome: s.customName || s.serviceName, endedAt: s.endedAt! })),
      parcelasAtrasadas: c.payments.filter((p) => p.status !== 'CANCELADO').map((p) => ({ valor: p.amount, vencimento: p.dueDate })),
      demandasAtrasadas: abertas.filter((t) => t.clientId === c.id && situacaoDoPrazo(prazoAtual(t.stage, t, ctx.agora, hoje0), ctx.agora) === 'atrasada').length,
      ultimaEntrega: ultimas.find((u) => u.clientId === c.id)?._max.updatedAt ?? null,
      rebaixado: c.tierHistory.some((h) => (PESO[h.toTier ?? ''] ?? 0) < (PESO[h.fromTier ?? ''] ?? 0)),
    }, ctx.agora))
    const filtro: Record<string, NivelDeRisco[]> = { alto: ['alto'], medio: ['alto', 'medio'], todos: ['alto', 'medio', 'baixo'] }
    const lista = ordenarPorRisco(resultado).filter((r) => (filtro[nivel] ?? filtro.todos).includes(r.nivel))
    if (lista.length === 0) return clienteId ? 'Cliente não encontrado entre os ativos.' : 'Nenhum cliente nesse nível de risco.'
    const rotulo: Record<NivelDeRisco, string> = { alto: 'ALTO', medio: 'MÉDIO', baixo: 'baixo' }
    return lista.map((r) => `- ${r.nome} | risco ${rotulo[r.nivel]} (${r.pontos}) | ${r.motivos.length ? r.motivos.join('; ') : 'sem sinais de risco'} | ${ctx.base}/clientes/${r.id}`).join('\n')
  },
}

export const FERRAMENTAS_MCP: Ferramenta[] = [...reaproveitadas, demandasPorPrazo, processosEmAndamento, contasAPagar, riscoDeChurnFerramenta]
