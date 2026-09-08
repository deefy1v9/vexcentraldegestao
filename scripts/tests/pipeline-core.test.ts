import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STAGES, STAGE_LABEL, OPEN_STAGES, isStage, isOpenStage, isClosedStage,
  itemCents, opportunityTotals, contractBasis, validateStageMove, priceWarnings,
  pipelineSummary, projectedTier, daysBetween, isFollowUpLate, isCompetence,
} from '../../lib/pipeline-core'

const RANGES = { startMaxCents: 150_000, growthMaxCents: 300_000 }

/* --------------------------------- etapas --------------------------------- */

test('as sete etapas do pipeline, com as duas de fechamento fora das abertas', () => {
  assert.equal(STAGES.length, 7)
  assert.deepEqual([...OPEN_STAGES], ['NOVO', 'EM_CONTATO', 'QUALIFICADO', 'PROPOSTA_ENVIADA', 'EM_NEGOCIACAO'])
  assert.ok(isStage('GANHO'))
  assert.equal(isStage('FECHADO'), false)
  assert.equal(isOpenStage('EM_NEGOCIACAO'), true)
  assert.equal(isOpenStage('GANHO'), false)
  assert.ok(isClosedStage('PERDIDO'))
  assert.equal(STAGE_LABEL.GANHO, 'Fechado — ganho')
})

/* --------------------------------- valores --------------------------------- */

test('valor do item: unitário, quantidade e desconto', () => {
  assert.equal(itemCents({ unitCents: 200000 }), 200000)
  assert.equal(itemCents({ unitCents: 30000, quantity: 4 }), 120000)
  assert.equal(itemCents({ unitCents: 30000, quantity: 4, discountCents: 20000 }), 100000)
  assert.equal(itemCents({ unitCents: 10000, discountCents: 999999 }), 0)
})

test('recorrente, avulso e projeto ficam em métricas separadas', () => {
  const totals = opportunityTotals([
    { contractType: 'RECORRENTE', unitCents: 200000, months: 6 },
    { contractType: 'AVULSO', unitCents: 80000, competence: '2026-09' },
    { contractType: 'PROJETO', unitCents: 300000, months: 3 },
  ])
  assert.equal(totals.recorrenteCents, 200000)
  assert.equal(totals.avulsoCents, 80000)
  assert.equal(totals.projetoMensalCents, 300000)
  // 2000×6 + 800 + 3000×3 = 12.000 + 800 + 9.000
  assert.equal(totals.totalContratoCents, 2180000)
  assert.equal(totals.months, 6)
  assert.equal(totals.usandoEstimativa, false)
})

test('mensalidade não é somada com o total do contrato', () => {
  const totals = opportunityTotals([{ contractType: 'RECORRENTE', unitCents: 200000, months: 12 }])
  assert.equal(totals.recorrenteCents, 200000)
  assert.equal(totals.totalContratoCents, 2400000)
  assert.equal(contractBasis(totals), 'recorrente × 12 meses')
})

test('projeto parcelado não vira receita recorrente', () => {
  const totals = opportunityTotals([{ contractType: 'PROJETO', unitCents: 100000, months: 5 }])
  assert.equal(totals.recorrenteCents, 0)
  assert.equal(totals.projetoMensalCents, 100000)
  assert.equal(totals.totalContratoCents, 500000)
})

test('por quantidade e personalizado contam como recorrente', () => {
  const totals = opportunityTotals([
    { contractType: 'QUANTIDADE', unitCents: 15000, quantity: 4 },
    { contractType: 'PERSONALIZADO', unitCents: 50000 },
  ])
  assert.equal(totals.recorrenteCents, 110000)
  assert.equal(totals.avulsoCents, 0)
})

test('sem itens, o valor exibido é a estimativa e vem marcado', () => {
  const totals = opportunityTotals([], 500000)
  assert.equal(totals.usandoEstimativa, true)
  assert.equal(totals.totalContratoCents, 500000)
  assert.equal(totals.recorrenteCents, 0)
  assert.equal(contractBasis(totals), null)
})

/* ------------------------------- validações ------------------------------- */

test('fechar como ganho exige composição de serviços', () => {
  const errors = validateStageMove({ from: 'EM_NEGOCIACAO', to: 'GANHO', items: [], estimateCents: 500000 })
  assert.ok(errors.some((e) => e.includes('detalhe os serviços')))
})

test('ganho exige competência no avulso e valor em todo item', () => {
  const semCompetencia = validateStageMove({
    from: 'EM_NEGOCIACAO', to: 'GANHO',
    items: [{ contractType: 'AVULSO', unitCents: 80000, name: 'E-book' }],
  })
  assert.ok(semCompetencia.some((e) => e.includes('competência')))

  const semValor = validateStageMove({
    from: 'EM_NEGOCIACAO', to: 'GANHO',
    items: [{ contractType: 'RECORRENTE', unitCents: 0, name: 'Social' }],
  })
  assert.ok(semValor.some((e) => e.includes('sem valor')))

  const ok = validateStageMove({
    from: 'EM_NEGOCIACAO', to: 'GANHO',
    items: [{ contractType: 'AVULSO', unitCents: 80000, competence: '2026-09', name: 'E-book' }],
  })
  assert.deepEqual(ok, [])
})

test('perder exige motivo', () => {
  assert.ok(validateStageMove({ from: 'EM_CONTATO', to: 'PERDIDO', items: [] })[0].includes('motivo'))
  assert.deepEqual(validateStageMove({ from: 'EM_CONTATO', to: 'PERDIDO', items: [], lossReason: 'Preço' }), [])
})

test('oportunidade convertida não volta por movimentação comum', () => {
  const errors = validateStageMove({ from: 'GANHO', to: 'EM_NEGOCIACAO', items: [], converted: true })
  assert.ok(errors[0].includes('reabertura'))
})

