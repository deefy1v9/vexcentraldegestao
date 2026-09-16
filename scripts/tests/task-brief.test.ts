import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBrief, splitHashtags, captionWithHashtags } from '../../lib/task-brief'

const DEMANDA = `COPY DA ARTE (Carrossel)
SLIDE 1 · CAPA
Automatizar um atendimento confuso não resolve a confusão.

SLIDE 2 · O ENGANO
Muita empresa trata a IA como destino.

LEGENDA · Instagram e LinkedIn (mesmo conteúdo)
Existe uma promessa sedutora rondando o atendimento.

O que a sua empresa está prestes a automatizar?

HASHTAGS
#CustomerExperience #CX #IA #Atendimento

⚠ PENDÊNCIA: Número real do case. Sem ele, o post não pode ir ao ar.`

test('separa copy, legenda, hashtags e alerta', () => {
  const s = parseBrief(DEMANDA)
  assert.deepEqual(s.map((x) => x.kind), ['copy', 'legenda', 'hashtags', 'alerta'])
  assert.equal(s[0].title, 'COPY DA ARTE (Carrossel)')
  assert.ok(s[0].body.startsWith('SLIDE 1 · CAPA'))
  // quebras de linha dentro do bloco continuam lá
  assert.ok(s[0].body.includes('\n\nSLIDE 2'))
  assert.equal(s[1].body, 'Existe uma promessa sedutora rondando o atendimento.\n\nO que a sua empresa está prestes a automatizar?')
  assert.equal(s[3].title, 'Atenção')
  assert.ok(s[3].body.startsWith('PENDÊNCIA'))
})

test('hashtags viram lista e legenda pronta junta as duas', () => {
  const s = parseBrief(DEMANDA)
  assert.deepEqual(splitHashtags(s[2].body), ['#CustomerExperience', '#CX', '#IA', '#Atendimento'])
  const pronta = captionWithHashtags(s)
  assert.ok(pronta?.endsWith('#CustomerExperience #CX #IA #Atendimento'))
})

test('briefing de anúncio: título, subtítulo, descrição, CTA e imagem separados', () => {
  const s = parseBrief(`CRIATIVO 01 · Lavanderia · Estático

TÍTULO (maior destaque)
Um dia você abre a caixa.

SUBTÍTULO (abaixo, menor)
Vestido guardado errado amarela.

CTA (botão do anúncio)
Enviar mensagem

IMAGEM
Vestido de noiva impecável.`)
  assert.deepEqual(s.map((x) => x.title), ['TÍTULO (maior destaque)', 'SUBTÍTULO (abaixo, menor)', 'CTA (botão do anúncio)', 'IMAGEM'])
  assert.equal(s[2].kind, 'cta')
  assert.equal(s[3].kind, 'imagem')
})

test('linha que só começa com a palavra não vira cabeçalho', () => {
  // "Legenda" no meio de uma frase comum, terminando com ponto: é texto
  const s = parseBrief('Descrição simples de uma demanda, sem seções.\nLegenda do cliente precisa de revisão.')
  assert.equal(s.length, 1)
  assert.equal(s[0].kind, 'texto')
  assert.ok(s[0].body.includes('\n'))
})

test('descrição vazia não gera seção', () => {
  assert.deepEqual(parseBrief(''), [])
  assert.deepEqual(parseBrief(null), [])
  assert.equal(captionWithHashtags([]), null)
})
