import { prisma } from './prisma'
import { materializeMonth } from './financeiro'
import { materializeReceivables } from './receivables'
import { competenceBreakdown, recurringTicketCents } from './billing-core'

/**
 * Fonte ÚNICA dos números financeiros — Dashboard, Financeiro e perfil do
 * cliente leem daqui. Tudo em centavos inteiros.
 *
 * Definições:
 * - MRR: soma dos serviços recorrentes ativos hoje (clientes ativos).
 * - Receita prevista: recorrentes da competência + avulsos da competência.
 * - Recebida: parcelas PAGAS da competência (+ receitas extras pagas).
 * - Pendente: parcelas abertas dentro do prazo.
 * - Atrasada: parcelas abertas vencidas.
 * - Resultado previsto: prevista − custos previstos.
 * - Lucro realizado: recebida − custos pagos.
 */

export interface MonthSummary {
  year: number
  month: number
  mrrCents: number
  previstaRecorrenteCents: number
  previstaAvulsaCents: number
  previstaCents: number
  recebidaCents: number
  recebidaRecorrenteCents: number
  recebidaAvulsaCents: number
  pendenteCents: number
  atrasadaCents: number
  custosPrevistosCents: number
  custosPagosCents: number
  salariosPrevistosCents: number
  salariosPagosCents: number
  resultadoPrevistoCents: number
  lucroRealizadoCents: number
  activeClients: number
  segments: Array<{ tier: string | null; count: number; recurringCents: number; share: number }>
  custosPorCategoria: Array<{ category: string; previstoCents: number; pagoCents: number }>
  cobrancasPorStatus: Array<{ status: string; count: number; cents: number }>
  previous: {
    previstaCents: number
    recebidaCents: number
    pendenteCents: number
    atrasadaCents: number
    custosPrevistosCents: number
    custosPagosCents: number
    resultadoPrevistoCents: number
    lucroRealizadoCents: number
    mrrCents: number
  } | null
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function toCents(v: number | null | undefined): number {
  return Math.round((v ?? 0) * 100)
}

function prevPeriod(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

const SERVICE_SELECT = {
  id: true, serviceName: true, status: true, monthlyValue: true, startDate: true, endDate: true,
  contractType: true, priceCents: true, quantity: true, discountCents: true, competence: true,
  billingDescription: true,
} as const

/** Números "crus" de uma competência, sem materializar nem comparar. */
async function rawMonth(year: number, month: number) {
  const today = todayISO()
  const startOfToday = new Date(`${today}T00:00:00Z`)

  const [clients, payments, entries] = await Promise.all([
    prisma.client.findMany({
      where: { status: 'ATIVO' },
      select: { id: true, status: true, contractEnd: true, tier: true, services: { select: SERVICE_SELECT } },
    }),
    prisma.clientPayment.findMany({
      where: { year, month, status: { not: 'CANCELADO' } },
      select: { amount: true, status: true, dueDate: true, kind: true },
    }),
    prisma.financialEntry.findMany({
      where: {
        status: { not: 'CANCELADO' },
        OR: [{ year, month }, { year: null, date: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) } }],
      },
      select: { type: true, category: true, amount: true, status: true },
    }),
  ])

  let previstaRecorrente = 0
  let previstaAvulsa = 0
  let mrr = 0
  const segMap = new Map<string | null, { count: number; recurringCents: number }>()
  for (const c of clients) {
    const b = competenceBreakdown(c, c.services, year, month)
    previstaRecorrente += b.recurringCents
    previstaAvulsa += b.avulsoCents
    const ticket = recurringTicketCents(c.services, today)
    mrr += ticket
    const key = ticket > 0 ? c.tier : c.tier // grupo já reflete o ticket; mantém o do cadastro
    const seg = segMap.get(key) ?? { count: 0, recurringCents: 0 }
    seg.count += 1
    seg.recurringCents += ticket
    segMap.set(key, seg)
  }

  let recebida = 0, recebidaRec = 0, recebidaAv = 0, pendente = 0, atrasada = 0
  for (const p of payments) {
    const cents = toCents(p.amount)
    if (p.status === 'PAGO') {
      recebida += cents
      if (p.kind === 'AVULSO') recebidaAv += cents
      else recebidaRec += cents
    } else if (p.status === 'PENDENTE') {
      if (p.dueDate < startOfToday) atrasada += cents
      else pendente += cents
    }
  }

  let custosPrev = 0, custosPagos = 0, salPrev = 0, salPagos = 0
  const cat = new Map<string, { previstoCents: number; pagoCents: number }>()
  for (const e of entries) {
    const cents = toCents(e.amount)
    if (e.type === 'RECEITA') {
      // Receita extra legada (lançamento manual): conta como avulsa
      previstaAvulsa += cents
      if (e.status === 'PAGO') { recebida += cents; recebidaAv += cents }
      else pendente += cents
      continue
    }
    if (e.type === 'SALARIO') {
      salPrev += cents
      if (e.status === 'PAGO') salPagos += cents
    } else {
      custosPrev += cents
      if (e.status === 'PAGO') custosPagos += cents
    }
    const c = cat.get(e.category) ?? { previstoCents: 0, pagoCents: 0 }
    c.previstoCents += cents
    if (e.status === 'PAGO') c.pagoCents += cents
    cat.set(e.category, c)
  }

