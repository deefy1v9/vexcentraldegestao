import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  serviceCents, serviceInCompetence, competenceBreakdown, computeCompetenceCents,
  recurringTicketCents, recommendTierCents, isRecurringType, countsForMrr,
  nthBusinessDayISO, dueDateForRule, isDueRule, DUE_RULES,
  DEFAULT_TIER_RANGES,
} from '../../lib/billing-core'
import { isContractType, CONTRACT_TYPES } from '../../lib/services-catalog'

const client = { status: 'ATIVO', contractEnd: null }

/* --------------------------- valor da contratação --------------------------- */

test('valor do serviço: centavos, quantidade e desconto', () => {
  assert.equal(serviceCents({ priceCents: 150000, status: 'ATIVO' }), 150000)
  // valor legado em reais continua válido
  assert.equal(serviceCents({ monthlyValue: 1500, priceCents: null, status: 'ATIVO' }), 150000)
  // quantidade multiplica e desconto abate
  assert.equal(serviceCents({ priceCents: 30000, quantity: 3, status: 'ATIVO' }), 90000)
  assert.equal(serviceCents({ priceCents: 30000, quantity: 3, discountCents: 10000, status: 'ATIVO' }), 80000)
  // nunca negativo
  assert.equal(serviceCents({ priceCents: 10000, discountCents: 99999, status: 'ATIVO' }), 0)
})

test('tipos de contratação reconhecidos', () => {
  for (const t of CONTRACT_TYPES) assert.ok(isContractType(t))
  assert.equal(isContractType('MENSAL'), false)
  assert.equal(isRecurringType('AVULSO'), false)
  assert.equal(isRecurringType(undefined), true) // padrão é recorrente
  assert.equal(countsForMrr('PROJETO'), false) // projeto é previsto, mas não é MRR
  assert.equal(countsForMrr('QUANTIDADE'), true)
})

/* ------------------------------ avulso × recorrente ------------------------------ */

test('serviço avulso entra só na competência escolhida', () => {
  const avulso = { priceCents: 50000, status: 'ATIVO', contractType: 'AVULSO', competence: '2026-09' }
  assert.equal(serviceInCompetence(avulso, 2026, 9), true)
  assert.equal(serviceInCompetence(avulso, 2026, 10), false)
  assert.equal(serviceInCompetence(avulso, 2026, 8), false)
})

test('serviço recorrente vale em todos os meses da vigência', () => {
  const rec = {
    priceCents: 100000, status: 'ATIVO', contractType: 'RECORRENTE',
    startDate: new Date('2026-08-01'), endDate: null,
  }
  assert.equal(serviceInCompetence(rec, 2026, 7), false) // antes do início
  assert.equal(serviceInCompetence(rec, 2026, 8), true)
  assert.equal(serviceInCompetence(rec, 2027, 3), true)
})

test('avulso não entra no ticket recorrente nem no MRR', () => {
  const services = [
    { priceCents: 200000, status: 'ATIVO', contractType: 'RECORRENTE', startDate: new Date('2026-01-01') },
    { priceCents: 500000, status: 'ATIVO', contractType: 'AVULSO', competence: '2026-09' },
  ]
  assert.equal(recurringTicketCents(services, '2026-09-10'), 200000)
})

test('projeto conta na previsão do mês mas fica fora do ticket', () => {
  const services = [
    { priceCents: 100000, status: 'ATIVO', contractType: 'RECORRENTE', startDate: new Date('2026-01-01') },
    { priceCents: 300000, status: 'ATIVO', contractType: 'PROJETO', startDate: new Date('2026-01-01') },
  ]
  assert.equal(recurringTicketCents(services, '2026-09-10'), 100000)
  assert.equal(computeCompetenceCents(client, services, 2026, 9), 400000)
})

test('detalhamento da competência separa recorrente de avulso', () => {
  const services = [
    { id: 's1', serviceName: 'Social Media', priceCents: 150000, status: 'ATIVO', contractType: 'RECORRENTE', startDate: new Date('2026-01-01') },
    { id: 's2', serviceName: 'Landing page', priceCents: 250000, status: 'ATIVO', contractType: 'AVULSO', competence: '2026-09' },
    { id: 's3', serviceName: 'Antigo', priceCents: 90000, status: 'ENCERRADO', contractType: 'RECORRENTE' },
    { id: 's4', serviceName: 'Pausado', priceCents: 80000, status: 'PAUSADO', contractType: 'RECORRENTE' },
  ]
  const b = competenceBreakdown(client, services, 2026, 9)
  assert.equal(b.recurringCents, 150000)
  assert.equal(b.avulsoCents, 250000)
  assert.equal(b.totalCents, 400000)
  assert.deepEqual(b.items.map((i) => i.serviceId), ['s1', 's2'])
  assert.deepEqual(b.items.map((i) => i.kind), ['RECORRENTE', 'AVULSO'])
})

test('descrição da cobrança usa o texto da contratação quando existe', () => {
  const b = competenceBreakdown(client, [
    { id: 's1', serviceName: 'Tráfego', billingDescription: 'Gestão de tráfego — setembro', priceCents: 100000, status: 'ATIVO', contractType: 'RECORRENTE' },
  ], 2026, 9)
  assert.equal(b.items[0].description, 'Gestão de tráfego — setembro')
})

test('serviço pausado ou encerrado sai da previsão e do ticket', () => {
  const services = [
    { priceCents: 100000, status: 'PAUSADO', contractType: 'RECORRENTE' },
    { priceCents: 100000, status: 'ENCERRADO', contractType: 'RECORRENTE' },
  ]
  assert.equal(computeCompetenceCents(client, services, 2026, 9), 0)
  assert.equal(recurringTicketCents(services, '2026-09-10'), 0)
})

