import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildQueue, compareTasks, filterTasks, isLate, roleFor, stageDeadline, summarize, teamSummary,
  EMPTY_DEMANDAS_FILTERS, isRecentlyDone, calendarTone, type TaskLike,
} from '../../lib/demandas-core'

const NOW = new Date('2026-09-22T12:00:00')
const G = { id: 'g', name: 'Giovana' }
const A = { id: 'a', name: 'Antonio' }
const at = (iso: string) => new Date(`${iso}T12:00:00`)

let seq = 0
function task(p: Partial<TaskLike>): TaskLike {
  seq++
  return {
    id: `t${seq}`, number: seq, title: `Demanda ${seq}`, status: 'TODO', priority: 'MEDIA',
    producer: G, reviewer: A, scheduler: G, assignee: G, createdAt: at('2026-09-01'),
    ...p,
  }
}

test('prazo da etapa: produção D-2, revisão D-1, agendamento D', () => {
  const t = task({ dueDate: at('2026-09-25') })
  assert.equal(stageDeadline(t)?.getDate(), 23)
  assert.equal(stageDeadline({ ...t, status: 'EM_REVISAO' })?.getDate(), 24)
  assert.equal(stageDeadline({ ...t, status: 'APROVADO' })?.getDate(), 25)
})

test('atrasada é data final passada e não concluída', () => {
  assert.equal(isLate(task({ dueDate: at('2026-09-20') }), NOW), true)
  assert.equal(isLate(task({ dueDate: at('2026-09-20'), status: 'CONCLUIDO' }), NOW), false)
  assert.equal(isLate(task({ dueDate: at('2026-09-22') }), NOW), false)
})

test('papel na etapa atual segue produtor → revisor → agendador', () => {
  const t = task({ dueDate: at('2026-09-25') })
  assert.equal(roleFor(t, 'g')?.role, 'Produzir')
  assert.equal(roleFor(t, 'a'), null)
  assert.equal(roleFor({ ...t, status: 'EM_REVISAO' }, 'a')?.role, 'Revisar')
  assert.equal(roleFor({ ...t, status: 'EM_REVISAO' }, 'g'), null)
  assert.equal(roleFor({ ...t, status: 'APROVADO' }, 'g')?.role, 'Agendar')
  assert.equal(roleFor({ ...t, status: 'CONCLUIDO' }, 'g'), null)
  // Etapa sem dono definido: o responsável geral assume
  assert.equal(roleFor({ ...t, status: 'EM_REVISAO', reviewer: null }, 'g')?.role, 'Revisar')
})

test('ordenação: atrasada antes de urgente; posição manual desempata o mesmo dia', () => {
  const atrasada = task({ dueDate: at('2026-09-20'), priority: 'BAIXA' })
  const urgente = task({ dueDate: at('2026-10-10'), priority: 'URGENTE' })
  const hojeB = task({ dueDate: at('2026-09-24'), position: 2 })
  const hojeA = task({ dueDate: at('2026-09-24'), position: 1 })
  const ordem = [urgente, hojeB, hojeA, atrasada].sort((x, y) => compareTasks(x, y, NOW)).map((t) => t.id)
  assert.deepEqual(ordem, [atrasada.id, hojeA.id, hojeB.id, urgente.id])
})

test('fila pessoal agrupa por prazo do papel e ignora o que não é a vez do usuário', () => {
  const tasks = [
    task({ dueDate: at('2026-09-20') }),                       // atrasada (produção)
    task({ dueDate: at('2026-09-24') }),                       // produção D-2 = hoje
    task({ dueDate: at('2026-09-25') }),                       // amanhã
    task({ dueDate: at('2026-09-30') }),                       // semana
    task({ dueDate: at('2026-09-23'), status: 'EM_REVISAO' }), // vez do revisor (Antonio)
    task({ dueDate: null }),                                   // sem data
  ]
  const fila = buildQueue(tasks, 'g', NOW)
  assert.deepEqual(fila.map((g) => `${g.key}:${g.items.length}`), ['atrasadas:1', 'hoje:1', 'amanha:1', 'semana:1', 'semData:1'])
  assert.equal(fila[0].items[0].cta, 'Entregar')
  const filaAntonio = buildQueue(tasks, 'a', NOW)
  assert.deepEqual(filaAntonio.map((g) => `${g.key}:${g.items.length}`), ['hoje:1'])
  assert.equal(filaAntonio[0].items[0].role, 'Revisar')
})

