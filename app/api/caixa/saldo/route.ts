import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { cashTotals, withdrawalsByPartner } from '@/lib/caixa-core'

/**
 * Saldo do caixa e o movimento do mês, para o card do Dashboard e do
 * Financeiro. Leve de propósito: só os campos que o card mostra.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const mes = new URL(req.url).searchParams.get('mes')
  const ref = mes && /^\d{4}-\d{2}$/.test(mes)
    ? mes
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
  const [y, m] = ref.split('-').map(Number)
  const inicio = new Date(Date.UTC(y, m - 1, 1))
  const fim = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1))

  const [todos, doMes, ultimo] = await Promise.all([
    prisma.cashMovement.findMany({ select: { kind: true, amountCents: true } }),
    prisma.cashMovement.findMany({
      where: { date: { gte: inicio, lt: fim } },
      select: { kind: true, amountCents: true, partner: { select: { name: true } } },
    }),
    prisma.cashMovement.findFirst({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], select: { date: true, description: true } }),
  ])

  const mesTotais = cashTotals(doMes)
  return NextResponse.json({
    competencia: ref,
    saldoCents: cashTotals(todos).saldoCents,
    entradasCents: mesTotais.entradasCents,
    saidasCents: mesTotais.saidasCents + mesTotais.retiradasCents,
    retiradasCents: mesTotais.retiradasCents,
    retiradasPorSocio: withdrawalsByPartner(doMes.map((x) => ({ kind: x.kind, amountCents: x.amountCents, partnerName: x.partner?.name }))),
    temMovimento: todos.length > 0,
    ultimo: ultimo ? { date: ultimo.date, description: ultimo.description } : null,
  })
}
