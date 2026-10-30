import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getMonthSummary } from '@/lib/finance-summary'
import { materializeMonth } from '@/lib/financeiro'
import { materializeReceivables } from '@/lib/receivables'
import { cashTotals } from '@/lib/caixa-core'
import {
  addDays, checklistFechamento, concentracao, dreGerencial, faixasDeAtraso, projetarCaixa, resumoPorSocio, riscoDeCaixa,
  type Previsto,
} from '@/lib/bpo-core'

/**
 * Painel BPO do Financeiro: caixa projetado, pró-labore por sócio, DRE
 * gerencial, concentração, inadimplência, contas a pagar e pendências da
 * competência. Só leitura (além de materializar as recorrências, como o resto
 * do Financeiro) e só administradores. As contas ficam em lib/bpo-core.ts.
 */

const TZ = 'America/Sao_Paulo'
const dia = (d: Date) => d.toISOString().slice(0, 10)
const cents = (reais: number) => Math.round(reais * 100)

function proximo(year: number, month: number, n: number) {
  const idx = year * 12 + (month - 1) + n
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const mes = new URL(req.url).searchParams.get('mes')
  const ref = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : hoje.slice(0, 7)
  const [year, month] = ref.split('-').map(Number)
  if (month < 1 || month > 12) return NextResponse.json({ error: 'Período inválido' }, { status: 400 })

  // A projeção de 90 dias precisa das recorrências dos próximos meses já geradas
  const [hy, hm] = hoje.slice(0, 7).split('-').map(Number)
  for (let n = 1; n <= 3; n++) {
    const p = proximo(hy, hm, n)
    await materializeMonth(p.year, p.month)
    await materializeReceivables(p.year, p.month)
  }

  const summary = await getMonthSummary(year, month)
  const anterior = proximo(year, month, -1)
  const inicio = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1))
  const limite = addDays(hoje, 90)

  const [todosMov, movsMes, movsAnterior, receberAbertos, pagarAbertos, parcelasMes] = await Promise.all([
    prisma.cashMovement.findMany({ select: { kind: true, amountCents: true } }),
    prisma.cashMovement.findMany({
      where: { date: { gte: inicio(year, month), lt: inicio(proximo(year, month, 1).year, proximo(year, month, 1).month) } },
      select: { id: true, kind: true, amountCents: true, description: true, category: true, account: true, date: true, partner: { select: { name: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.cashMovement.findMany({
      where: { kind: 'RETIRADA', date: { gte: inicio(anterior.year, anterior.month), lt: inicio(year, month) } },
      select: { amountCents: true },
    }),
    prisma.clientPayment.findMany({
      where: { status: 'PENDENTE', dueDate: { lte: new Date(`${limite}T23:59:59Z`) } },
      select: { amount: true, dueDate: true, client: { select: { name: true } }, service: { select: { serviceName: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.financialEntry.findMany({
      where: { type: { in: ['CUSTO', 'SALARIO'] }, status: 'PENDENTE' },
      select: { id: true, type: true, category: true, name: true, description: true, amount: true, dueDate: true, date: true, user: { select: { name: true } } },
    }),
    prisma.clientPayment.findMany({
      where: { year, month, status: { not: 'CANCELADO' } },
      select: { amount: true, status: true, receivedAccount: true, client: { select: { name: true } } },
    }),
  ])

  const saldoCents = cashTotals(todosMov).saldoCents
  const receber: Previsto[] = receberAbertos.map((p) => ({
    vence: dia(p.dueDate), cents: cents(p.amount), nome: `${p.client.name}${p.service ? ` · ${p.service.serviceName}` : ''}`,
  }))
  const pagar: Previsto[] = pagarAbertos
    .map((e) => ({
      vence: dia(e.dueDate ?? e.date),
      cents: cents(e.amount),
      nome: e.type === 'SALARIO' ? `Salário · ${e.user?.name ?? e.name ?? e.description}` : `${e.name ?? e.description} · ${e.category}`,
    }))
    .filter((p) => p.vence <= limite)
    .sort((a, b) => a.vence.localeCompare(b.vence))

  const { projecoes, atrasadosReceberCents } = projetarCaixa({ saldoCents, hoje, receber, pagar })
  const d30 = projecoes.find((p) => p.dias === 30)!

  const retiradasMes = cashTotals(movsMes).retiradasCents
  const retiradasAnterior = movsAnterior.reduce((s, m) => s + Math.abs(m.amountCents), 0)

  const atrasados = receber.filter((r) => r.vence < hoje)
  const porClienteAtraso = new Map<string, { cents: number; desde: string; qtd: number }>()
  for (const r of receberAbertos.filter((p) => dia(p.dueDate) < hoje)) {
    const k = r.client.name
    const cur = porClienteAtraso.get(k) ?? { cents: 0, desde: dia(r.dueDate), qtd: 0 }
    cur.cents += cents(r.amount)
    cur.qtd++
    if (dia(r.dueDate) < cur.desde) cur.desde = dia(r.dueDate)
    porClienteAtraso.set(k, cur)
  }

  const semCategoria = movsMes.filter((m) => !m.category?.trim())
  const semConta = parcelasMes.filter((p) => p.status === 'PAGO' && !p.receivedAccount?.trim())

  return NextResponse.json({
    referencia: { hoje, competencia: ref },
    caixa: {
      saldoCents,
      risco: riscoDeCaixa(d30),
      projecoes,
      atrasadosReceberCents,
    },
    pagar: {
      vencidas: pagar.filter((p) => p.vence < hoje),
      proximos7: pagar.filter((p) => p.vence >= hoje && p.vence <= addDays(hoje, 7)),
      ate30: pagar.filter((p) => p.vence > addDays(hoje, 7) && p.vence <= addDays(hoje, 30)),
    },
    receber: {
      proximos7: receber.filter((r) => r.vence >= hoje && r.vence <= addDays(hoje, 7)),
      faixas: faixasDeAtraso(atrasados, hoje),
      atrasadosPorCliente: [...porClienteAtraso].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.cents - a.cents),
    },
    socios: resumoPorSocio(movsMes.map((m) => ({
      kind: m.kind, cents: m.amountCents, socio: m.partner?.name ?? null, descricao: m.description, dia: dia(m.date),
    }))),
    dre: dreGerencial(
      { previstaCents: summary.previstaCents, recebidaCents: summary.recebidaCents, custosPagosCents: summary.custosPagosCents, salariosPagosCents: summary.salariosPagosCents, retiradasCents: retiradasMes },
      summary.previous
        ? { previstaCents: summary.previous.previstaCents, recebidaCents: summary.previous.recebidaCents, custosPagosCents: summary.previous.custosPagosCents, salariosPagosCents: summary.previous.salariosPagosCents, retiradasCents: retiradasAnterior }
        : null,
    ),
    custosPorCategoria: summary.custosPorCategoria,
    concentracao: concentracao(parcelasMes.map((p) => ({ nome: p.client.name, cents: cents(p.amount) }))),
    pendencias: {
      semCategoria: semCategoria.map((m) => ({ id: m.id, dia: dia(m.date), kind: m.kind, cents: m.amountCents, descricao: m.description })),
      semConta: semConta.length,
    },
    checklist: checklistFechamento({
      receberAbertos: parcelasMes.filter((p) => p.status === 'PENDENTE').length,
      pagarAbertos: pagarAbertos.filter((e) => {
        const v = dia(e.dueDate ?? e.date)
        return v.slice(0, 7) === ref
      }).length,
      semCategoria: semCategoria.length,
      semConta: semConta.length,
      saldoCents,
    }),
  })
}
