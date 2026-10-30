import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays, checklistFechamento, concentracao, contaCorrente, diasEntre, dreGerencial, faixasDeAtraso, projetarCaixa, serieSaldoDiaria,
  resumoPorSocio, riscoDeCaixa,
} from '../../lib/bpo-core'

test('datas civis: soma e diferença de dias, inclusive virando o mês', () => {
  assert.equal(addDays('2026-10-30', 7), '2026-11-06')
  assert.equal(addDays('2026-12-30', 2), '2027-01-01')
  assert.equal(diasEntre('2026-10-01', '2026-10-30'), 29)
  assert.equal(diasEntre('2026-10-30', '2026-10-30'), 0)
})

test('projeção: atrasado a receber fica fora do saldo, conta atrasada entra', () => {
  const { projecoes, atrasadosReceberCents } = projetarCaixa({
    saldoCents: 100_000,
    hoje: '2026-10-30',
    receber: [
      { vence: '2026-10-25', cents: 223_200, nome: 'Cliente E' }, // atrasado
      { vence: '2026-10-30', cents: 50_000, nome: 'Hoje' },
      { vence: '2026-11-25', cents: 90_000, nome: 'Cliente F' },
      { vence: '2027-03-01', cents: 999_999, nome: 'Longe' },
    ],
    pagar: [
      { vence: '2026-10-20', cents: 30_000, nome: 'Conta atrasada' },
      { vence: '2026-11-01', cents: 110_000, nome: 'Ferramenta' },
      { vence: '2026-11-20', cents: 60_000, nome: 'Conta do mês' },
    ],
  })
  assert.equal(atrasadosReceberCents, 223_200)
  const [d7, d30] = projecoes
  assert.equal(d7.ate, '2026-11-06')
  assert.equal(d7.entradasCents, 50_000)
  assert.equal(d7.saidasCents, 140_000)
  assert.equal(d7.saldoCents, 100_000 + 50_000 - 140_000)
  assert.equal(d7.saldoComAtrasadosCents, d7.saldoCents + 223_200)
  assert.equal(d30.entradasCents, 140_000)
  assert.equal(d30.saidasCents, 200_000)
  assert.equal(projecoes.length, 4)
})

test('risco de caixa: negativo falta, sobra pequena é apertado', () => {
  assert.equal(riscoDeCaixa({ saldoCents: -1, saidasCents: 100 }), 'falta')
  assert.equal(riscoDeCaixa({ saldoCents: 5, saidasCents: 100 }), 'apertado')
  assert.equal(riscoDeCaixa({ saldoCents: 50, saidasCents: 100 }), 'ok')
  assert.equal(riscoDeCaixa({ saldoCents: 0, saidasCents: 0 }), 'ok')
})

test('inadimplência por faixa: só o vencido, cada item numa faixa', () => {
  const f = faixasDeAtraso([
    { vence: '2026-10-30', cents: 1, nome: 'hoje, não conta' },
    { vence: '2026-10-20', cents: 100, nome: '10 dias' },
    { vence: '2026-10-10', cents: 200, nome: '20 dias' },
    { vence: '2026-09-15', cents: 300, nome: '45 dias' },
    { vence: '2026-07-01', cents: 400, nome: '121 dias' },
  ], '2026-10-30')
  assert.deepEqual(f.map((x) => x.cents), [100, 200, 300, 400])
  assert.deepEqual(f.map((x) => x.qtd), [1, 1, 1, 1])
})

test('concentração: soma por cliente, ordena e alerta acima do limite', () => {
  const c = concentracao([
    { nome: 'Cliente A', cents: 600_000 }, { nome: 'Cliente B', cents: 450_000 }, { nome: 'Cliente C', cents: 250_000 },
    { nome: 'Cliente C', cents: 25_684 }, { nome: 'Cliente D', cents: 78_500 },
  ])
  assert.equal(c.clientes[0].nome, 'Cliente A')
  assert.equal(c.clientes.find((x) => x.nome === 'Cliente C')?.cents, 275_684)
  assert.equal(c.totalCents, 1_404_184)
  assert.ok(c.alerta?.includes('Cliente A'))
  const sem = concentracao(Array.from({ length: 10 }, (_, i) => ({ nome: `C${i}`, cents: 100 })))
  assert.equal(sem.alerta, null)
  assert.equal(concentracao([]).top1, 0)
})

