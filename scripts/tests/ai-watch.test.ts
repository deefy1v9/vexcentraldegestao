import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cashHealth, contractAlert, daysBetween, formatAlerts, hasCritical, rankAlerts, shouldWatchToday,
  type Alert,
} from '../../lib/ai/watch-core'

test('vigia diária: roda uma vez por dia', () => {
  const cfg = { watchFrequency: 'DIARIA' }
  assert.equal(shouldWatchToday(cfg, '2026-09-30', 3), true)
  assert.equal(shouldWatchToday({ ...cfg, lastWatchOn: '2026-09-30' }, '2026-09-30', 3), false)
  assert.equal(shouldWatchToday({ ...cfg, lastWatchOn: '2026-09-29' }, '2026-09-30', 3), true)
})

test('vigia semanal: só no dia escolhido', () => {
  const seg = { watchFrequency: 'SEMANAL', watchWeekday: 1 }
  assert.equal(shouldWatchToday(seg, '2026-10-05', 1), true)
  assert.equal(shouldWatchToday(seg, '2026-10-06', 2), false)
  // sem dia escolhido, assume segunda
  assert.equal(shouldWatchToday({ watchFrequency: 'SEMANAL' }, '2026-10-05', 1), true)
  assert.equal(shouldWatchToday({ ...seg, lastWatchOn: '2026-10-05' }, '2026-10-05', 1), false)
})

test('vigia desligada nunca roda', () => {
  assert.equal(shouldWatchToday({ watchFrequency: 'DESLIGADA' }, '2026-09-30', 1), false)
  assert.equal(shouldWatchToday({ watchFrequency: 'seja lá o que for' }, '2026-09-30', 1), false)
})

test('alertas: ordena por gravidade e corta o excesso', () => {
  const alerts: Alert[] = [
    { severity: 'informativo', title: 'i1' }, { severity: 'critico', title: 'c1' },
    { severity: 'atencao', title: 'a1' }, { severity: 'critico', title: 'c2' },
  ]
  assert.deepEqual(rankAlerts(alerts).map((a) => a.title), ['c1', 'c2', 'a1', 'i1'])
  assert.deepEqual(rankAlerts(alerts, 2).map((a) => a.title), ['c1', 'c2'])
  assert.equal(hasCritical(alerts), true)
  assert.equal(hasCritical([{ severity: 'atencao', title: 'a' }]), false)
})

test('saúde do caixa: vermelho, apertado e saudável', () => {
  assert.equal(cashHealth({ previstaCents: 100000, custosPrevistosCents: 120000, salariosPrevistosCents: 0 }).status, 'vermelho')
  assert.equal(cashHealth({ previstaCents: 100000, custosPrevistosCents: 50000, salariosPrevistosCents: 40000 }).status, 'apertado')
  const bom = cashHealth({ previstaCents: 100000, custosPrevistosCents: 20000, salariosPrevistosCents: 10000 })
  assert.equal(bom.status, 'saudavel')
  assert.equal(bom.saldoCents, 70000)
  // sem receita prevista e com despesa, continua vermelho
  assert.equal(cashHealth({ previstaCents: 0, custosPrevistosCents: 1000, salariosPrevistosCents: 0 }).status, 'vermelho')
})

test('contrato a vencer vira alerta na janela de 30 dias', () => {
  assert.equal(contractAlert('X', '2026-12-01', '2026-09-30'), null)
  assert.equal(contractAlert('X', '2026-10-25', '2026-09-30')?.severity, 'atencao')
  assert.equal(contractAlert('X', '2026-10-05', '2026-09-30')?.severity, 'critico')
  const vencido = contractAlert('X', '2026-09-20', '2026-09-30')
  assert.equal(vencido?.severity, 'critico')
  assert.match(vencido?.title ?? '', /venceu em 20\/09\/2026/)
})

test('dias entre datas e formatação das linhas', () => {
  assert.equal(daysBetween('2026-09-30', '2026-10-05'), 5)
  assert.equal(daysBetween('2026-10-05', '2026-09-30'), -5)
  const txt = formatAlerts([{ severity: 'critico', title: 'CX Lab atrasada', detail: 'R$ 2.201,00' }])
  assert.equal(txt, '🔴 CX Lab atrasada — R$ 2.201,00')
})
