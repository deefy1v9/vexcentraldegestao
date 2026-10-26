import test from 'node:test'
import assert from 'node:assert/strict'
import { ESCOPO, ESCOPO_ACOES, escoposConcedidos, temAcoes } from '../../lib/mcp/formato'
import { conversaEmTexto, normalizarMensagens, novidadesDoGrupo } from '../../lib/mcp/grupo'
import { avisoDeEntrega, motivoParaNaoEntregar, naFilaDoAgente, TAG_AGENTE } from '../../lib/mcp/regras-agente'
import { anotacoes, ferramentasDaConexao } from '../../lib/mcp/servidor'

/* ------------------------------ escopos ------------------------------ */

test('escopos: leitura sempre; ações só quando pedidas (ou quando nada é pedido)', () => {
  assert.deepEqual(escoposConcedidos(null), [ESCOPO, ESCOPO_ACOES])
  assert.deepEqual(escoposConcedidos(''), [ESCOPO, ESCOPO_ACOES])
  assert.deepEqual(escoposConcedidos('offline_access'), [ESCOPO, ESCOPO_ACOES])
  assert.deepEqual(escoposConcedidos(ESCOPO), [ESCOPO])
  assert.deepEqual(escoposConcedidos(`${ESCOPO} offline_access`), [ESCOPO])
  assert.deepEqual(escoposConcedidos(ESCOPO_ACOES), [ESCOPO, ESCOPO_ACOES])
  assert.equal(escoposConcedidos('admin'), null)
  assert.equal(escoposConcedidos(`${ESCOPO} admin`), null)
  assert.ok(temAcoes(`${ESCOPO} ${ESCOPO_ACOES}`))
  assert.ok(!temAcoes(ESCOPO))
  assert.ok(!temAcoes(null))
  assert.ok(!temAcoes('central.acoesx'))
})

test('conexão só de leitura não vê nenhuma ação; com ações vê as oito', () => {
  const leitura = ferramentasDaConexao(ESCOPO).map((f) => f.nome)
  const acoes = ['novidades_dos_grupos', 'marcar_grupo_lido', 'ler_grupo_do_cliente', 'fila_do_agente', 'ler_demanda', 'criar_demanda', 'comentar_demanda', 'entregar_para_validacao']
  for (const a of acoes) assert.ok(!leitura.includes(a), `${a} não pode aparecer só com leitura`)
  assert.equal(leitura.length, 14)
  const todas = ferramentasDaConexao(`${ESCOPO} ${ESCOPO_ACOES}`)
  assert.equal(todas.length, 22)
  for (const a of acoes) assert.ok(todas.some((f) => f.nome === a), a)
  // só as três que mudam dados são marcadas como não-leitura (o assistente pede permissão)
  assert.deepEqual(todas.filter((f) => f.somenteLeitura === false).map((f) => f.nome).sort(), ['comentar_demanda', 'criar_demanda', 'entregar_para_validacao', 'marcar_grupo_lido'])
  // o assistente vê: as três ações não são só leitura (pede permissão); as outras são
  assert.deepEqual(todas.filter((f) => !anotacoes(f).readOnlyHint).map((f) => f.nome).sort(), ['comentar_demanda', 'criar_demanda', 'entregar_para_validacao', 'marcar_grupo_lido'])
  for (const f of todas) assert.equal(anotacoes(f).destructiveHint, false, f.nome)
})

/* ------------------------------ grupo do cliente ------------------------------ */

const bruto = [
  { messageid: 'b', messageTimestamp: 1792690800000, text: 'Pode trocar a foto da home?', senderName: 'Fabiana', fromMe: false, messageType: 'ExtendedTextMessage' },
  { messageid: 'a', messageTimestamp: 1792690700, text: 'Oi! Seguem os ajustes', senderName: 'Fabiana', fromMe: false, messageType: 'Conversation' },
  { messageid: 'c', messageTimestamp: 1792690900000, text: '', senderName: 'Fabiana', fromMe: false, messageType: 'ImageMessage' },
  { messageid: 'd', messageTimestamp: 1792691000000, text: 'Combinado!', senderName: 'VEX Growth', fromMe: true, messageType: 'Conversation' },
  { messageid: 'e', messageTimestamp: 1792691100000, text: '', fromMe: false, messageType: 'Conversation' },
  { messageid: 'f', messageTimestamp: 'lixo', text: 'sem data' },
  { messageid: 'g', messageTimestamp: 1792691200000, text: 'áudio', fromMe: false, messageType: 'AudioMessage' },
]

test('grupo: em ordem, autor certo, anexos marcados, vazio e sem data descartados', () => {
  const m = normalizarMensagens(bruto)
  assert.deepEqual(m.map((x) => x.id), ['a', 'b', 'c', 'd', 'g'])
  assert.equal(m[0].quando.getTime(), 1792690700000) // segundos viram milissegundos
  assert.equal(m[0].autor, 'Fabiana')
  assert.equal(m[3].autor, 'VEX')
  assert.equal(m[3].deMim, true)
  assert.equal(m[2].tipo, 'imagem')
  assert.equal(m[4].tipo, 'áudio')
  assert.deepEqual(normalizarMensagens(null), [])
  assert.deepEqual(normalizarMensagens({ messages: [] }), [])
})