test('mover para a mesma etapa não gera erro', () => {
  assert.deepEqual(validateStageMove({ from: 'NOVO', to: 'NOVO', items: [] }), [])
})

test('faixa do catálogo apenas avisa', () => {
  const avisos = priceWarnings([
    { name: 'SEO', unitCents: 30000, catalogMinCents: 50000, catalogMaxCents: 55000 },
    { name: 'Tráfego', unitCents: 200000, catalogMinCents: 80000, catalogMaxCents: 100000 },
    { name: 'Blog', unitCents: 60000, catalogMinCents: 40000, catalogMaxCents: 135000 },
  ])
  assert.equal(avisos.length, 2)
  assert.ok(avisos[0].includes('abaixo'))
  assert.ok(avisos[1].includes('acima'))
})

test('competência só aceita AAAA-MM', () => {
  assert.ok(isCompetence('2026-09'))
  assert.equal(isCompetence('2026-13'), false)
  assert.equal(isCompetence('09/2026'), false)
})

/* --------------------------- resumo do dashboard --------------------------- */

const JAN = new Date('2026-09-01T00:00:00Z')
const FIM = new Date('2026-09-30T23:59:59Z')

test('cada oportunidade entra uma única vez no resumo', () => {
  const resumo = pipelineSummary([
    {
      id: 'a', stage: 'EM_NEGOCIACAO', expectedCloseDate: '2026-09-20',
      items: [{ contractType: 'RECORRENTE', unitCents: 200000 }, { contractType: 'AVULSO', unitCents: 80000, competence: '2026-09' }],
    },
    { id: 'b', stage: 'QUALIFICADO', expectedCloseDate: '2026-09-10', items: [{ contractType: 'RECORRENTE', unitCents: 100000 }] },
    { id: 'c', stage: 'NOVO', expectedCloseDate: null, items: [{ contractType: 'RECORRENTE', unitCents: 999999 }] },
    { id: 'd', stage: 'GANHO', closedAt: '2026-09-05', items: [{ contractType: 'RECORRENTE', unitCents: 150000 }] },
    { id: 'e', stage: 'PERDIDO', closedAt: '2026-09-07', lossReason: 'preço', items: [] } as never,
    { id: 'f', stage: 'EM_CONTATO', expectedCloseDate: '2026-10-15', items: [{ contractType: 'RECORRENTE', unitCents: 700000 }] },
  ], JAN, FIM)

  assert.equal(resumo.abertas, 2)
  assert.equal(resumo.mrrPotencialCents, 300000)
  assert.equal(resumo.avulsoPotencialCents, 80000)
  assert.equal(resumo.semPrevisao, 1)
  assert.equal(resumo.ganhas, 1)
  assert.equal(resumo.ganhasRecorrenteCents, 150000)
  assert.equal(resumo.perdidas, 1)
})

test('ganhas e perdidas saem do potencial em aberto', () => {
  const resumo = pipelineSummary([
    { id: 'a', stage: 'GANHO', expectedCloseDate: '2026-09-10', closedAt: '2026-09-10', items: [{ contractType: 'RECORRENTE', unitCents: 200000 }] },
    { id: 'b', stage: 'PERDIDO', expectedCloseDate: '2026-09-12', closedAt: '2026-09-12', items: [{ contractType: 'RECORRENTE', unitCents: 300000 }] },
  ], JAN, FIM)
  assert.equal(resumo.abertas, 0)
  assert.equal(resumo.mrrPotencialCents, 0)
  assert.equal(resumo.ganhas, 1)
  assert.equal(resumo.perdidas, 1)
})

test('oportunidade fora do período não entra', () => {
  const resumo = pipelineSummary([
    { id: 'a', stage: 'EM_NEGOCIACAO', expectedCloseDate: '2026-12-01', items: [{ contractType: 'RECORRENTE', unitCents: 500000 }] },
    { id: 'b', stage: 'GANHO', closedAt: '2026-08-30', items: [{ contractType: 'RECORRENTE', unitCents: 400000 }] },
  ], JAN, FIM)
  assert.equal(resumo.abertas, 0)
  assert.equal(resumo.ganhas, 0)
})

/* ------------------------------ grupo previsto ------------------------------ */

test('grupo previsto soma o ticket atual com o recorrente negociado', () => {
  const totals = opportunityTotals([{ contractType: 'RECORRENTE', unitCents: 100000 }])
  assert.deepEqual(projectedTier(100000, totals, RANGES), { ticketCents: 200000, tier: 'GROWTH' })
  assert.deepEqual(projectedTier(0, totals, RANGES), { ticketCents: 100000, tier: 'START' })
  assert.deepEqual(projectedTier(250000, totals, RANGES), { ticketCents: 350000, tier: 'SCALE' })
})

test('só avulso não gera grupo previsto', () => {
  const totals = opportunityTotals([{ contractType: 'AVULSO', unitCents: 500000, competence: '2026-09' }])
  assert.deepEqual(projectedTier(0, totals, RANGES), { ticketCents: 0, tier: null })
})

/* ------------------------------ acompanhamento ------------------------------ */

test('tempo na etapa e contato atrasado', () => {
  assert.equal(daysBetween('2026-09-01', '2026-09-08'), 7)
  assert.equal(daysBetween('2026-09-08', '2026-09-08'), 0)
  const hoje = new Date('2026-09-08T12:00:00Z')
  assert.equal(isFollowUpLate('2026-09-05', hoje), true)
  assert.equal(isFollowUpLate('2026-09-08', hoje), false)
  assert.equal(isFollowUpLate('2026-09-20', hoje), false)
  assert.equal(isFollowUpLate(null, hoje), false)
})