test('filtros: busca sem acento, responsável, período com atrasadas sempre, ação do usuário', () => {
  const tasks = [
    task({ title: 'Nobre · Post 12 · Delivery', dueDate: at('2026-09-20'), client: { id: 'c1', name: 'Maria Nobre', tier: 'GROWTH' } }),
    task({ title: 'CX Lab · Post 05', dueDate: at('2026-10-15'), client: { id: 'c2', name: 'CX Lab', tier: 'SCALE' }, assignee: A, producer: A }),
    task({ title: 'Promo Prime · Reel', dueDate: at('2026-09-24'), client: { id: 'c3', name: 'Promo Prime', tier: 'START' } }),
  ]
  const f = { ...EMPTY_DEMANDAS_FILTERS }
  assert.equal(filterTasks(tasks, { ...f, q: 'nobre' }, 'g', NOW).length, 1)
  assert.equal(filterTasks(tasks, { ...f, q: 'DELIVERY' }, 'g', NOW).length, 1)
  assert.equal(filterTasks(tasks, { ...f, assignee: 'a' }, 'g', NOW).length, 1)
  assert.equal(filterTasks(tasks, { ...f, period: 'hoje' }, 'g', NOW).map((t) => t.title).join('|'), 'Nobre · Post 12 · Delivery|Promo Prime · Reel')
  assert.equal(filterTasks(tasks, { ...f, late: true }, 'g', NOW).length, 1)
  assert.equal(filterTasks(tasks, { ...f, tier: 'SCALE' }, 'g', NOW).length, 1)
  assert.equal(filterTasks(tasks, { ...f, action: true }, 'a', NOW).length, 1)
  assert.equal(filterTasks(tasks, { ...f, mine: true }, 'g', NOW).length, 2)
})

test('contadores do colaborador e do admin', () => {
  const tasks = [
    task({ dueDate: at('2026-09-20') }),
    task({ dueDate: at('2026-09-24') }),
    task({ dueDate: at('2026-09-23'), status: 'EM_REVISAO' }),
    task({ dueDate: at('2026-09-10'), status: 'CONCLUIDO' }),
  ]
  const g = summarize(tasks, 'g', false, NOW)
  assert.deepEqual(g, { late: 1, today: 1, week: 1, action: 2, open: 2 })
  const adm = summarize(tasks, 'a', true, NOW)
  assert.equal(adm.late, 1)
  assert.equal(adm.action, 1)
  assert.equal(adm.open, 3)
})

test('carga da equipe ordena por atrasadas e conta sem responsável', () => {
  const N = { id: 'n', name: 'Nathan' }
  const tasks = [
    task({ dueDate: at('2026-09-20') }),
    task({ dueDate: at('2026-09-20'), assignee: N }),
    task({ dueDate: at('2026-09-20'), assignee: N }),
    task({ dueDate: at('2026-10-01'), assignee: null }),
  ]
  const { rows, unassigned } = teamSummary(tasks, [G, N, A], NOW)
  assert.deepEqual(rows.map((r) => `${r.name}:${r.open}/${r.late}`), ['Nathan:2/2', 'Giovana:1/1', 'Antonio:0/0'])
  assert.equal(unassigned, 1)
})

test('concluída recente fica 7 dias na coluna', () => {
  assert.equal(isRecentlyDone(task({ status: 'CONCLUIDO', updatedAt: at('2026-09-18') }), NOW), true)
  assert.equal(isRecentlyDone(task({ status: 'CONCLUIDO', updatedAt: at('2026-09-01') }), NOW), false)
  assert.equal(isRecentlyDone(task({ status: 'TODO' }), NOW), false)
})

test('ordenação da lista: prioridade, cliente e recentes', async () => {
  const { sortTasks } = await import('../../lib/demandas-core')
  const a = task({ title: 'a', priority: 'BAIXA', dueDate: at('2026-10-10'), client: { id: 'c2', name: 'Zeta' }, createdAt: at('2026-09-01') })
  const b = task({ title: 'b', priority: 'URGENTE', dueDate: at('2026-10-20'), client: { id: 'c1', name: 'Alfa' }, createdAt: at('2026-09-10') })
  assert.deepEqual(sortTasks([a, b], 'prioridade', NOW).map((t) => t.title), ['b', 'a'])
  assert.deepEqual(sortTasks([a, b], 'cliente', NOW).map((t) => t.title), ['b', 'a'])
  assert.deepEqual(sortTasks([a, b], 'recentes', NOW).map((t) => t.title), ['b', 'a'])
  assert.deepEqual(sortTasks([a, b], 'prazo', NOW).map((t) => t.title), ['b', 'a'])
})

