import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
  const year = Number(searchParams.get('year') || new Date().getFullYear())

  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)

  const [entries, clientPayments, salaries] = await Promise.all([
    prisma.financialEntry.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'desc' },
    }),
    prisma.clientPayment.findMany({
      where: { month, year },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.user.findMany({
      where: { isActive: true, salary: { not: null } },
      select: { id: true, name: true, position: true, salary: true },
    }),
  ])

  const totalRevenue = clientPayments
    .filter((p) => p.status === 'PAGO')
    .reduce((s, p) => s + p.amount, 0)

  const pendingRevenue = clientPayments
    .filter((p) => p.status === 'PENDENTE')
    .reduce((s, p) => s + p.amount, 0)

  const totalSalaries = salaries.reduce((s, u) => s + (u.salary || 0), 0)

  const otherCosts = entries
    .filter((e) => e.type === 'CUSTO')
    .reduce((s, e) => s + e.amount, 0)

  const totalCosts = totalSalaries + otherCosts

  return NextResponse.json({
    entries,
    clientPayments,
    salaries,
    summary: {
      totalRevenue,
      pendingRevenue,
      totalSalaries,
      otherCosts,
      totalCosts,
      netProfit: totalRevenue - totalCosts,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const entry = await prisma.financialEntry.create({
    data: {
      type: body.type,
      category: body.category,
      description: body.description,
      amount: Number(body.amount),
      date: new Date(body.date),
      isPaid: body.isPaid || false,
      recurring: body.recurring || false,
    },
  })

  await logActivity((session.user as any).id, 'registrou lançamento financeiro', 'Financeiro', body.description)
  return NextResponse.json(entry, { status: 201 })
}
