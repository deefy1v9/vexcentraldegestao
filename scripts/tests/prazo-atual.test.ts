import test from 'node:test'
import assert from 'node:assert/strict'
import { prazoAtual, type StageLike } from '../../lib/processos'

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