test('abas: contadores, ida e volta com os filtros', async () => {
  const { tabCounts, tabFromFilters, filtersForTab } = await import('../../lib/demandas-core')
  const tasks = [
    task({ dueDate: at('2026-09-20') }),
    task({ dueDate: at('2026-09-24') }),
    task({ dueDate: at('2026-09-23'), status: 'EM_REVISAO' }),
    task({ dueDate: at('2026-09-10'), status: 'CONCLUIDO' }),
  ]
  assert.deepEqual(tabCounts(tasks, NOW), { todas: 3, atrasadas: 1, hoje: 2, revisao: 1, concluidas: 1 })
  const f = { ...EMPTY_DEMANDAS_FILTERS, client: 'c1' }
  for (const tab of ['todas', 'atrasadas', 'hoje', 'revisao', 'concluidas'] as const) {
    const next = filtersForTab(f, tab)
    assert.equal(tabFromFilters(next), tab)
    assert.equal(next.client, 'c1')
  }
})

test('ação da linha segue a etapa e a vez do usuário', async () => {
  const { actionFor } = await import('../../lib/demandas-core')
  const t = task({ dueDate: at('2026-09-25') })
  assert.equal(actionFor(t, 'g').label, 'Iniciar')
  assert.equal(actionFor({ ...t, status: 'EM_ANDAMENTO' }, 'g').label, 'Entregar')
  assert.equal(actionFor({ ...t, status: 'EM_REVISAO' }, 'a').label, 'Revisar')
  assert.equal(actionFor({ ...t, status: 'EM_REVISAO' }, 'g').label, 'Abrir')
  assert.equal(actionFor({ ...t, status: 'APROVADO' }, 'g').label, 'Agendar')
  assert.equal(actionFor({ ...t, status: 'CONCLUIDO' }, 'g').label, 'Ver')
})

test('demanda em revisão some para quem produziu, fica para revisor e admin', async () => {
  const { canSee } = await import('../../lib/demandas-core')
  const t = task({ status: 'EM_REVISAO', dueDate: at('2026-09-25') })
  assert.equal(canSee(t, 'g', false), false)
  assert.equal(canSee(t, 'a', false), true)
  assert.equal(canSee(t, 'g', true), true)
  assert.equal(canSee({ ...t, status: 'TODO' }, 'g', false), true)
  // Sem revisor definido, quem responde pela demanda continua vendo
  assert.equal(canSee({ ...t, reviewer: null }, 'g', false), true)
})

test('colaborador só vê as demandas em que tem papel; admin vê tudo', async () => {
  const { canSee, visibilityWhere } = await import('../../lib/demandas-core')
  const N = { id: 'n', name: 'Nathan' }
  const doCeo = task({ assignee: A, producer: A, reviewer: A, scheduler: A })
  assert.equal(canSee(doCeo, 'g', false), false)
  assert.equal(canSee(doCeo, 'a', false), true)
  assert.equal(canSee(doCeo, 'g', true), true)
  // Papel em qualquer etapa basta para enxergar
  assert.equal(canSee(task({ assignee: N, producer: N, reviewer: A, scheduler: G }), 'g', false), true)
  assert.deepEqual(visibilityWhere('g', true), {})
  assert.deepEqual(visibilityWhere('g', false), {
    OR: [{ assigneeId: 'g' }, { producerId: 'g' }, { reviewerId: 'g' }, { schedulerId: 'g' }],
  })
})

test('calendarTone: cinza padrão, amarelo a 2 dias, verde feito, vermelho atrasado', () => {
  const now = new Date('2026-09-23T15:00:00-03:00')
  const t = (dueDate: string | null, status = 'TODO') => ({ status, dueDate: dueDate ? `${dueDate}T12:00:00Z` : null } as unknown as TaskLike)
  assert.equal(calendarTone(t('2026-09-01', 'CONCLUIDO'), now), 'feito')
  assert.equal(calendarTone(t('2026-09-22'), now), 'atrasado')
  assert.equal(calendarTone(t('2026-09-23'), now), 'proximo')
  assert.equal(calendarTone(t('2026-09-25'), now), 'proximo')
  assert.equal(calendarTone(t('2026-09-26'), now), 'normal')
  assert.equal(calendarTone(t(null), now), 'normal')
})
