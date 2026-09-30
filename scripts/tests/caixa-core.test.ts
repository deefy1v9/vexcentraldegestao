import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cashBalance, cashLabel, cashSign, cashTotals, isCashKind, parseAmountCents, validateMovement,
  withdrawalsByPartner,
} from '../../lib/caixa-core'

test('sinais: entrada e aporte somam, saída e retirada subtraem', () => {
  assert.equal(cashSign('ENTRADA'), 1)
  assert.equal(cashSign('APORTE'), 1)
  assert.equal(cashSign('SAIDA'), -1)
  assert.equal(cashSign('RETIRADA'), -1)
  assert.equal(cashSign('QUALQUER'), 0)
  assert.equal(cashLabel('RETIRADA'), 'Retirada de sócio')
  assert.equal(isCashKind('ENTRADA'), true)
  assert.equal(isCashKind('PIX'), false)
})

test('saldo em centavos, sem erro de ponto flutuante', () => {
  const movs = [
    { kind: 'ENTRADA', amountCents: 518200 },
    { kind: 'SAIDA', amountCents: 238234 },
    { kind: 'RETIRADA', amountCents: 100000 },
    { kind: 'APORTE', amountCents: 50000 },
  ]
  assert.equal(cashBalance(movs), 518200 + 50000 - 238234 - 100000)
  // valor negativo por engano não inverte o sinal do tipo
  assert.equal(cashBalance([{ kind: 'SAIDA', amountCents: -1000 }]), -1000)
  assert.equal(cashBalance([]), 0)
})

test('totais por tipo', () => {
  const t = cashTotals([
    { kind: 'ENTRADA', amountCents: 1000 }, { kind: 'ENTRADA', amountCents: 500 },
    { kind: 'SAIDA', amountCents: 300 }, { kind: 'RETIRADA', amountCents: 200 }, { kind: 'APORTE', amountCents: 100 },
  ])
  assert.deepEqual(t, { entradasCents: 1500, saidasCents: 300, retiradasCents: 200, aportesCents: 100, saldoCents: 1100 })
})

test('retiradas por sócio, do maior para o menor', () => {
  const r = withdrawalsByPartner([
    { kind: 'RETIRADA', amountCents: 100000, partnerName: 'Davi Fernandes' },
    { kind: 'RETIRADA', amountCents: 250000, partnerName: 'Antonio Gomes' },
    { kind: 'RETIRADA', amountCents: 50000, partnerName: 'Davi Fernandes' },
    { kind: 'SAIDA', amountCents: 999, partnerName: 'Antonio Gomes' },
    { kind: 'RETIRADA', amountCents: 1000 },
  ])
  assert.deepEqual(r, [
    { nome: 'Antonio Gomes', cents: 250000 },
    { nome: 'Davi Fernandes', cents: 150000 },
    { nome: 'sem sócio informado', cents: 1000 },
  ])
})

test('valor escrito de qualquer jeito vira centavos', () => {
  assert.equal(parseAmountCents('2.382,34'), 238234)
  assert.equal(parseAmountCents('R$ 1.500,00'), 150000)
  assert.equal(parseAmountCents('1500.50'), 150050)
  assert.equal(parseAmountCents('300'), 30000)
  assert.equal(parseAmountCents(297), 29700)
  assert.equal(parseAmountCents('1.234.567'), 123456700)
  assert.equal(parseAmountCents(''), null)
  assert.equal(parseAmountCents('abc'), null)
  assert.equal(parseAmountCents('-50'), null)
  assert.equal(parseAmountCents(0), null)
})

test('validação: retirada exige sócio', () => {
  assert.deepEqual(validateMovement({ kind: 'SAIDA', amountCents: 1000, description: 'Ferramenta' }), [])
  assert.deepEqual(validateMovement({ kind: 'RETIRADA', amountCents: 1000, description: 'Pró-labore', partnerId: 'u1' }), [])
  assert.ok(validateMovement({ kind: 'RETIRADA', amountCents: 1000, description: 'Pró-labore' })[0].includes('sócio'))
  assert.ok(validateMovement({ kind: 'X', amountCents: 1000, description: 'a' })[0].includes('tipo'))
  assert.ok(validateMovement({ kind: 'SAIDA', amountCents: 0, description: 'a' })[0].includes('valor'))
  assert.ok(validateMovement({ kind: 'SAIDA', amountCents: 100, description: '  ' })[0].includes('do que se trata'))
  assert.ok(validateMovement({ kind: 'SAIDA', amountCents: 100, description: 'a', date: '30/09/2026' })[0].includes('Data'))
})
