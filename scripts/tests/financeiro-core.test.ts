import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReceivableRows, daysUntil, filterEntries, filterReceivables, finTabCounts, isOverdue, situationOf,
  sortReceivables, totalsBySituation, EMPTY_FIN_FILTERS, type PaymentLike, type ChargeLike, type EntryLike,
} from '../../lib/financeiro-core'

const NOW = new Date('2026-09-22T12:00:00')
const cli = (id: string, name: string, tier?: string) => ({ id, name, tier })

function pay(p: Partial<PaymentLike> & { client: PaymentLike['client'] }): PaymentLike {
  return { id: Math.random().toString(36).slice(2), month: 9, year: 2026, amount: 100, dueDate: '2026-09-25T12:00:00Z', status: 'PENDENTE', kind: 'RECORRENTE', service: { id: 's', serviceName: 'Social', contractType: 'RECORRENTE' }, ...p }
}
function charge(c: Partial<ChargeLike> & { clientId: string; name: string }): ChargeLike {
  return { id: `ch-${c.clientId}`, status: 'PENDING', value: '250.00', dueDate: '2026-09-20T12:00:00Z', client: { id: c.clientId, name: c.name }, ...c }
}
function entry(e: Partial<EntryLike>): EntryLike {
  return { id: Math.random().toString(36).slice(2), type: 'CUSTO', category: 'Softwares e ferramentas', description: 'Adobe', amount: 50, dueDate: '2026-09-25', status: 'PENDENTE', recurring: false, ...e }
}

test('vencimento passado e pendente é atrasado; pago nunca', () => {
  assert.equal(daysUntil('2026-09-20', NOW), -2)
  assert.equal(isOverdue({ status: 'PENDENTE', dueDate: '2026-09-20' }, NOW), true)
  assert.equal(isOverdue({ status: 'PAGO', dueDate: '2026-09-20' }, NOW), false)
  assert.equal(situationOf({ status: 'PENDENTE', dueDate: '2026-09-25' }, NOW), 'pendente')
  assert.equal(situationOf({ status: 'CANCELADO', dueDate: '2026-09-01' }, NOW), 'cancelado')
})

test('linhas de recebíveis: uma por parcela, cobrança do cliente junto, só-Asaas vira linha', () => {
  const nobre = cli('c1', 'Maria Nobre', 'GROWTH')
  const payments = [
    pay({ client: nobre, amount: 2000 }),
    pay({ client: nobre, amount: 1150, kind: 'AVULSO', service: { id: 's2', serviceName: 'SEO', contractType: 'AVULSO', billingDescription: 'SEO mensal' } }),
    pay({ client: cli('c2', 'CX Lab'), amount: 900, status: 'PAGO', paidAt: '2026-09-10' }),
  ]
  const charges = [charge({ clientId: 'c1', name: 'Maria Nobre' }), charge({ clientId: 'c9', name: 'Só Asaas', status: 'RECEIVED' })]
  const rows = buildReceivableRows(payments, charges, NOW)
  assert.equal(rows.length, 4)
  assert.equal(rows.filter((r) => r.client.id === 'c1').every((r) => r.charge?.id === 'ch-c1'), true)
  assert.equal(rows[1].label, 'SEO mensal')
  assert.equal(rows[1].kind, 'AVULSO')
  const asaas = rows.find((r) => r.kind === 'ASAAS')!
  assert.equal(asaas.amount, 250)
  assert.equal(asaas.situation, 'pago')
  assert.equal(rows[2].situation, 'pago')
})

test('contadores das abas e filtros', () => {
  const rows = buildReceivableRows([
    pay({ client: cli('c1', 'A'), dueDate: '2026-09-10T12:00:00Z' }),
    pay({ client: cli('c2', 'B'), dueDate: '2026-09-28T12:00:00Z' }),
    pay({ client: cli('c3', 'C'), status: 'PAGO' }),
  ], [], NOW)
  const costs = [entry({ dueDate: '2026-09-05' }), entry({ status: 'PAGO' })]
  const salaries = [entry({ type: 'SALARIO', dueDate: '2026-09-30', user: { id: 'u', name: 'Giovana' } })]
  assert.deepEqual(finTabCounts(rows, costs, salaries, NOW), { visao: 0, recebiveis: 2, atrasados: 2, custos: 1, salarios: 1 })
  assert.equal(filterReceivables(rows, { ...EMPTY_FIN_FILTERS, situation: 'atrasado' }).length, 1)
  assert.equal(filterReceivables(rows, { ...EMPTY_FIN_FILTERS, q: 'b' }).length, 1)
  assert.equal(filterEntries(salaries, { ...EMPTY_FIN_FILTERS, q: 'giov' }).length, 1)
  assert.equal(filterEntries(costs, { ...EMPTY_FIN_FILTERS, situation: 'pago' }, NOW).length, 1)
})

test('ordenação: atrasados antes, depois pendentes, depois pagos; totais por situação', () => {
  const rows = buildReceivableRows([
    pay({ client: cli('c1', 'Zeta'), status: 'PAGO', amount: 10 }),
    pay({ client: cli('c2', 'Alfa'), dueDate: '2026-09-28T12:00:00Z', amount: 20 }),
    pay({ client: cli('c3', 'Beta'), dueDate: '2026-09-01T12:00:00Z', amount: 30 }),
  ], [], NOW)
  assert.deepEqual(sortReceivables(rows, 'vencimento').map((r) => r.client.name), ['Beta', 'Alfa', 'Zeta'])
  assert.deepEqual(totalsBySituation(rows), { pago: 10, atrasado: 30, pendente: 20, cancelado: 0 })
})
