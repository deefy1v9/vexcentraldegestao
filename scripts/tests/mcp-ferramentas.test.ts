import test from 'node:test'
import assert from 'node:assert/strict'
import { competencia, diaSP, FERRAMENTAS_MCP, FerramentaErro, inicioDoDiaSP, LEITURA_DO_ASSISTENTE, situacaoDoPrazo } from '../../lib/mcp/ferramentas'
import { TOOL_DEFINITIONS } from '../../lib/ai/tools'

// Ferramentas do assistente que escrevem ou mandam mensagem: nunca no conector
const ESCRITA = ['enviar_mensagem', 'agendar_mensagem', 'confirmar_acao', 'cancelar_acao', 'cancelar_agendamento', 'criar_atividade', 'registrar_pagamento', 'registrar_caixa', 'criar_demanda', 'alterar_demanda', 'mover_demanda', 'concluir_atividade']

test('conector: só leitura; nenhuma ferramenta de escrita do assistente entra', () => {
  const nomes = FERRAMENTAS_MCP.map((f) => f.nome)
  for (const e of ESCRITA) assert.ok(!nomes.includes(e), `${e} não pode estar no conector`)
  assert.deepEqual(nomes, [...LEITURA_DO_ASSISTENTE, 'demandas_por_prazo', 'processos_em_andamento', 'contas_a_pagar', 'risco_de_churn', 'briefings', 'ler_briefing'])
  assert.equal(new Set(nomes).size, nomes.length)
})

test('conector: as reaproveitadas existem no assistente (mesmas contas da Central)', () => {
  const doAssistente = new Set(TOOL_DEFINITIONS.map((t) => t.name))
  for (const n of LEITURA_DO_ASSISTENTE) assert.ok(doAssistente.has(n), n)
})

test('conector: toda ferramenta tem título, descrição e entrada', () => {
  for (const f of FERRAMENTAS_MCP) {
    assert.ok(f.titulo && f.descricao.length > 20, f.nome)
    assert.equal(typeof f.entrada, 'object', f.nome)
  }
})

test('datas de Brasília: dia e meia-noite certos mesmo com o servidor em UTC', () => {
  assert.equal(diaSP(new Date('2026-10-24T02:30:00Z')), '2026-10-23') // 23h30 em Brasília
  assert.equal(diaSP(new Date('2026-10-24T03:00:00Z')), '2026-10-24')
  assert.equal(inicioDoDiaSP('2026-10-23').toISOString(), '2026-10-23T03:00:00.000Z')
})

test('situação do prazo, em dias de Brasília', () => {
  const agora = new Date('2026-10-23T23:00:00Z') // 20h em Brasília
  assert.equal(situacaoDoPrazo(new Date('2026-10-24T02:00:00Z'), agora), 'hoje') // 23h de hoje
  assert.equal(situacaoDoPrazo(new Date('2026-10-23T02:00:00Z'), agora), 'atrasada') // ontem 23h
  assert.equal(situacaoDoPrazo(new Date('2026-10-29T15:00:00Z'), agora), 'semana')
  assert.equal(situacaoDoPrazo(new Date('2026-10-30T15:00:00Z'), agora), 'depois')
  assert.equal(situacaoDoPrazo(null, agora), 'sem')
})

test('competência: AAAA-MM ou o mês atual de Brasília; inválida é erro', () => {
  const agora = new Date('2026-11-01T01:00:00Z') // ainda 31/10 em Brasília
  assert.deepEqual(competencia(undefined, agora), { year: 2026, month: 10 })
  assert.deepEqual(competencia('2026-09', agora), { year: 2026, month: 9 })
  assert.throws(() => competencia('2026-13', agora), FerramentaErro)
  assert.throws(() => competencia('outubro', agora), FerramentaErro)
})
