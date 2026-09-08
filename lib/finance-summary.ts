import { prisma } from './prisma'
import { materializeMonth } from './financeiro'
import { materializeReceivables } from './receivables'
import { competenceBreakdown, recurringTicketCents } from './billing-core'
import { getTierRanges } from './client-tier'

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


/* ------------------------------ período ------------------------------ */

export type PeriodView = 'mensal' | 'anual'

export interface PeriodSummary {
  view: PeriodView
  year: number
  month: number | null
  label: string
  /** Data de referência dos indicadores de posição (MRR, ARR, carteira). */
  referenceDate: string
  isCurrentPeriod: boolean
  previstaCents: number
  previstaRecorrenteCents: number
  previstaAvulsaCents: number
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
  /** Indicadores de posição: valem na data de referência, não se somam. */
  mrrCents: number
  arrCents: number
  activeClients: number
  /** Clientes que compõem o MRR (ticket recorrente maior que zero). */
  clientsWithRecurring: number
  segments: Array<{ tier: string | null; count: number; recurringCents: number; share: number }>
  custosPorCategoria: Array<{ category: string; previstoCents: number; pagoCents: number }>
  novosClientes: number
  months: Array<{ year: number; month: number; previstaCents: number; recebidaCents: number; custosCents: number }>
  previous: {
    label: string
    previstaCents: number
    recebidaCents: number
    atrasadaCents: number
    custosPrevistosCents: number
    resultadoPrevistoCents: number
    lucroRealizadoCents: number
    mrrCents: number
    novosClientes: number
    /** true quando o período de comparação é parcial (mesmo recorte de dias). */
    parcial: boolean
  } | null
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function spToday(): { year: number; month: number; day: number; iso: string } {
  const iso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const [y, m, d] = iso.split('-').map(Number)
  return { year: y, month: m, day: d, iso }
}

/** Último dia do período, ou hoje quando o período ainda está em andamento. */
function referenceFor(view: PeriodView, year: number, month: number | null): { iso: string; current: boolean } {
  const t = spToday()
  if (view === 'anual') {
    if (year === t.year) return { iso: t.iso, current: true }
    if (year > t.year) return { iso: `${year}-01-01`, current: false }
    return { iso: `${year}-12-31`, current: false }
  }
  const m = month ?? t.month
  if (year === t.year && m === t.month) return { iso: t.iso, current: true }
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate()
  const futuro = year > t.year || (year === t.year && m > t.month)
  return { iso: futuro ? `${year}-${String(m).padStart(2, '0')}-01` : `${year}-${String(m).padStart(2, '0')}-${last}`, current: false }
}

/** MRR, carteira e segmentação como estavam na data de referência. */
async function positionAt(referenceISO: string) {
  const [clients, ranges] = await Promise.all([
    prisma.client.findMany({
      where: { status: 'ATIVO', createdAt: { lte: new Date(`${referenceISO}T23:59:59Z`) } },
      select: { id: true, tier: true, tierManual: true, services: { select: SERVICE_SELECT } },
    }),
    getTierRanges(),
  ])

  let mrr = 0
  let comRecorrencia = 0
  const segMap = new Map<string | null, { count: number; recurringCents: number }>()
  for (const c of clients) {
    const ticket = recurringTicketCents(c.services, referenceISO)
    mrr += ticket
    if (ticket > 0) comRecorrencia += 1
    // Classificação manual é preservada; a automática vem do ticket da data
    const tier = c.tierManual
      ? c.tier
      : ticket <= 0 ? null
        : ticket <= ranges.startMaxCents ? 'START'
          : ticket <= ranges.growthMaxCents ? 'GROWTH' : 'SCALE'
    const seg = segMap.get(tier) ?? { count: 0, recurringCents: 0 }
    seg.count += 1
    seg.recurringCents += ticket
    segMap.set(tier, seg)
  }

  const segments = (['SCALE', 'GROWTH', 'START', null] as const).map((tier) => {
    const s = segMap.get(tier) ?? { count: 0, recurringCents: 0 }
    return {
      tier: tier as string | null,
      count: s.count,
      recurringCents: s.recurringCents,
      share: mrr > 0 ? Math.round((s.recurringCents / mrr) * 1000) / 10 : 0,
    }
  })
  return { mrrCents: mrr, activeClients: clients.length, clientsWithRecurring: comRecorrencia, segments }
}

/**
 * Resumo do período — mês ou ano. O anual é a soma das competências do ano,
 * exatamente os mesmos números que a visão mensal mostra mês a mês: nada é
 * projetado multiplicando o mês atual por 12.
 *
 * MRR, ARR, carteira e segmentação são indicadores de POSIÇÃO: valem na data
 * de referência e nunca são somados entre meses.
 */
export async function getPeriodSummary(view: PeriodView, year: number, month?: number | null): Promise<PeriodSummary> {
  const t = spToday()
  const mes = view === 'mensal' ? (month ?? t.month) : null
  const meses = view === 'anual'
    ? Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 }))
    : [{ year, month: mes as number }]

  // Só a competência corrente é materializada. Consultar um mês antigo no
  // Dashboard não pode criar parcela retroativa que ninguém tinha gerado.
  for (const p of meses) {
    if (p.year !== t.year || p.month !== t.month) continue
    await materializeMonth(p.year, p.month)
    await materializeReceivables(p.year, p.month)
  }

  const parciais = await Promise.all(meses.map((p) => rawMonth(p.year, p.month)))
  const soma = parciais.reduce((acc, m) => ({
    previstaCents: acc.previstaCents + m.previstaCents,
    previstaRecorrenteCents: acc.previstaRecorrenteCents + m.previstaRecorrenteCents,
    previstaAvulsaCents: acc.previstaAvulsaCents + m.previstaAvulsaCents,
    recebidaCents: acc.recebidaCents + m.recebidaCents,
    recebidaRecorrenteCents: acc.recebidaRecorrenteCents + m.recebidaRecorrenteCents,
    recebidaAvulsaCents: acc.recebidaAvulsaCents + m.recebidaAvulsaCents,
    pendenteCents: acc.pendenteCents + m.pendenteCents,
    atrasadaCents: acc.atrasadaCents + m.atrasadaCents,
    custosPrevistosCents: acc.custosPrevistosCents + m.custosPrevistosCents,
    custosPagosCents: acc.custosPagosCents + m.custosPagosCents,
    salariosPrevistosCents: acc.salariosPrevistosCents + m.salariosPrevistosCents,
    salariosPagosCents: acc.salariosPagosCents + m.salariosPagosCents,
  }), {
    previstaCents: 0, previstaRecorrenteCents: 0, previstaAvulsaCents: 0,
    recebidaCents: 0, recebidaRecorrenteCents: 0, recebidaAvulsaCents: 0,
    pendenteCents: 0, atrasadaCents: 0, custosPrevistosCents: 0, custosPagosCents: 0,
    salariosPrevistosCents: 0, salariosPagosCents: 0,
  })

  const catMap = new Map<string, { previstoCents: number; pagoCents: number }>()
  for (const m of parciais) {
    for (const c of m.custosPorCategoria) {
      const cur = catMap.get(c.category) ?? { previstoCents: 0, pagoCents: 0 }
      cur.previstoCents += c.previstoCents
      cur.pagoCents += c.pagoCents
      catMap.set(c.category, cur)
    }
  }

  const ref = referenceFor(view, year, mes)
  const posicao = await positionAt(ref.iso)

  const inicio = view === 'anual' ? new Date(Date.UTC(year, 0, 1)) : new Date(Date.UTC(year, (mes as number) - 1, 1))
  const fim = view === 'anual' ? new Date(Date.UTC(year, 11, 31, 23, 59, 59)) : new Date(Date.UTC(year, mes as number, 0, 23, 59, 59))
  const novosClientes = await prisma.client.count({ where: { createdAt: { gte: inicio, lte: fim } } })

  // Comparação: mês anterior ou ano anterior, com o mesmo recorte quando o
  // período atual ainda está em andamento
  const anterior = view === 'anual'
    ? { view, year: year - 1, month: null as number | null, label: `Ano de ${year - 1}` }
    : (() => { const p = prevPeriod(year, mes as number); return { view, year: p.year, month: p.month, label: `${MESES[p.month - 1]} de ${p.year}` } })()

  const mesesAnt = anterior.month
    ? [{ year: anterior.year, month: anterior.month }]
    : Array.from({ length: 12 }, (_, i) => ({ year: anterior.year, month: i + 1 }))
  const parciaisAnt = await Promise.all(mesesAnt.map((p) => rawMonth(p.year, p.month).catch(() => null)))
  const somaAnt = parciaisAnt.filter(Boolean).reduce((acc, m) => ({
    previstaCents: acc.previstaCents + (m?.previstaCents ?? 0),
    recebidaCents: acc.recebidaCents + (m?.recebidaCents ?? 0),
    atrasadaCents: acc.atrasadaCents + (m?.atrasadaCents ?? 0),
    custosPrevistosCents: acc.custosPrevistosCents + (m?.custosPrevistosCents ?? 0),
    resultadoPrevistoCents: acc.resultadoPrevistoCents + (m?.resultadoPrevistoCents ?? 0),
    lucroRealizadoCents: acc.lucroRealizadoCents + (m?.lucroRealizadoCents ?? 0),
  }), { previstaCents: 0, recebidaCents: 0, atrasadaCents: 0, custosPrevistosCents: 0, resultadoPrevistoCents: 0, lucroRealizadoCents: 0 })

  const inicioAnt = anterior.month
    ? new Date(Date.UTC(anterior.year, anterior.month - 1, 1))
    : new Date(Date.UTC(anterior.year, 0, 1))
  const fimAnt = anterior.month
    ? new Date(Date.UTC(anterior.year, anterior.month, 0, 23, 59, 59))
    : new Date(Date.UTC(anterior.year, 11, 31, 23, 59, 59))
  const [novosAnt, posicaoAnt] = await Promise.all([
    prisma.client.count({ where: { createdAt: { gte: inicioAnt, lte: fimAnt } } }),
    positionAt(anterior.month
      ? `${anterior.year}-${String(anterior.month).padStart(2, '0')}-${new Date(Date.UTC(anterior.year, anterior.month, 0)).getUTCDate()}`
      : `${anterior.year}-12-31`),
  ])

  return {
    view, year, month: mes,
    label: view === 'anual' ? `Ano de ${year}` : `${MESES[(mes as number) - 1]} de ${year}`,
    referenceDate: ref.iso,
    isCurrentPeriod: ref.current,
    ...soma,
    resultadoPrevistoCents: soma.previstaCents - soma.custosPrevistosCents,
    lucroRealizadoCents: soma.recebidaCents - soma.custosPagosCents,
    mrrCents: posicao.mrrCents,
    arrCents: posicao.mrrCents * 12,
    activeClients: posicao.activeClients,
    clientsWithRecurring: posicao.clientsWithRecurring,
    segments: posicao.segments,
    custosPorCategoria: [...catMap.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.previstoCents - a.previstoCents),
    novosClientes,
    months: parciais.map((m, i) => ({
      year: meses[i].year, month: meses[i].month,
      previstaCents: m.previstaCents, recebidaCents: m.recebidaCents, custosCents: m.custosPrevistosCents,
    })),
    previous: {
      label: anterior.label,
      ...somaAnt,
      mrrCents: posicaoAnt.mrrCents,
      novosClientes: novosAnt,
      parcial: ref.current,
    },
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