test('cliente inativo não gera previsão', () => {
  const services = [{ priceCents: 100000, status: 'ATIVO', contractType: 'RECORRENTE' }]
  assert.equal(computeCompetenceCents({ status: 'INATIVO', contractEnd: null }, services, 2026, 9), 0)
})

/* -------------------------------- classificação -------------------------------- */

test('faixas do grupo: 1.500,00 é Start e 1.500,01 é Growth', () => {
  assert.equal(recommendTierCents(149999), 'START')
  assert.equal(recommendTierCents(150000), 'START') // limite inclusivo
  assert.equal(recommendTierCents(150001), 'GROWTH')
  assert.equal(recommendTierCents(300000), 'GROWTH') // limite inclusivo
  assert.equal(recommendTierCents(300001), 'SCALE')
})

test('sem serviço recorrente ativo o cliente fica não classificado', () => {
  assert.equal(recommendTierCents(0), null)
  assert.equal(recommendTierCents(-1), null)
  const services = [{ priceCents: 500000, status: 'ATIVO', contractType: 'AVULSO', competence: '2026-09' }]
  assert.equal(recommendTierCents(recurringTicketCents(services, '2026-09-10')), null)
})

test('faixas padrão são 1.500,00 e 3.000,00', () => {
  assert.equal(DEFAULT_TIER_RANGES.startMaxCents, 150_000)
  assert.equal(DEFAULT_TIER_RANGES.growthMaxCents, 300_000)
})

test('faixas configuradas substituem o padrão', () => {
  const ranges = { startMaxCents: 100_000, growthMaxCents: 250_000 }
  assert.equal(recommendTierCents(100000, ranges), 'START')
  assert.equal(recommendTierCents(100001, ranges), 'GROWTH')
  assert.equal(recommendTierCents(250001, ranges), 'SCALE')
})

test('ticket recorrente ignora serviço que ainda não começou ou já terminou', () => {
  const services = [
    { priceCents: 100000, status: 'ATIVO', contractType: 'RECORRENTE', startDate: new Date('2026-12-01') },
    { priceCents: 200000, status: 'ATIVO', contractType: 'RECORRENTE', endDate: new Date('2026-08-31') },
    { priceCents: 300000, status: 'ATIVO', contractType: 'RECORRENTE', startDate: new Date('2026-01-01') },
  ]
  assert.equal(recurringTicketCents(services, '2026-09-10'), 300000)
})

/* -------------------------------- idempotência -------------------------------- */

test('mesma competência calculada duas vezes dá o mesmo valor', () => {
  const services = [
    { id: 'a', priceCents: 150000, status: 'ATIVO', contractType: 'RECORRENTE', startDate: new Date('2026-01-01') },
    { id: 'b', priceCents: 70000, status: 'ATIVO', contractType: 'AVULSO', competence: '2026-09' },
  ]
  const first = competenceBreakdown(client, services, 2026, 9)
  const second = competenceBreakdown(client, services, 2026, 9)
  assert.deepEqual(first, second)
  // e o avulso não se repete no mês seguinte
  assert.equal(competenceBreakdown(client, services, 2026, 10).totalCents, 150000)
})

/* ------------------------------ dia útil ------------------------------ */

test('5º dia útil pula fim de semana e feriado nacional', () => {
  // set/2026: 1,2,3,4 úteis; 5 e 6 fim de semana; 7 é a Independência
  assert.equal(nthBusinessDayISO(2026, 9, 5), '2026-09-08')
  // out/2026: 1,2 úteis; 3 e 4 fim de semana; 5,6,7 úteis
  assert.equal(nthBusinessDayISO(2026, 10, 5), '2026-10-07')
  // nov/2026: dia 2 é Finados (segunda), então 3,4,5,6 e 9
  assert.equal(nthBusinessDayISO(2026, 11, 5), '2026-11-09')
  // jan/2027: dia 1 é feriado e cai numa sexta
  assert.equal(nthBusinessDayISO(2027, 1, 5), '2027-01-08')
  // fev/2027: começa numa segunda, sem feriado antes do 5º dia útil
  assert.equal(nthBusinessDayISO(2027, 2, 5), '2027-02-05')
})

test('1º dia útil e ordinal alto continuam dentro do mês', () => {
  assert.equal(nthBusinessDayISO(2026, 11, 1), '2026-11-03')
  // dez/2026 tem 22 dias úteis (25 é Natal): pedir 30 devolve o último
  assert.equal(nthBusinessDayISO(2026, 12, 30), '2026-12-31')
})

test('regra de vencimento: dia fixo continua sendo dia fixo', () => {
  assert.equal(dueDateForRule(2026, 9, 5, 'DIA_FIXO'), '2026-09-05')
  assert.equal(dueDateForRule(2026, 9, 5, null), '2026-09-05')
  assert.equal(dueDateForRule(2026, 9, 5, 'DIA_UTIL'), '2026-09-08')
  // dia 31 em mês curto vira o último dia
  assert.equal(dueDateForRule(2027, 2, 31, 'DIA_FIXO'), '2027-02-28')
})

test('DUE_RULES aceita só as duas regras conhecidas', () => {
  assert.deepEqual([...DUE_RULES], ['DIA_FIXO', 'DIA_UTIL'])
  assert.ok(isDueRule('DIA_UTIL'))
  assert.equal(isDueRule('QUINTO_DIA'), false)
})
