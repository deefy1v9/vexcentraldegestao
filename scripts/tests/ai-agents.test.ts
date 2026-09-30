import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALWAYS_TOOLS, TOOL_GROUPS, agentSystemBlock, pickAgent, stripAgentPrefix, toolsForGroups, validateAgent,
  type AgentLike,
} from '../../lib/ai/agents'

const base: AgentLike = { id: 'a', name: 'Agente', toolGroups: [], isActive: true, isDefault: false }
const agente = (p: Partial<AgentLike>): AgentLike => ({ ...base, ...p })

test('ferramentas: só as áreas escolhidas, sempre com confirmar e cancelar', () => {
  const fin = toolsForGroups(['financeiro'])
  assert.ok(fin.includes('resumo_financeiro'))
  assert.ok(fin.includes('registrar_pagamento'))
  assert.ok(!fin.includes('criar_demanda'))
  assert.ok(!fin.includes('enviar_mensagem'))
  for (const t of ALWAYS_TOOLS) assert.ok(fin.includes(t))
  assert.deepEqual(toolsForGroups([]).sort(), [...ALWAYS_TOOLS].sort())
  const tudo = toolsForGroups(TOOL_GROUPS.map((g) => g.key))
  assert.ok(tudo.includes('criar_demanda') && tudo.includes('perfil_cliente') && tudo.includes('agendar_mensagem'))
})

test('área inexistente não libera nada', () => {
  assert.deepEqual(toolsForGroups(['inventado']).sort(), [...ALWAYS_TOOLS].sort())
})

test('escolha do agente: prefixo com o nome manda', () => {
  const fin = agente({ id: 'f', name: 'Financeiro', toolGroups: ['financeiro'] })
  const geral = agente({ id: 'g', name: 'Geral', toolGroups: ['demandas'], isDefault: true })
  assert.equal(pickAgent([fin, geral], 'Financeiro: quanto entrou hoje?')?.id, 'f')
  assert.equal(pickAgent([fin, geral], '@financeiro, e os atrasados?')?.id, 'f')
  assert.equal(pickAgent([fin, geral], 'cria uma demanda pra Giovana')?.id, 'g')
})

test('escolha do agente: gatilho no meio do texto, com acento e sem', () => {
  const fin = agente({ id: 'f', name: 'Financeiro', toolGroups: ['financeiro'], triggers: ['cobrança', 'inadimplente'] })
  const geral = agente({ id: 'g', name: 'Geral', toolGroups: ['demandas'], isDefault: true })
  assert.equal(pickAgent([fin, geral], 'quem está inadimplente?')?.id, 'f')
  assert.equal(pickAgent([fin, geral], 'manda a cobranca da Nobre')?.id, 'f')
  // gatilho não pode casar dentro de outra palavra
  assert.equal(pickAgent([agente({ id: 'x', name: 'X', toolGroups: [], triggers: ['nota'] }), geral], 'anotar isso')?.id, 'g')
})

test('escolha do agente: inativo é ignorado; sem agente ativo devolve nulo', () => {
  const off = agente({ id: 'f', name: 'Financeiro', toolGroups: ['financeiro'], isActive: false, isDefault: true })
  const on = agente({ id: 'g', name: 'Geral', toolGroups: ['demandas'] })
  assert.equal(pickAgent([off, on], 'oi')?.id, 'g')
  assert.equal(pickAgent([off], 'oi'), null)
  assert.equal(pickAgent([], 'oi'), null)
})

test('prefixo do agente sai do texto do pedido', () => {
  assert.equal(stripAgentPrefix('Financeiro: quanto entrou?', 'Financeiro'), 'quanto entrou?')
  assert.equal(stripAgentPrefix('@financeiro, e hoje?', 'Financeiro'), 'e hoje?')
  assert.equal(stripAgentPrefix('quanto entrou?', 'Financeiro'), 'quanto entrou?')
  // prefixo de outro agente não é removido
  assert.equal(stripAgentPrefix('Vendas: e as propostas?', 'Financeiro'), 'Vendas: e as propostas?')
})

test('bloco do prompt: nome, áreas e instruções de quem configurou', () => {
  const b = agentSystemBlock(agente({ name: 'Dona do Caixa', toolGroups: ['financeiro', 'clientes'], instructions: 'Fale em números redondos.' }))
  assert.match(b, /"Dona do Caixa"/)
  assert.match(b, /financeiro/)
  assert.match(b, /clientes/)
  assert.match(b, /Fale em números redondos\./)
  const vazio = agentSystemBlock(agente({ name: 'Sem área', toolGroups: [] }))
  assert.match(vazio, /não foi configurado/)
})

test('validação do formulário', () => {
  assert.deepEqual(validateAgent({ name: 'Financeiro', toolGroups: ['financeiro'] }), [])
  assert.ok(validateAgent({ name: 'F', toolGroups: ['financeiro'] })[0].includes('nome'))
  assert.ok(validateAgent({ name: 'Financeiro', toolGroups: [] })[0].includes('área'))
  assert.ok(validateAgent({ name: 'Financeiro', toolGroups: ['zzz'] }).some((e) => e.includes('zzz')))
  assert.ok(validateAgent({ name: 'Financeiro', toolGroups: ['financeiro'], instructions: 'x'.repeat(8001) })[0].includes('8000'))
})

test('caixa é uma área própria: libera saldo, extrato e lançamento', () => {
  const caixa = toolsForGroups(['caixa'])
  assert.ok(caixa.includes('saldo_caixa') && caixa.includes('extrato_caixa') && caixa.includes('registrar_caixa'))
  assert.ok(!caixa.includes('registrar_pagamento'))
  // financeiro não dá acesso ao caixa por tabela
  assert.ok(!toolsForGroups(['financeiro']).includes('registrar_caixa'))
})