test('grupo: conversa em texto desde a data, só as mais novas no limite', () => {
  const m = normalizarMensagens(bruto)
  const tudo = conversaEmTexto(m)
  assert.equal(tudo.split('\n').length, 5)
  assert.match(tudo.split('\n')[0], /· Fabiana: Oi! Seguem os ajustes$/)
  assert.match(tudo, /Fabiana: \[imagem\]/)
  const desde = conversaEmTexto(m, { desde: new Date(1792690800000) })
  assert.equal(desde.split('\n').length, 4)
  const ultimas = conversaEmTexto(m, { max: 2 })
  assert.deepEqual(ultimas.split('\n').map((l) => l.split(' · ')[1].split(':')[0]), ['VEX', 'cliente']) // a última (áudio) não tem nome: vira "cliente"
  assert.equal(conversaEmTexto([]), 'Nenhuma mensagem no grupo nesse período.')
  const longa = conversaEmTexto([{ id: 'x', quando: new Date(), autor: 'C', deMim: false, tipo: 'texto', texto: 'a'.repeat(900) }])
  assert.ok(longa.endsWith('…') && longa.length < 850)
})

/* ------------------------------ travas do agente ------------------------------ */

const EXEC = { name: 'Execução', kind: 'EXECUCAO', notifyClient: false }
const CONF = { name: 'Conferência', kind: 'APROVACAO', notifyClient: false }
const FIM = { name: 'Concluído', kind: 'FINAL', notifyClient: false }
const FILA = [TAG_AGENTE]

test('agente entrega a execução para a conferência de uma pessoa', () => {
  assert.equal(motivoParaNaoEntregar(FILA, EXEC, CONF), null)
  assert.ok(naFilaDoAgente(['x', TAG_AGENTE]))
  assert.ok(!naFilaDoAgente(null))
})

test('agente: fora da fila não mexe', () => {
  assert.match(motivoParaNaoEntregar([], EXEC, CONF)!, /não está na fila do agente/)
  assert.match(motivoParaNaoEntregar(['agente'], EXEC, CONF)!, /não está na fila do agente/)
})

test('agente: nunca aprova, nunca conclui, nunca sai de etapa que avisa o cliente', () => {
  assert.match(motivoParaNaoEntregar(FILA, CONF, FIM)!, /é de aprovação/)
  assert.match(motivoParaNaoEntregar(FILA, FIM, null)!, /já está concluída/)
  assert.match(motivoParaNaoEntregar(FILA, EXEC, FIM)!, /concluiria a demanda/)
  assert.match(motivoParaNaoEntregar(FILA, { ...EXEC, notifyClient: true }, CONF)!, /avisa o cliente/)
  assert.match(motivoParaNaoEntregar(FILA, null, null)!, /nenhuma etapa/)
  assert.match(motivoParaNaoEntregar(FILA, EXEC, null)!, /Não há próxima etapa/)
})

test('aviso de entrega ao responsável: o que foi feito, o link e que o cliente só é avisado depois', () => {
  const a = avisoDeEntrega({ numero: 260, titulo: 'Unna · ajustes do site', etapa: 'Conferência', resumo: 'Troquei a foto da home', link: 'https://unna.com.br', app: 'Claude' })
  assert.match(a, /#260 \(Unna · ajustes do site\)/)
  assert.match(a, /"Conferência"/)
  assert.match(a, /O que foi feito: Troquei a foto da home/)
  assert.match(a, /Link: https:\/\/unna\.com\.br/)
  assert.match(a, /aviso ao cliente só sai depois da sua aprovação/)
  assert.doesNotMatch(avisoDeEntrega({ numero: 1, titulo: 't', etapa: 'e', resumo: 'r', app: 'C' }), /Link:/)
})

test('acompanhamento: só o que chegou depois da última leitura; na primeira vez, as últimas 24 h', () => {
  const m = normalizarMensagens(bruto)
  const lido = new Date(1792690800000) // até a 2ª mensagem
  const n = novidadesDoGrupo(m, lido, new Date(1792691300000))
  assert.deepEqual(n.novas.map((x) => x.id), ['c', 'd', 'g'])
  assert.equal(n.doCliente, 2)
  assert.equal(n.ate?.getTime(), 1792691200000)
  const nada = novidadesDoGrupo(m, new Date(1792691200000), new Date(1792691300000))
  assert.deepEqual(nada.novas, [])
  assert.equal(nada.ate, null)
  // primeira leitura: só as últimas 24 h
  const agora = new Date(1792691200000 + 24 * 3600_000 + 60_000)
  const primeira = novidadesDoGrupo(m, null, agora)
  assert.deepEqual(primeira.novas, [])
  assert.equal(novidadesDoGrupo(m, null, new Date(1792691300000)).novas.length, 5)
})

test('acompanhamento: cliente esperando resposta quando a última mensagem é dele', () => {
  const m = normalizarMensagens(bruto) // a última (g) é do cliente
  assert.equal(novidadesDoGrupo(m, null, new Date(1792691200000 + 3 * 3600_000)).esperandoHoras, 3)
  const respondido = normalizarMensagens([...bruto, { messageid: 'h', messageTimestamp: 1792691300000, text: 'Já vimos!', fromMe: true, messageType: 'Conversation' }])
  assert.equal(novidadesDoGrupo(respondido, null, new Date(1792691300000 + 3 * 3600_000)).esperandoHoras, null)
  assert.equal(novidadesDoGrupo([], null, new Date()).esperandoHoras, null)
})