test('pró-labore por sócio: retiradas menos aportes, ignora entrada e saída', () => {
  const r = resumoPorSocio([
    { kind: 'RETIRADA', cents: 180_000, socio: 'Sócio 1', descricao: 'acerto', dia: '2026-10-28' },
    { kind: 'APORTE', cents: 39_190, socio: 'Sócio 1', descricao: 'conta paga do bolso', dia: '2026-10-29' },
    { kind: 'RETIRADA', cents: 76_500, socio: 'Sócio 2', descricao: 'acerto', dia: '2026-10-28' },
    { kind: 'SAIDA', cents: 29_700, socio: null, descricao: 'contabilidade', dia: '2026-10-29' },
  ])
  assert.equal(r.length, 2)
  assert.equal(r[0].socio, 'Sócio 1')
  assert.equal(r[0].liquidoCents, 180_000 - 39_190)
  assert.equal(r[0].movimentos.length, 2)
  assert.equal(r[1].aportesCents, 0)
})

test('DRE gerencial: resultado operacional e depois das retiradas', () => {
  const linhas = dreGerencial(
    { previstaCents: 1000, recebidaCents: 900, custosPagosCents: 200, salariosPagosCents: 100, retiradasCents: 500 },
    null,
  )
  assert.equal(linhas.find((l) => l.rotulo.includes('operacional'))?.atualCents, 600)
  assert.equal(linhas.at(-1)?.atualCents, 100)
  assert.ok(linhas.every((l) => l.anteriorCents === null))
})

test('checklist do fechamento: aponta o que falta e nunca dá o banco por conferido', () => {
  const c = checklistFechamento({ receberAbertos: 2, pagarAbertos: 0, semCategoria: 1, semConta: 0, saldoCents: 145_059 })
  assert.deepEqual(c.map((i) => i.ok), [false, true, false, true, false])
  assert.ok(c[0].detalhe.includes('2 parcelas'))
  assert.ok(c[2].detalhe.includes('1 movimento sem categoria'))
  const comBanco = checklistFechamento({ receberAbertos: 0, pagarAbertos: 0, semCategoria: 0, semConta: 0, saldoCents: 60, banco: { ok: true, detalhe: 'Conciliado até 30/10.' } })
  assert.ok(comBanco.every((i) => i.ok))
})

test('conta corrente do sócio: soma com sinal, ordena do mais novo e tolera R$ 1,00', () => {
  const c = contaCorrente([
    { dia: '2026-10-28', amountCents: -463, description: 'resíduo do fechamento' },
    { dia: '2026-10-30', amountCents: -9900, description: 'parte na contabilidade' },
    { dia: '2026-10-30', amountCents: 5000, description: 'acerto da contabilidade de 20/10' },
  ])
  assert.equal(c.saldoCents, -5363)
  assert.equal(c.situacao, 'deve')
  assert.equal(c.lancamentos[0].dia, '2026-10-30')
  assert.equal(contaCorrente([{ dia: '2026-10-30', amountCents: 50, description: 'centavos' }]).situacao, 'zerado')
  assert.equal(contaCorrente([{ dia: '2026-10-30', amountCents: 33514, description: 'crédito' }]).situacao, 'receber')
})

test('saldo dia a dia: vencido a pagar sai no primeiro dia, cada vencimento no seu dia', () => {
  const s = serieSaldoDiaria({
    saldoCents: 1000, hoje: '2026-10-30', dias: 3,
    receber: [{ vence: '2026-10-31', cents: 500, nome: 'a' }, { vence: '2026-10-01', cents: 200, nome: 'atrasado' }],
    pagar: [{ vence: '2026-10-20', cents: 300, nome: 'vencida' }, { vence: '2026-11-01', cents: 100, nome: 'b' }],
  })
  assert.deepEqual(s.map((p) => p.saldoCents), [700, 1200, 1100, 1100])
  assert.equal(s[0].comAtrasadosCents, 900)
  assert.equal(s.length, 4)
})
