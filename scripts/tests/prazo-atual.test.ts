import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarPrazos, prazoAtual, prazosDasEtapas, type StageLike } from '../../lib/processos'

// Datas locais, como a tela calcula
const d = (dia: number, h = 12) => new Date(2026, 9, dia, h, 0)
const AGORA = d(22, 21)
const HOJE = new Date(2026, 9, 22, 0, 0)

const etapa = (extra: Partial<StageLike>): StageLike => ({
  id: 's', position: 0, name: 'Produção', kind: 'EXECUCAO', status: 'EM_ANDAMENTO', dueMode: 'ANTES_DA_ENTREGA', dueDays: 2,
  fields: [], checklist: [], checklistRequired: false, ...extra,
})

test('prazo: post que sai hoje não fica atrasado pela produção D-2', () => {
  const p = prazoAtual(etapa({}), { dueDate: d(22, 21) }, AGORA)
  assert.deepEqual(p, HOJE)
})

test('prazo: site com prazo da etapa vencido, mas replanejado para hoje, vence hoje', () => {
  const site = etapa({ name: 'Desenvolvimento e ajustes', dueMode: 'DIAS_APOS_ENTRADA', dueDays: 7 })
  assert.deepEqual(prazoAtual(site, { stageEnteredAt: d(14, 18), dueDate: d(22, 23) }, AGORA), HOJE)
})

test('prazo: com a data final já vencida, continua atrasada', () => {
  const site = etapa({ dueMode: 'DIAS_APOS_ENTRADA', dueDays: 7 })
  const p = prazoAtual(site, { stageEnteredAt: d(14, 18), dueDate: d(21, 18) }, AGORA)!
  assert.ok(p < HOJE)
  assert.deepEqual(p, d(21, 18))
})

test('prazo: etapa no prazo mantém o prazo dela (não puxa para hoje)', () => {
  assert.deepEqual(prazoAtual(etapa({}), { dueDate: d(26, 9) }, AGORA), d(24, 9))
  const rev = etapa({ kind: 'APROVACAO', dueMode: 'DIAS_APOS_ENTRADA', dueDays: 2 })
  assert.deepEqual(prazoAtual(rev, { stageEnteredAt: d(22, 9), dueDate: d(30, 18) }, AGORA), d(24, 9))
})

test('prazo: a etapa nunca vence depois da data final da demanda', () => {
  const dev = etapa({ name: 'Desenvolvimento e ajustes', dueMode: 'DIAS_APOS_ENTRADA', dueDays: 7 })
  // criada hoje para entregar hoje: vence hoje, não daqui a 7 dias
  assert.deepEqual(prazoAtual(dev, { stageEnteredAt: d(22, 21), dueDate: d(22, 23) }, AGORA), d(22, 23))
  // data final já vencida: atrasada, mesmo com a etapa "no prazo"
  const p = prazoAtual(dev, { stageEnteredAt: d(22, 9), dueDate: d(21, 18) }, AGORA)!
  assert.deepEqual(p, d(21, 18))
})

test('prazo: sem etapa ou sem prazo de etapa, vale a data final', () => {
  assert.deepEqual(prazoAtual(null, { dueDate: d(25, 9) }, AGORA), d(25, 9))
  assert.deepEqual(prazoAtual(etapa({ kind: 'FINAL' }), { dueDate: d(25, 9) }, AGORA), d(25, 9))
  assert.equal(prazoAtual(null, {}, AGORA), null)
})

/* ------------------------- prazo marcado por etapa ------------------------- */

// Site: desenvolvimento até dia 10, apresentação só no dia 14
const DEV = etapa({ id: 'dev', position: 0, name: 'Desenvolvimento', dueMode: 'DIAS_APOS_ENTRADA', dueDays: 7 })
const APRES = etapa({ id: 'apres', position: 1, name: 'Apresentação', kind: 'APROVACAO', dueMode: 'DIAS_APOS_ENTRADA', dueDays: 2 })
const FIM = etapa({ id: 'fim', position: 2, name: 'Concluído', kind: 'FINAL', dueDays: 0 })
const MARCADOS = { dev: new Date(2026, 10, 10, 18).toISOString(), apres: new Date(2026, 10, 14, 18).toISOString() }

test('prazo marcado: vale sobre a regra do processo, inclusive depois da data final', () => {
  const task = { stageId: 'dev', stageEnteredAt: d(22, 9), dueDate: d(30, 18), stageDeadlines: MARCADOS }
  assert.deepEqual(prazoAtual(DEV, task, AGORA), new Date(2026, 10, 10, 18))
})

