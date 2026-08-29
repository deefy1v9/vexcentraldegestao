import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PLANNER_CONFIG, addDaysISO, weekdayISO, competencesBetween, competenceRange,
  competenceOf, weekStartISO, easterISO, brazilHolidays, holidaySet, allowedWeekdays,
  isPublishableDay, spreadPick, planDeliveryDates, chooseGroup, internalDeadlines,
  planItemRef, detectConflicts, suggestBestDate, tierWeightOf, isValidISO, diffDaysISO,
  type PlannerConfig, type DeliverySpec, type PlanItemDraft,
} from '../../lib/planner-core'
import { sanitizeExtraction, toDeliverySpecs, serviceKeyOf, parseExtraction } from '../../lib/contract-ai'

/**
 * Testes das regras do planejamento operacional.
 *
 * Nada aqui chama a IA real, toca o banco, cria demanda ou dispara
 * notificação: são funções puras validadas com dados de exemplo.
 */

const cfg: PlannerConfig = { ...DEFAULT_PLANNER_CONFIG }
const noHolidays = new Set<string>()

function spec(partial: Partial<DeliverySpec> = {}): DeliverySpec {
  return {
    serviceKey: 'social-media',
    label: 'Social media',
    quantity: 8,
    frequency: 'MENSAL',
    weekdays: [],
    specificDates: [],
    ...partial,
  }
}

/* --------------------------------- datas --------------------------------- */

test('aritmética de datas no dia civil, sem deslocar por fuso', () => {
  assert.equal(addDaysISO('2026-03-01', -1), '2026-02-28')
  assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01')
  // Virada do horário de verão no hemisfério sul não move o dia
  assert.equal(addDaysISO('2026-10-17', 1), '2026-10-18')
  assert.equal(diffDaysISO('2026-09-01', '2026-09-15'), 14)
})

test('dia da semana ISO: 1 segunda, 7 domingo', () => {
  assert.equal(weekdayISO('2026-08-31'), 1) // segunda
  assert.equal(weekdayISO('2026-09-05'), 6) // sábado
  assert.equal(weekdayISO('2026-09-06'), 7) // domingo
  assert.equal(weekStartISO('2026-09-06'), '2026-08-31')
})

