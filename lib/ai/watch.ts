import { prisma } from '../prisma'
import { getMonthSummary } from '../finance-summary'
import { uazSendText, isConfigured } from '../uazapi'
import { getAiConfig } from './config'
import { runGeminiLoop } from './gemini'
import { TOOL_GROUPS } from './agents'
import {
  brDate, brl, cashHealth, contractAlert, daysBetween, formatAlerts, hasCritical, rankAlerts,
  shouldWatchToday, type Alert,
} from './watch-core'

/**
 * Agentes vigia: varrem a operação e avisam os donos. Nunca respondem cliente
 * e nunca inventam número — os dados vêm de consulta, e a IA só transforma a
 * lista de alertas em um recado curto. Sem IA configurada, manda a lista crua.
 */

const TZ = 'America/Sao_Paulo'
const spToday = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const spWeekday = () => new Date(`${spToday()}T12:00:00Z`).getUTCDay()

/** Donos que recebem os avisos: administradores ativos com telefone. */
async function owners(): Promise<Array<{ name: string; phone: string }>> {
  const rows = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true, phone: { not: null } },
    select: { name: true, phone: true },
  })
  return rows.filter((r): r is { name: string; phone: string } => !!r.phone)
}

/* ------------------------------ coleta ------------------------------ */

async function financeAlerts(today: string): Promise<{ alerts: Alert[]; resumo: string }> {
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
  const s = await getMonthSummary(year, month)
  const caixa = cashHealth(s)
  const alerts: Alert[] = []

  if (caixa.status === 'vermelho') {
    alerts.push({ severity: 'critico', title: `Mês no vermelho: falta ${brl(Math.abs(caixa.saldoCents))} para cobrir custos e salários`, detail: `previsto ${brl(s.previstaCents)}, despesas ${brl(s.custosPrevistosCents + s.salariosPrevistosCents)}` })
  } else if (caixa.status === 'apertado') {
    alerts.push({ severity: 'atencao', title: `Margem apertada: sobra ${brl(caixa.saldoCents)} (${Math.round(caixa.margem * 100)}% da receita)` })
  }

  const hoje = new Date(`${today}T00:00:00Z`)
  const atrasadas = await prisma.clientPayment.findMany({
    where: { status: 'PENDENTE', dueDate: { lt: hoje } },
    select: { amount: true, dueDate: true, client: { select: { name: true } } },
  })
  const porCliente = new Map<string, { valor: number; venc: Date }>()
  for (const p of atrasadas) {
    const cur = porCliente.get(p.client.name) ?? { valor: 0, venc: p.dueDate }
    cur.valor += p.amount
    if (p.dueDate < cur.venc) cur.venc = p.dueDate
    porCliente.set(p.client.name, cur)
  }
  for (const [nome, v] of [...porCliente].sort((a, b) => b[1].valor - a[1].valor)) {
    const dias = daysBetween(v.venc.toISOString().slice(0, 10), today)
    alerts.push({ severity: dias >= 7 ? 'critico' : 'atencao', title: `${nome}: ${brl(Math.round(v.valor * 100))} em atraso há ${dias} dia${dias === 1 ? '' : 's'}`, detail: `venceu ${brDate(v.venc.toISOString())}` })
  }

  const fim = new Date(`${today}T00:00:00Z`)
  fim.setUTCDate(fim.getUTCDate() + 7)
  const proximas = await prisma.clientPayment.findMany({
    where: { status: 'PENDENTE', dueDate: { gte: hoje, lte: fim } },
    select: { amount: true, dueDate: true, client: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  })
  if (proximas.length > 0) {
    const total = proximas.reduce((acc, p) => acc + p.amount, 0)
    alerts.push({ severity: 'informativo', title: `Vence nos próximos 7 dias: ${brl(Math.round(total * 100))} em ${proximas.length} parcela(s)`, detail: proximas.slice(0, 4).map((p) => `${p.client.name} ${brDate(p.dueDate.toISOString())}`).join(', ') })
  }

  const resumo = [
    `Competência ${String(month).padStart(2, '0')}/${year}`,
    `Previsto ${brl(s.previstaCents)} · recebido ${brl(s.recebidaCents)} · em aberto ${brl(s.pendenteCents)} · atrasado ${brl(s.atrasadaCents)}`,
    `Custos previstos ${brl(s.custosPrevistosCents)} · salários ${brl(s.salariosPrevistosCents)}`,
    `Resultado previsto ${brl(s.resultadoPrevistoCents)} · lucro realizado ${brl(s.lucroRealizadoCents)} · caixa ${caixa.status}`,
    `MRR ${brl(s.mrrCents)} · ${s.activeClients} clientes ativos`,
  ].join('\n')
  return { alerts, resumo }
}

async function clientAlerts(today: string): Promise<{ alerts: Alert[]; resumo: string }> {
  const alerts: Alert[] = []
  const clientes = await prisma.client.findMany({
    where: { status: 'ATIVO' },
    select: {
      id: true, name: true, contractEnd: true,
      tasks: { where: { status: { not: 'CONCLUIDO' } }, select: { id: true, dueDate: true, title: true } },
      crmContact: { select: { conversations: { select: { id: true }, take: 1 } } },
    },
  })

  for (const c of clientes) {
    if (c.contractEnd) {
      const a = contractAlert(c.name, c.contractEnd.toISOString().slice(0, 10), today)
      if (a) alerts.push(a)
    }
    const atrasadas = c.tasks.filter((t) => t.dueDate && t.dueDate.toISOString().slice(0, 10) < today)
    if (atrasadas.length > 0) {
      alerts.push({ severity: atrasadas.length >= 3 ? 'critico' : 'atencao', title: `${c.name}: ${atrasadas.length} demanda(s) atrasada(s)`, detail: atrasadas.slice(0, 3).map((t) => t.title.replace(/^[^·]+· /, '')).join('; ') })
    }
    if (c.tasks.length === 0) {
      alerts.push({ severity: 'atencao', title: `${c.name}: nenhuma demanda aberta`, detail: 'cliente ativo sem entrega programada' })
    }
  }

  // Mensagem de cliente sem resposta há mais de 12 horas
  const limite = new Date(Date.now() - 12 * 60 * 60 * 1000)
  const conversas = await prisma.crmConversation.findMany({
    where: { status: 'ABERTO', messages: { some: { fromClient: true, sentAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } } },
    select: {
      id: true,
      contact: { select: { name: true, whatsappNumber: true, client: { select: { name: true } } } },
      messages: { orderBy: { sentAt: 'desc' }, take: 1, select: { fromClient: true, sentAt: true, content: true } },
    },
  })
  for (const conv of conversas) {
    const ultima = conv.messages[0]
    if (!ultima?.fromClient || ultima.sentAt > limite) continue
    const horas = Math.floor((Date.now() - ultima.sentAt.getTime()) / 3_600_000)
    const quem = conv.contact.client?.name ?? conv.contact.name ?? conv.contact.whatsappNumber
    alerts.push({ severity: horas >= 24 ? 'critico' : 'atencao', title: `${quem}: mensagem sem resposta há ${horas}h`, detail: ultima.content.slice(0, 90) })
  }

  const resumo = `${clientes.length} clientes ativos · ${clientes.reduce((s, c) => s + c.tasks.length, 0)} demandas abertas na carteira`
  return { alerts, resumo }
}

async function opsAlerts(today: string): Promise<{ alerts: Alert[]; resumo: string }> {
  const alerts: Alert[] = []
  const abertas = await prisma.task.findMany({
    where: { status: { not: 'CONCLUIDO' }, dueDate: { not: null } },
    select: { number: true, title: true, dueDate: true, status: true, assignee: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  })
  const atrasadas = abertas.filter((t) => t.dueDate!.toISOString().slice(0, 10) < today)
  const hoje = abertas.filter((t) => t.dueDate!.toISOString().slice(0, 10) === today)

  const porPessoa = new Map<string, number>()
  for (const t of atrasadas) porPessoa.set(t.assignee?.name ?? 'sem responsável', (porPessoa.get(t.assignee?.name ?? 'sem responsável') ?? 0) + 1)
  for (const [quem, n] of [...porPessoa].sort((a, b) => b[1] - a[1])) {
    alerts.push({ severity: n >= 3 ? 'critico' : 'atencao', title: `${quem}: ${n} demanda(s) atrasada(s)` })
  }
  if (hoje.length > 0) {
    alerts.push({ severity: 'informativo', title: `${hoje.length} demanda(s) para hoje`, detail: hoje.slice(0, 4).map((t) => `#${t.number} ${t.title.replace(/^[^·]+· /, '')}`).join('; ') })
  }
  const emRevisao = abertas.filter((t) => t.status === 'EM_REVISAO')
  if (emRevisao.length > 0) {
    alerts.push({ severity: 'atencao', title: `${emRevisao.length} demanda(s) paradas em revisão`, detail: emRevisao.slice(0, 4).map((t) => `#${t.number}`).join(', ') })
  }
  const semResponsavel = abertas.filter((t) => !t.assignee)
  if (semResponsavel.length > 0) {
    alerts.push({ severity: 'atencao', title: `${semResponsavel.length} demanda(s) sem responsável` })
  }

  return { alerts, resumo: `${abertas.length} demandas abertas · ${atrasadas.length} atrasadas · ${hoje.length} para hoje` }
}

/* ------------------------------ redação ------------------------------ */

const REDACAO = `Você é um agente de vigia da VEX Growth, uma agência de marketing. Você NÃO fala com clientes: escreve um aviso curto para os dois sócios lerem no WhatsApp.

Regras:
- Use somente os dados do relatório. Nunca invente número, nome ou data.
- Comece pelo que é urgente. Se não há nada urgente, diga isso em uma linha.
- Português do Brasil, direto, no máximo 12 linhas. Use *negrito* do WhatsApp só no que importa.
- Sem saudação, sem assinatura, sem markdown de título.
- Termine com uma frase dizendo o que fazer primeiro.`

async function redigir(agentName: string, instrucoes: string | null, relatorio: string): Promise<string | null> {
  const cfg = await getAiConfig().catch(() => null)
  if (!cfg?.enabled) return null
  const chave = cfg.provider === 'gemini' ? cfg.geminiApiKey : ''
  if (!chave) return null
  const system = [REDACAO, instrucoes ? `\nInstruções de quem configurou o agente:\n${instrucoes}` : ''].join('')
  return runGeminiLoop({
    apiKey: chave,
    model: cfg.agentModel,
    system,
    history: [],
    userText: `Agente: ${agentName}\n\n${relatorio}`,
    tools: [],
    maxTurns: 1,
    execute: async () => ({ output: '', isError: true }),
  }).catch((err) => {
    console.error('[watch] redação falhou', err instanceof Error ? err.message : err)
    return ''
  }).then((t) => t.trim() || null)
}

/* ------------------------------ execução ------------------------------ */

export interface WatchReport { rodou: number; avisos: number; pulados: number }

export interface WatchAgent { id: string; name: string; instructions: string | null; toolGroups: string[] }

/**
 * Monta (e opcionalmente envia) o aviso de um agente. Com `enviar: false`
 * devolve o texto sem tocar no WhatsApp e sem marcar a data — é a prévia da
 * tela, que pode ser vista quantas vezes for preciso.
 */
export async function runSingleWatch(
  agent: WatchAgent,
  opts: { enviar: boolean },
): Promise<{ texto: string; alertas: number; criticos: boolean; enviadoPara: string[] }> {
  const today = spToday()
  const partes: string[] = []
  const alerts: Alert[] = []

  if (agent.toolGroups.includes('financeiro')) {
    const f = await financeAlerts(today)
    partes.push(`FINANCEIRO\n${f.resumo}`)
    alerts.push(...f.alerts)
  }
  if (agent.toolGroups.includes('clientes')) {
    const c = await clientAlerts(today)
    partes.push(`CLIENTES\n${c.resumo}`)
    alerts.push(...c.alerts)
  }
  if (agent.toolGroups.includes('demandas') || agent.toolGroups.includes('crm')) {
    const o = await opsAlerts(today)
    partes.push(`OPERAÇÃO\n${o.resumo}`)
    alerts.push(...o.alerts)
  }

  const principais = rankAlerts(alerts)
  const relatorio = [
    `Data: ${brDate(today)}`,
    ...partes,
    '',
    principais.length > 0 ? `ALERTAS\n${formatAlerts(principais)}` : 'ALERTAS\nNenhum ponto crítico hoje.',
  ].join('\n\n')

  const escrito = await redigir(agent.name, agent.instructions, relatorio)
  const cabecalho = `${hasCritical(principais) ? '🔴' : '📊'} *${agent.name}* · ${brDate(today)}`
  const texto = `${cabecalho}\n\n${escrito ?? (principais.length > 0 ? formatAlerts(principais) : 'Nada crítico hoje.')}`

  const enviadoPara: string[] = []
  if (opts.enviar) {
    const donos = await owners()
    const podeEnviar = donos.length > 0 && (await isConfigured().catch(() => false))
    if (podeEnviar) {
      for (const dono of donos) {
        try {
          await uazSendText(dono.phone, texto)
          enviadoPara.push(dono.name)
        } catch (err) {
          console.error('[watch] envio falhou', dono.name, err)
        }
      }
    }
    await prisma.aiAgent.update({ where: { id: agent.id }, data: { lastWatchAt: new Date() } })
  }

  return { texto, alertas: principais.length, criticos: hasCritical(principais), enviadoPara }
}

/** Roda a vigia dos agentes com frequência configurada. Uma vez por dia por agente. */
export async function runAgentWatches(): Promise<WatchReport> {
  const report: WatchReport = { rodou: 0, avisos: 0, pulados: 0 }
  const agents = await prisma.aiAgent.findMany({ where: { isActive: true, watchFrequency: { not: 'DESLIGADA' } } })
  if (agents.length === 0) return report

  const today = spToday()
  const weekday = spWeekday()

  for (const agent of agents) {
    const lastWatchOn = agent.lastWatchAt ? agent.lastWatchAt.toLocaleDateString('en-CA', { timeZone: TZ }) : null
    if (!shouldWatchToday({ watchFrequency: agent.watchFrequency, watchWeekday: agent.watchWeekday, lastWatchOn }, today, weekday)) {
      report.pulados++
      continue
    }
    const r = await runSingleWatch(agent, { enviar: true })
    report.rodou++
    if (r.enviadoPara.length > 0) report.avisos++
  }
  return report
}

/* --------------------- aviso de assinatura da VEX Sales --------------------- */

const VEX_SALES_MATCH = /vex\s*sales/i

/**
 * Avisa os donos quando um cliente assina a VEX Sales. Detecta pelo serviço
 * contratado (qualquer caminho: tela, proposta, pipeline ou script) e a marca
 * em AgentNotice garante um aviso só por contratação.
 */
export async function runVexSalesAlerts(): Promise<{ enviados: number }> {
  const servicos = await prisma.clientService.findMany({
    where: {
      status: 'ATIVO',
      createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      OR: [{ serviceName: { contains: 'VEX Sales', mode: 'insensitive' } }, { catalog: { name: { contains: 'VEX Sales', mode: 'insensitive' } } }],
    },
    select: {
      id: true, serviceName: true, priceCents: true, dueDay: true, startDate: true, createdAt: true,
      client: { select: { id: true, name: true, monthlyValue: true, paymentDay: true } },
      catalog: { select: { name: true } },
    },
  })
  if (servicos.length === 0) return { enviados: 0 }

  const donos = await owners()
  const configurado = await isConfigured().catch(() => false)
  let enviados = 0

  for (const s of servicos) {
    if (!VEX_SALES_MATCH.test(`${s.serviceName} ${s.catalog?.name ?? ''}`)) continue
    const marca = await prisma.agentNotice.findUnique({ where: { kind_refId: { kind: 'vexsales', refId: s.id } } }).catch(() => null)
    if (marca) continue

    const totalClientes = await prisma.clientService.count({
      where: { status: 'ATIVO', OR: [{ serviceName: { contains: 'VEX Sales', mode: 'insensitive' } }, { catalog: { name: { contains: 'VEX Sales', mode: 'insensitive' } } }] },
    })
    const texto = [
      '🟢 *VEX Sales contratada*',
      '',
      `Cliente: ${s.client.name}`,
      `Plano: ${brl(s.priceCents ?? 0)}/mês · vence dia ${s.dueDay ?? s.client.paymentDay ?? '—'}`,
      `Início: ${brDate((s.startDate ?? s.createdAt).toISOString())}`,
      '',
      `Ticket do cliente: ${brl(Math.round((s.client.monthlyValue ?? 0) * 100))}/mês`,
      `Agora são ${totalClientes} cliente(s) na VEX Sales.`,
      '',
      'Falta conectar o número do cliente na plataforma.',
    ].join('\n')

    // Marca antes de enviar: numa corrida, o pior caso é um aviso a menos.
    await prisma.agentNotice.create({ data: { kind: 'vexsales', refId: s.id, detail: `${s.client.name} · ${brl(s.priceCents ?? 0)}` } }).catch(() => null)
    if (!configurado || donos.length === 0) continue
    for (const dono of donos) {
      await uazSendText(dono.phone, texto).catch((err) => console.error('[vexsales] envio falhou', dono.name, err))
    }
    enviados++
  }
  return { enviados }
}

/** Áreas que um agente vigia de fato (usado na tela para explicar o alcance). */
export const WATCHED_AREAS = TOOL_GROUPS.map((g) => g.key)