test('prazo marcado: quando a tarefa chega na etapa, o prazo passa a ser o dela', () => {
  const naApresentacao = { stageId: 'apres', stageEnteredAt: new Date(2026, 10, 9, 15), dueDate: d(30, 18), stageDeadlines: MARCADOS }
  assert.deepEqual(prazoAtual(APRES, naApresentacao, new Date(2026, 10, 9, 16)), new Date(2026, 10, 14, 18))
})

test('prazo marcado: data marcada que já passou deixa a etapa atrasada (não é puxada para hoje)', () => {
  const task = { stageId: 'dev', stageEnteredAt: d(14, 9), dueDate: d(30, 18), stageDeadlines: { dev: d(20, 18).toISOString() } }
  assert.deepEqual(prazoAtual(DEV, task, AGORA), d(20, 18))
})

test('plano por etapa: atual, próximas marcadas ou previstas pela regra, sem passar da data final', () => {
  const semMarca = prazosDasEtapas([FIM, APRES, DEV], { stageId: 'dev', stageEnteredAt: d(22, 9), dueDate: d(30, 18) }, AGORA)
  assert.deepEqual(semMarca.map((p) => [p.id, p.situacao, p.definido]), [['dev', 'atual', false], ['apres', 'proxima', false]])
  assert.deepEqual(semMarca[0].prazo, d(29, 9)) // entrou 22 + 7 dias
  assert.deepEqual(semMarca[1].prazo, d(30, 18)) // 29 + 2 = 31, mas a data final é 30
  const comMarca = prazosDasEtapas([DEV, APRES, FIM], { stageId: 'dev', stageEnteredAt: d(22, 9), dueDate: d(30, 18), stageDeadlines: MARCADOS }, AGORA)
  assert.deepEqual(comMarca.map((p) => [p.id, p.definido]), [['dev', true], ['apres', true]])
  assert.deepEqual(comMarca[1].prazo, new Date(2026, 10, 14, 18))
  // a previsão da próxima parte do prazo marcado da anterior
  const soDev = prazosDasEtapas([DEV, APRES, FIM], { stageId: 'dev', stageEnteredAt: d(22, 9), dueDate: new Date(2026, 11, 1), stageDeadlines: { dev: MARCADOS.dev } }, AGORA)
  assert.deepEqual(soDev[1].prazo, new Date(2026, 10, 12, 18))
})

test('plano por etapa: etapas já feitas ficam como feitas; na final, todas feitas', () => {
  const naApres = prazosDasEtapas([DEV, APRES, FIM], { stageId: 'apres', stageEnteredAt: d(22, 9), dueDate: d(30, 18) }, AGORA)
  assert.deepEqual(naApres.map((p) => p.situacao), ['feita', 'atual'])
  assert.equal(naApres[0].prazo, null)
  const pronta = prazosDasEtapas([DEV, APRES, FIM], { stageId: 'fim', dueDate: d(30, 18) }, AGORA)
  assert.deepEqual(pronta.map((p) => p.situacao), ['feita', 'feita'])
})

test('validação dos prazos: só etapas do processo, data válida, vazio volta para a regra', () => {
  const ok = normalizarPrazos({ dev: '2026-11-10T21:00:00.000Z', apres: '' }, ['dev', 'apres'], { apres: 'x', velha: 'y' })
  assert.deepEqual(ok, { ok: { dev: '2026-11-10T21:00:00.000Z' } })
  assert.deepEqual(normalizarPrazos({ outra: '2026-11-10' }, ['dev', 'apres']), { erro: 'Essa etapa não é do processo desta demanda.' })
  assert.deepEqual(normalizarPrazos({ dev: 'amanhã' }, ['dev']), { erro: 'Data inválida no prazo da etapa.' })
  assert.deepEqual(normalizarPrazos({ dev: null }, ['dev'], { dev: '2026-11-10T21:00:00.000Z' }), { ok: null })
  assert.deepEqual(normalizarPrazos(null, ['dev'], { dev: 'x' }), { ok: null })
  assert.ok('erro' in normalizarPrazos([1], ['dev']))
})

test('prazo marcado: na etapa final não vale; data gravada inválida cai na regra', () => {
  assert.deepEqual(prazoAtual(FIM, { stageId: 'fim', dueDate: d(30, 18), stageDeadlines: { fim: d(25, 18).toISOString() } }, AGORA), d(30, 18))
  assert.deepEqual(prazoAtual(DEV, { stageId: 'dev', stageEnteredAt: d(22, 9), dueDate: d(30, 18), stageDeadlines: { dev: 'lixo' } }, AGORA), d(29, 9))
})