test('competências e intervalos', () => {
  assert.equal(competenceOf('2026-09-15'), '2026-09')
  assert.deepEqual(competenceRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' })
  assert.deepEqual(competencesBetween('2026-11-10', '2027-01-05'), ['2026-11', '2026-12', '2027-01'])
  // Formato e data precisam ser válidos — mês 13 é recusado
  assert.equal(isValidISO('2026-09-15'), true)
  assert.equal(isValidISO('2026-13-40'), false)
  assert.equal(isValidISO('15/09/2026'), false)
  assert.equal(isValidISO(null), false)
})

/* -------------------------------- feriados -------------------------------- */

test('feriados móveis derivam da Páscoa (calculados, não chumbados)', () => {
  assert.equal(easterISO(2026), '2026-04-05')
  const h = brazilHolidays(2026)
  assert.ok(h.includes('2026-04-03')) // Sexta-feira Santa
  assert.ok(h.includes('2026-02-16')) // Carnaval (segunda)
  assert.ok(h.includes('2026-06-04')) // Corpus Christi
  assert.ok(h.includes('2026-12-25'))
})

test('feriado bloqueia publicação quando o modo é pular', () => {
  const holidays = holidaySet('2026-09-01', '2026-09-30')
  assert.equal(isPublishableDay('2026-09-07', cfg, holidays), false) // Independência
  assert.equal(isPublishableDay('2026-09-08', cfg, holidays), true)
  const allowCfg: PlannerConfig = { ...cfg, holidayMode: 'allow' }
  assert.equal(isPublishableDay('2026-09-07', allowCfg, holidays), true)
})

test('sábado só entra quando permitido; domingo fica bloqueado por padrão', () => {
  assert.deepEqual(allowedWeekdays(cfg, [1, 3, 5, 6, 7]), [1, 3, 5])
  assert.deepEqual(allowedWeekdays({ ...cfg, allowSaturday: true }, [2, 4, 6]), [2, 4, 6])
  assert.deepEqual(allowedWeekdays({ ...cfg, allowSunday: true }, [7]), [7])
  assert.equal(isPublishableDay('2026-09-06', cfg, noHolidays), false) // domingo
  assert.equal(isPublishableDay('2026-09-05', { ...cfg, allowSaturday: true }, noHolidays), true)
})

/* ------------------------------ distribuição ------------------------------ */

test('distribuição espalha sem concentrar no começo', () => {
  const days = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
  assert.deepEqual(spreadPick(days, 2), ['a', 'f'])
  assert.deepEqual(spreadPick(days, 5), ['a', 'c', 'e', 'g', 'i'])
  assert.equal(spreadPick(days, 20).length, 10) // nunca inventa dia
  assert.deepEqual(spreadPick([], 3), [])
})

test('8 posts mensais continuam 8 — nunca viram 12', () => {
  const r = planDeliveryDates({
    spec: spec({ quantity: 8 }),
    periodStart: '2026-09-01', periodEnd: '2026-09-30',
    weekdays: cfg.groupADays, cfg, holidays: noHolidays,
  })
  assert.equal(r.dates.length, 8)
  assert.ok(r.dates.every((d) => d >= '2026-09-01' && d <= '2026-09-30'))
  assert.ok(r.dates.every((d) => cfg.groupADays.includes(weekdayISO(d))))
})

test('12 posts mensais respeitam a competência de cada mês', () => {
  const r = planDeliveryDates({
    spec: spec({ quantity: 12 }),
    periodStart: '2026-09-01', periodEnd: '2026-10-31',
    weekdays: cfg.groupADays, cfg, holidays: noHolidays,
  })
  const set = new Map<string, number>()
  for (const d of r.dates) set.set(competenceOf(d), (set.get(competenceOf(d)) ?? 0) + 1)
  assert.equal(set.get('2026-09'), 12)
  assert.equal(set.get('2026-10'), 12)
})

test('3 posts por semana seguem a frequência semanal', () => {
  const r = planDeliveryDates({
    spec: spec({ quantity: 3, frequency: 'SEMANAL' }),
    periodStart: '2026-09-01', periodEnd: '2026-09-28',
    weekdays: cfg.groupADays, cfg, holidays: noHolidays,
  })
  const weeks = new Map<string, number>()
  for (const d of r.dates) weeks.set(weekStartISO(d), (weeks.get(weekStartISO(d)) ?? 0) + 1)
  assert.ok([...weeks.values()].every((n) => n <= 3))
  assert.ok([...weeks.values()].some((n) => n === 3))
})

test('entrega única não vira recorrência', () => {
  const r = planDeliveryDates({
    spec: spec({ quantity: 1, frequency: 'UNICA' }),
    periodStart: '2026-09-01', periodEnd: '2026-12-31',
    weekdays: cfg.groupADays, cfg, holidays: noHolidays,
  })
  assert.equal(r.dates.length, 1)
})

test('dias definidos no contrato têm prioridade sobre a sugestão', () => {
  const r = planDeliveryDates({
    spec: spec({ quantity: 4, weekdays: [2] }), // terça, contra o grupo A
    periodStart: '2026-09-01', periodEnd: '2026-09-30',
    weekdays: cfg.groupADays, cfg, holidays: noHolidays,
  })
  assert.equal(r.fromContract, true)
  assert.ok(r.dates.every((d) => weekdayISO(d) === 2))
})

test('datas específicas do contrato mandam, mesmo em feriado', () => {
  const holidays = holidaySet('2026-09-01', '2026-09-30')
  const r = planDeliveryDates({
    spec: spec({ specificDates: ['2026-09-07', '2026-09-15', '2025-01-01'] }),
    periodStart: '2026-09-01', periodEnd: '2026-09-30',
    weekdays: cfg.groupADays, cfg, holidays,
  })
  assert.deepEqual(r.dates, ['2026-09-07', '2026-09-15'])
  assert.ok(r.notes.some((n) => n.includes('feriado')))
  assert.ok(r.notes.some((n) => n.includes('fora da vigência')))
})

test('contrato sem frequência: distribuição mensal sugerida e sinalizada', () => {
  const r = planDeliveryDates({
    spec: spec({ quantity: null, frequency: 'INDEFINIDA' }),
    periodStart: '2026-09-01', periodEnd: '2026-09-30',
    weekdays: cfg.groupADays, cfg, holidays: noHolidays,
  })
  assert.equal(r.dates.length, 1) // sem quantidade, uma por competência
  assert.ok(r.notes.some((n) => n.includes('sugerida pela IA')))
})

test('nada é planejado fora da vigência do contrato', () => {
  const r = planDeliveryDates({
    spec: spec({ quantity: 8 }),
    periodStart: '2026-09-10', periodEnd: '2026-09-20',
    weekdays: cfg.groupADays, cfg, holidays: noHolidays,
  })
  assert.ok(r.dates.every((d) => d >= '2026-09-10' && d <= '2026-09-20'))
  assert.ok(r.notes.some((n) => n.includes('couberam')))
})

/* -------------------------------- grupos -------------------------------- */

test('grupo é escolhido pela carga, não por alternância', () => {
  // Grupo A (seg/qua/sex) lotado; B precisa vencer
  const loadByDate: Record<string, number> = {}
  for (let i = 1; i <= 30; i++) {
    const iso = `2026-09-${String(i).padStart(2, '0')}`
    if (cfg.groupADays.includes(weekdayISO(iso))) loadByDate[iso] = 9
  }
  const choice = chooseGroup({
    cfg, loadByDate, clientsInA: 3, clientsInB: 3,
    periodStart: '2026-09-01', periodEnd: '2026-09-30',
    holidays: noHolidays, deliveriesPerMonth: 8,
  })
  assert.equal(choice.group, 'B')
  assert.ok(choice.scoreB < choice.scoreA)
})

test('empate no grupo resolve pelo lado com menos clientes', () => {
  const choice = chooseGroup({
    cfg, loadByDate: {}, clientsInA: 5, clientsInB: 1,
    periodStart: '2026-09-01', periodEnd: '2026-09-30',
    holidays: noHolidays, deliveriesPerMonth: 8,
  })
  assert.equal(choice.group, 'B')
})

/* ---------------------------- prazos internos ---------------------------- */

test('prazos internos são regressivos a partir da publicação', () => {
  // Sexta 11/09/2026: produção D-2 (quarta), revisão D-1 (quinta)
  const d = internalDeadlines('2026-09-11', cfg, noHolidays)
  assert.equal(d.publish, '2026-09-11')
  assert.equal(d.review, '2026-09-10')
  assert.equal(d.production, '2026-09-09')
  assert.ok(d.production < d.review && d.review < d.publish)
})

test('prazo interno recua quando cai em dia não útil', () => {
  // Publicação segunda 14/09; D-1 seria domingo → recua para sexta
  const d = internalDeadlines('2026-09-14', cfg, noHolidays)
  assert.equal(weekdayISO(d.review), 5)
  assert.ok(d.review < '2026-09-14')
})

test('antecedências configuráveis mudam os prazos', () => {
  const custom: PlannerConfig = { ...cfg, leadProduction: 4, leadReview: 3, leadApproval: 2, leadSchedule: 1 }
  const d = internalDeadlines('2026-09-18', custom, noHolidays) // sexta
  assert.equal(d.production, '2026-09-14')
  assert.equal(d.review, '2026-09-15')
  assert.equal(d.approval, '2026-09-16')
  assert.equal(d.schedule, '2026-09-17')
})

/* ----------------------------- idempotência ----------------------------- */

test('referência do item é determinística e reexecutar não duplica', () => {
  const a = planItemRef({ clientId: 'cli1', serviceKey: 'Social Media', competence: '2026-09', sequence: 3 })
  const b = planItemRef({ clientId: 'cli1', serviceKey: 'social-media', competence: '2026-09', sequence: 3 })
  assert.equal(a, b)
  assert.equal(a, 'plan:cli1:social-media:2026-09:03')
  assert.notEqual(a, planItemRef({ clientId: 'cli1', serviceKey: 'social-media', competence: '2026-10', sequence: 3 }))
})

test('mesma análise repetida gera exatamente as mesmas referências', () => {
  const run = () => planDeliveryDates({
    spec: spec({ quantity: 8 }),
    periodStart: '2026-09-01', periodEnd: '2026-09-30',
    weekdays: cfg.groupADays, cfg, holidays: noHolidays,
  }).dates.map((d, i) => planItemRef({ clientId: 'cli1', serviceKey: 'social', competence: competenceOf(d), sequence: i + 1 }))
  assert.deepEqual(run(), run())
})

/* -------------------------------- conflitos -------------------------------- */

function draft(partial: Partial<PlanItemDraft> = {}): PlanItemDraft {
  const publishAt = partial.publishAt ?? '2026-09-11'
  const d = internalDeadlines(publishAt, cfg, noHolidays)
  return {
    ref: 'plan:cli1:social:2026-09:01',
    clientId: 'cli1',
    serviceKey: 'social',
    title: 'Post institucional',
    competence: '2026-09',
    publishAt,
    production: d.production,
    review: d.review,
    approval: d.approval,
    schedule: d.schedule,
    assigneeId: 'user1',
    reviewerId: 'user2',
    schedulerId: 'user1',
    priority: 'MEDIA',
    weekGroup: 'A',
    origin: 'IA',
    confidence: 0.8,
    notes: [],
    ...partial,
  }
}

const emptyCtx = {
  cfg, holidays: noHolidays,
  contractStart: '2026-09-01', contractEnd: '2026-12-31',
  loadByDate: {}, loadByUserDate: {}, existingTitles: {},
}

test('conflito: item duplicado na própria proposta', () => {
  const items = [draft(), draft()]
  const c = detectConflicts(items, emptyCtx)
  assert.ok(c[items[0].ref].some((x) => x.kind === 'DUPLICADA' && x.blocking))
})

test('conflito: demanda igual já existente no sistema', () => {
  const item = draft()
  const c = detectConflicts([item], {
    ...emptyCtx,
    existingTitles: { 'cli1:2026-09-11': ['post institucional'] },
  })
  assert.ok(c[item.ref].some((x) => x.kind === 'DUPLICADA_EXISTENTE' && x.blocking))
})

test('conflito: data fora da vigência do contrato', () => {
  const before = draft({ ref: 'r1', publishAt: '2026-08-20' })
  const after = draft({ ref: 'r2', publishAt: '2027-01-15' })
  const c = detectConflicts([before, after], emptyCtx)
  assert.ok(c.r1.some((x) => x.kind === 'FORA_CONTRATO' && x.blocking))
  assert.ok(c.r2.some((x) => x.kind === 'FORA_CONTRATO' && x.blocking))
})

test('conflito: sem responsável avisa mas não bloqueia a prévia', () => {
  const item = draft({ assigneeId: null })
  const c = detectConflicts([item], emptyCtx)
  const conflict = c[item.ref].find((x) => x.kind === 'SEM_RESPONSAVEL')
  assert.ok(conflict)
  assert.equal(conflict?.blocking, false)
})

test('conflito: excesso de entregas no dia e por colaborador', () => {
  const small: PlannerConfig = { ...cfg, capacityPerDay: 2, capacityPerUser: 1 }
  const items = [1, 2, 3].map((n) => draft({ ref: `r${n}`, title: `Post ${n}` }))
  const c = detectConflicts(items, { ...emptyCtx, cfg: small })
  assert.ok(c.r3.some((x) => x.kind === 'EXCESSO_DIA'))
  assert.ok(c.r2.some((x) => x.kind === 'EXCESSO_COLABORADOR'))
})

test('conflito: feriado e prazo interno inválido', () => {
  const holidays = holidaySet('2026-09-01', '2026-09-30')
  const item = draft({ ref: 'h1', publishAt: '2026-09-07' })
  const bad = draft({ ref: 'p1', production: '2026-09-20' })
  const c = detectConflicts([item, bad], { ...emptyCtx, holidays })
  assert.ok(c.h1.some((x) => x.kind === 'FERIADO'))
  assert.ok(c.p1.some((x) => x.kind === 'PRAZO_INVALIDO' && x.blocking))
})

/* ----------------------------- balanceamento ----------------------------- */

test('melhor data é a de menor carga, com desempate estável', () => {
  const r = suggestBestDate({
    candidates: ['2026-09-09', '2026-09-11', '2026-09-14'],
    loadByDate: { '2026-09-09': 5, '2026-09-11': 1, '2026-09-14': 1 },
    cfg, tierWeight: 3,
  })
  assert.equal(r.date, '2026-09-11')
})

test('prazo final limita as datas candidatas', () => {
  const r = suggestBestDate({
    candidates: ['2026-09-20', '2026-09-25'],
    loadByDate: {}, cfg, tierWeight: 1, deadline: '2026-09-18',
  })
  assert.equal(r.date, null)
})

test('peso do tier preserva a hierarquia Scale > Growth > Start', () => {
  assert.equal(tierWeightOf('SCALE'), 3)
  assert.equal(tierWeightOf('GROWTH'), 2)
  assert.equal(tierWeightOf('START'), 1)
  assert.equal(tierWeightOf(null), 0)
})

/* --------------------------- extração da IA --------------------------- */

const baseExtraction = {
  client_name_detected: 'CX Lab Brazil',
  contract_start: '2026-09-01',
  contract_end: '2027-02-28',
  duration_months: 6,
  deliveries: [{
    service_label: 'Social media',
    content_type: 'post',
    platforms: ['Instagram'],
    quantity: 12,
    quantity_period: 'mes' as const,
    frequency: 'mensal' as const,
    weekdays: [],
    specific_dates: [],
    final_deadline: null,
    source_ref: 'Cláusula 3.1',
    inferred_fields: [],
    confidence: 0.9,
  }],
  agency_responsibilities: [],
  client_responsibilities: [],
  approval_dependencies: [],
  observations: [],
  missing_information: [],
  ambiguous_information: [],
  overall_confidence: 0.85,
}

test('IA sem dias definidos vira lacuna explícita, não invenção', () => {
  const clean = sanitizeExtraction(baseExtraction)
  assert.ok(clean.missing_information.some((m) => m.includes('Dias de publicação não definidos')))
  assert.deepEqual(clean.deliveries[0].weekdays, [])
})

test('data inválida da IA vira null com lacuna registrada', () => {
  const clean = sanitizeExtraction({ ...baseExtraction, contract_end: '30/02/2027' })
  assert.equal(clean.contract_end, null)
  assert.ok(clean.missing_information.some((m) => m.includes('Fim do contrato')))
})

test('contrato sem quantidade registra a lacuna da entrega', () => {
  const clean = sanitizeExtraction({
    ...baseExtraction,
    deliveries: [{ ...baseExtraction.deliveries[0], quantity: null }],
  })
  assert.ok(clean.missing_information.some((m) => m.includes('Quantidade de entregas não informada')))
})

test('resposta da IA fora do schema é rejeitada', () => {
  assert.throws(() => parseExtraction('não é json'))
  assert.throws(() => parseExtraction(JSON.stringify({ deliveries: 'texto' })))
})

test('extração vira especificação do planner com frequência correta', () => {
  const specs = toDeliverySpecs(sanitizeExtraction(baseExtraction))
  assert.equal(specs.length, 1)
  assert.equal(specs[0].frequency, 'MENSAL')
  assert.equal(specs[0].quantity, 12)
  assert.equal(specs[0].serviceKey, 'social-media')
  assert.equal(specs[0].sourceRef, 'Cláusula 3.1')
})

test('quantidade semanal declarada sem frequência vira SEMANAL', () => {
  const specs = toDeliverySpecs(sanitizeExtraction({
    ...baseExtraction,
    deliveries: [{ ...baseExtraction.deliveries[0], quantity: 3, quantity_period: 'semana', frequency: 'indefinida' }],
  }))
  assert.equal(specs[0].frequency, 'SEMANAL')
})

test('chave do serviço é estável entre acentos e maiúsculas', () => {
  assert.equal(serviceKeyOf('Produção de Vídeo'), 'producao-de-video')
  assert.equal(serviceKeyOf('  social   media  '), 'social-media')
  assert.equal(serviceKeyOf('***'), 'servico')
})

/* --------------------- cenários de contrato encerrado --------------------- */

test('contrato encerrado não gera datas', () => {
  const r = planDeliveryDates({
    spec: spec({ quantity: 8 }),
    periodStart: '2026-09-01', periodEnd: '2026-08-01', // fim antes do início
    weekdays: cfg.groupADays, cfg, holidays: noHolidays,
  })
  assert.equal(r.dates.length, 0)
})

test('sábado permitido entra na distribuição; domingo continua fora', () => {
  const satCfg: PlannerConfig = { ...cfg, allowSaturday: true }
  const r = planDeliveryDates({
    spec: spec({ quantity: 12, weekdays: [6, 7] }),
    periodStart: '2026-09-01', periodEnd: '2026-09-30',
    weekdays: satCfg.groupBDays, cfg: satCfg, holidays: noHolidays,
  })
  assert.ok(r.dates.length > 0)
  assert.ok(r.dates.every((d) => weekdayISO(d) === 6))
})
