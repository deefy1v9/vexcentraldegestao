import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { materializeMonth } from '@/lib/financeiro'

/**
 * Dados financeiros de um mês (competência).
 *
 * Materializa as recorrências do período antes de consultar, então custos
 * recorrentes e salários "aparecem sozinhos" no mês certo ao navegar.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const { searchParams } = new URL(req.url)
  const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
  const year = Number(searchParams.get('year') || new Date().getFullYear())
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  }

  await materializeMonth(year, month)

  const now = new Date()
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)

  const [entries, clientPayments, users, serviceRevenueAgg, upcoming, recentEntries, recentReceipts] =
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
        where: { month, year },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, position: true, salary: true },
        orderBy: { name: 'asc' },
      }),
      // Receita prevista: mensalidade dos serviços ativos (previsão, não recebido)
      prisma.clientService.aggregate({
        _sum: { monthlyValue: true },
        where: { status: 'ATIVO', client: { status: 'ATIVO' } },
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
    ])

  return NextResponse.json({
    entries,
    clientPayments,
    users,
    previstoServicos: serviceRevenueAgg._sum.monthlyValue ?? 0,
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
