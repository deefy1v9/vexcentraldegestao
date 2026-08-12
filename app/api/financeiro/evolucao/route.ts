import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/**
 * Evolução do faturamento: receita efetivamente recebida por mês.
 *
 * Considera apenas pagamentos com status PAGO, agrupados pela competência
 * (mês/ano do boleto) — o mesmo critério da "Receita Recebida" do dashboard.
 * Devolve os últimos 24 meses (incluindo meses zerados) para os filtros de
 * 6 meses, 12 meses e ano atual serem resolvidos no cliente.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const now = new Date()
  const months: { year: number; month: number }[] = []
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  const start = months[0]

  const paid = await prisma.clientPayment.groupBy({
    by: ['year', 'month'],
    _sum: { amount: true },
    where: {
      status: 'PAGO',
      OR: [
        { year: { gt: start.year } },
        { year: start.year, month: { gte: start.month } },
      ],
    },
  })

  const byKey = new Map(paid.map((p) => [`${p.year}-${p.month}`, p._sum.amount ?? 0]))
  const series = months.map(({ year, month }) => ({
    year,
    month,
    total: byKey.get(`${year}-${month}`) ?? 0,
  }))

  // hasData: houve ao menos um pagamento registrado como pago no período —
  // o front usa isto para diferenciar "tudo zerado" de "sem histórico".
  return NextResponse.json({ series, hasData: paid.length > 0 })
}