  const custosTotais = custosPrev + salPrev
  const custosTotaisPagos = custosPagos + salPagos
  const prevista = previstaRecorrente + previstaAvulsa

  return {
    mrrCents: mrr,
    previstaRecorrenteCents: previstaRecorrente,
    previstaAvulsaCents: previstaAvulsa,
    previstaCents: prevista,
    recebidaCents: recebida,
    recebidaRecorrenteCents: recebidaRec,
    recebidaAvulsaCents: recebidaAv,
    pendenteCents: pendente,
    atrasadaCents: atrasada,
    custosPrevistosCents: custosTotais,
    custosPagosCents: custosTotaisPagos,
    salariosPrevistosCents: salPrev,
    salariosPagosCents: salPagos,
    resultadoPrevistoCents: prevista - custosTotais,
    lucroRealizadoCents: recebida - custosTotaisPagos,
    activeClients: clients.length,
    segMap,
    custosPorCategoria: [...cat.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.previstoCents - a.previstoCents),
  }
}

/** Resumo completo da competência (materializa recorrências antes). */
export async function getMonthSummary(year: number, month: number): Promise<MonthSummary> {
  await materializeMonth(year, month)
  await materializeReceivables(year, month)

  const cur = await rawMonth(year, month)
  const p = prevPeriod(year, month)
  const prev = await rawMonth(p.year, p.month).catch(() => null)

  const charges = await prisma.asaasCharge.groupBy({
    by: ['status'],
    where: { year, month },
    _count: { _all: true },
    _sum: { value: true },
  })

  const segments = (['SCALE', 'GROWTH', 'START', null] as const).map((tier) => {
    const s = cur.segMap.get(tier) ?? { count: 0, recurringCents: 0 }
    return {
      tier,
      count: s.count,
      recurringCents: s.recurringCents,
      share: cur.mrrCents > 0 ? Math.round((s.recurringCents / cur.mrrCents) * 1000) / 10 : 0,
    }
  })

  const { segMap: _drop, ...rest } = cur
  void _drop
  return {
    year, month,
    ...rest,
    segments,
    cobrancasPorStatus: charges.map((c) => ({ status: c.status, count: c._count._all, cents: Math.round(Number(c._sum.value ?? 0) * 100) })),
    previous: prev
      ? {
          previstaCents: prev.previstaCents,
          recebidaCents: prev.recebidaCents,
          pendenteCents: prev.pendenteCents,
          atrasadaCents: prev.atrasadaCents,
          custosPrevistosCents: prev.custosPrevistosCents,
          custosPagosCents: prev.custosPagosCents,
          resultadoPrevistoCents: prev.resultadoPrevistoCents,
          lucroRealizadoCents: prev.lucroRealizadoCents,
          mrrCents: prev.mrrCents,
        }
      : null,
  }
}

export interface SeriesPoint {
  year: number
  month: number
  recebidaCents: number
  previstaRecorrenteCents: number
  previstaAvulsaCents: number
  custosCents: number
}

/** Série mensal para os gráficos (últimos N meses até o mês corrente). */
export async function getSeries(months = 24): Promise<{ series: SeriesPoint[]; hasData: boolean }> {
  const now = new Date()
  const periods: Array<{ year: number; month: number }> = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  const series: SeriesPoint[] = []
  let hasData = false
  for (const p of periods) {
    const r = await rawMonth(p.year, p.month)
    if (r.recebidaCents > 0 || r.previstaCents > 0 || r.custosPrevistosCents > 0) hasData = true
    series.push({
      year: p.year, month: p.month,
      recebidaCents: r.recebidaCents,
      previstaRecorrenteCents: r.previstaRecorrenteCents,
      previstaAvulsaCents: r.previstaAvulsaCents,
      custosCents: r.custosPrevistosCents,
    })
  }
  return { series, hasData }
}

/** Indicadores do perfil de um cliente na competência. */
export async function clientMonthIndicators(clientId: string, year: number, month: number) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, status: true, contractEnd: true, tier: true, tierManual: true, tierChangedAt: true, services: { select: SERVICE_SELECT } },
  })
  if (!client) return null
  const today = todayISO()
  const b = competenceBreakdown(client, client.services, year, month)
  const ticketCents = recurringTicketCents(client.services, today)
  const recurringActive = client.services.filter((s) => s.status === 'ATIVO' && s.contractType !== 'AVULSO').length
  const avulsosMes = b.items.filter((i) => i.kind === 'AVULSO').length
  return {
    ticketCents,
    recurringActive,
    avulsosMes,
    avulsaCents: b.avulsoCents,
    previstaCents: b.totalCents,
    tier: client.tier,
    tierManual: client.tierManual,
    tierChangedAt: client.tierChangedAt,
  }
}
