import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chargeableServices, competenceBreakdown, competenceReferenceISO, currentCompetence, isBeforeCompetence,
  revenueBooking,
} from '../../lib/billing-core'

const ativo = { status: 'ATIVO', contractEnd: null }

test('cobrança manual fica fora do Asaas, mas a parcela continua prevista', () => {
  const services = [
    { id: 'auto', serviceName: 'Social', status: 'ATIVO', priceCents: 200_000, generateCharge: true },
    { id: 'pix', serviceName: 'Tráfego', status: 'ATIVO', priceCents: 100_000, generateCharge: false },
  ]
  // previsão (a receber) soma os dois
  assert.equal(competenceBreakdown(ativo, services, 2026, 11).totalCents, 300_000)
  // cobrança Asaas só o automático
  const cobrado = competenceBreakdown(ativo, chargeableServices(services), 2026, 11)
  assert.equal(cobrado.totalCents, 200_000)
  assert.deepEqual(cobrado.items.map((i) => i.serviceId), ['auto'])
})

test('baixa do Asaas: só as parcelas da cobrança e nunca em dobro', () => {
  const itens = [{ serviceId: 's1', kind: 'RECORRENTE' }]
  // pendente da cobrança é baixada; a do serviço manual não
  assert.deepEqual(
    revenueBooking([
      { id: 'p1', serviceId: 's1', status: 'PENDENTE' },
      { id: 'p2', serviceId: 'pix', status: 'PENDENTE', manual: true },
    ], itens),
    { action: 'baixar', ids: ['p1'] },
  )
  // já baixada à mão (Pix direto / recebido em dinheiro): não cria outra paga
  assert.deepEqual(revenueBooking([{ id: 'p1', serviceId: 's1', status: 'PAGO' }], itens), { action: 'nada' })
  // nenhuma parcela: cria uma, preservando o tipo
  assert.deepEqual(revenueBooking([], [{ serviceId: 'a', kind: 'AVULSO' }]), { action: 'criar', kind: 'AVULSO' })
  assert.deepEqual(revenueBooking([], itens), { action: 'criar', kind: 'RECORRENTE' })
  // cobrança antiga sem itens: ignora parcela de serviço manual
  assert.deepEqual(
    revenueBooking([
      { id: 'p1', serviceId: 's1', status: 'PENDENTE' },
      { id: 'p2', serviceId: 'pix', status: 'PENDENTE', manual: true },
    ], []),
    { action: 'baixar', ids: ['p1'] },
  )
  // parcela cancelada não conta como existente
  assert.deepEqual(revenueBooking([{ id: 'p1', serviceId: 's1', status: 'CANCELADO' }], itens), { action: 'criar', kind: 'RECORRENTE' })
})

test('competência corrente em São Paulo e meses passados', () => {
  // 01/11 00:30 em Brasília ainda é 31/10 03:30 UTC → já é novembro
  assert.deepEqual(currentCompetence(new Date('2026-11-01T03:30:00Z')), { year: 2026, month: 11 })
  // 31/10 23:30 em Brasília = 01/11 02:30 UTC → ainda é outubro
  assert.deepEqual(currentCompetence(new Date('2026-11-01T02:30:00Z')), { year: 2026, month: 10 })
  const atual = { year: 2026, month: 10 }
  assert.equal(isBeforeCompetence(2026, 9, atual), true)
  assert.equal(isBeforeCompetence(2025, 12, atual), true)
  assert.equal(isBeforeCompetence(2026, 10, atual), false)
  assert.equal(isBeforeCompetence(2027, 1, atual), false)
})

test('referência do MRR: hoje no mês corrente, último dia nos demais', () => {
  assert.equal(competenceReferenceISO(2026, 10, '2026-10-28'), '2026-10-28')
  assert.equal(competenceReferenceISO(2026, 9, '2026-10-28'), '2026-09-30')
  assert.equal(competenceReferenceISO(2026, 2, '2026-10-28'), '2026-02-28')
})
