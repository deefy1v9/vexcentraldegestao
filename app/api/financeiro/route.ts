import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { getMonthSummary } from '@/lib/finance-summary'
import { currentCompetence, serviceCents, serviceInCompetence } from '@/lib/billing-core'

/** Serviço da plataforma VEX Sales (plano ou IA de atendimento), sem o repasse de custo de IA. */
function isVexSales(s: { serviceName: string; customName: string | null; catalog: { name: string } | null }): boolean {
  const nomes = [s.serviceName, s.customName ?? '', s.catalog?.name ?? ''].join(' ').toLowerCase()
  return nomes.includes('vex sales') && !nomes.includes('custo de ia')
}

/**
 * Dados financeiros de um mês (competência).
 *
 * Materializa as recorrências do período antes de consultar, então custos
 * recorrentes e salários "aparecem sozinhos" no mês certo ao navegar. As
 * parcelas dos serviços só nascem da competência corrente em diante.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const { searchParams } = new URL(req.url)
  const atual = currentCompetence()
  const month = Number(searchParams.get('month') || atual.month)
  const year = Number(searchParams.get('year') || atual.year)
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  }

  // Resumo único da competência (mesma fonte do Dashboard). Vem antes das
  // consultas porque é ele que materializa custos, salários e parcelas —
  // uma vez só por requisição
  const summary = await getMonthSummary(year, month)

  const now = new Date()
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)

  const [entries, clientPayments, users, upcoming, recentEntries, recentReceipts, asaasCharges, servicosVexSales] =
    await Promise.all([
      // Lançamentos do mês (custos, salários e receitas extras); lápides ficam de fora
      prisma.financialEntry.findMany({
        where: {
          status: { not: 'CANCELADO' },
          OR: [
            { year, month },
            // lançamentos antigos sem competência gravada caem pela data
            { year: null, date: { gte: start, lte: end } },
          ],
        },
        include: { user: { select: { id: true, name: true, position: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.clientPayment.findMany({
        where: { month, year, status: { not: 'CANCELADO' } },
        include: {
          client: { select: { id: true, name: true, tier: true } },
          service: { select: { id: true, serviceName: true, contractType: true, billingDescription: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, position: true, salary: true },
        orderBy: { name: 'asc' },
      }),
      // Próximos vencimentos (salários e custos pendentes, qualquer mês)
      prisma.financialEntry.findMany({
        where: { status: 'PENDENTE', dueDate: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } },
        include: { user: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 8,
      }),
      // Movimentações recentes: custos/salários pagos
      prisma.financialEntry.findMany({
        where: { status: 'PAGO', paidAt: { not: null } },
        include: { user: { select: { name: true } } },
        orderBy: { paidAt: 'desc' },
        take: 8,
      }),
      // Movimentações recentes: recebimentos de clientes
      prisma.clientPayment.findMany({
        where: { status: 'PAGO', paidAt: { not: null } },
        include: { client: { select: { name: true } } },
        orderBy: { paidAt: 'desc' },
        take: 8,
      }),
      // Cobranças Asaas da competência (com a NFS-e vinculada)
      prisma.asaasCharge.findMany({
        where: { year, month },
        include: { nfse: true, items: true, client: { select: { id: true, name: true } } },
      }),
      // Clientes da plataforma VEX Sales (card separado no Financeiro)
      prisma.clientService.findMany({
        where: { status: 'ATIVO', client: { status: 'ATIVO' } },
        include: { client: { select: { id: true, name: true } }, catalog: { select: { name: true } } },
      }),
    ])

  // VEX Sales do mês: quem usa, quanto paga e a situação da parcela
  const hoje0 = new Date(`${now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}T00:00:00Z`)
  const vexSalesClientes = servicosVexSales
    .filter((s) => isVexSales(s) && serviceInCompetence(s, year, month))
    .map((s) => {
      const parcela = clientPayments.find((p) => p.serviceId === s.id)
      const situacao = !parcela ? 'sem parcela'
        : parcela.status === 'PAGO' ? 'pago'
        : parcela.dueDate < hoje0 ? 'atrasado' : 'pendente'
      return {
        clientId: s.client.id,
        nome: s.client.name,
        plano: s.customName || s.serviceName,
        cents: serviceCents(s),
        situacao,
        vence: parcela?.dueDate ?? null,
      }
    })
    .sort((a, b) => b.cents - a.cents)
  const vexSales = {
    totalCents: vexSalesClientes.reduce((a, c) => a + c.cents, 0),
    recebidoCents: vexSalesClientes.filter((c) => c.situacao === 'pago').reduce((a, c) => a + c.cents, 0),
    clientes: vexSalesClientes,
  }

  return NextResponse.json({
    entries,
    clientPayments,
    users,
    asaasCharges,
    summary,
    vexSales,
    previstoServicos: summary.previstaCents / 100,
    upcoming,
    recent: [
      ...recentEntries.map((e) => ({
        id: `e-${e.id}`,
        kind: e.type === 'SALARIO' ? 'salario' : 'custo',
        label: e.name || e.description,
        detail: e.user?.name ?? e.category,
        amount: e.amount,
        at: e.paidAt,
      })),
      ...recentReceipts.map((p) => ({
        id: `p-${p.id}`,
        kind: 'recebimento',
        label: p.client.name,
        detail: `${String(p.month).padStart(2, '0')}/${p.year}`,
        amount: p.amount,
        at: p.paidAt,
      })),
    ]
      .sort((a, b) => new Date(b.at as unknown as string).getTime() - new Date(a.at as unknown as string).getTime())
      .slice(0, 10),
  })
}

/** Lançamento avulso de receita extra (mantido do fluxo antigo). */
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const body = await req.json()
  const amount = Number(body.amount)
  if (!body.description || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'Descrição e valor (≥ 0) são obrigatórios' }, { status: 400 })
  }
  const date = body.date ? new Date(body.date) : new Date()

  const entry = await prisma.financialEntry.create({
    data: {
      type: body.type === 'RECEITA' ? 'RECEITA' : 'CUSTO',
      category: body.category || 'Outros',
      name: body.name || body.description,
      description: body.description,
      amount,
      date,
      dueDate: date,
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      status: body.isPaid ? 'PAGO' : 'PENDENTE',
      paidAt: body.isPaid ? new Date() : null,
      isPaid: body.isPaid || false,
    },
  })

  await logActivity(user.id, 'registrou lançamento financeiro', 'Financeiro', body.description)
  return NextResponse.json(entry, { status: 201 })
}
