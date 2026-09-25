import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audioMime, isAudioMessage, mediaCandidates, parseDueDay, toGeminiFunctionDeclarations } from '../../lib/ai/media'

test('detecta áudio nos formatos da UAZAPI', () => {
  assert.equal(isAudioMessage({ type: 'audio' }), true)
  assert.equal(isAudioMessage({ messageType: 'ptt' }), true)
  assert.equal(isAudioMessage({ mimetype: 'audio/ogg; codecs=opus' }), true)
  assert.equal(isAudioMessage({ message: { audioMessage: { seconds: 3 } } }), true)
  assert.equal(isAudioMessage({ content: { mimetype: 'audio/mpeg' } }), true)
  assert.equal(isAudioMessage({ type: 'text', text: 'oi' }), false)
  assert.equal(isAudioMessage({ type: 'image', caption: 'foto' }), false)
})

test('mídia: pega link ou base64 do payload, ignora lixo', () => {
  const url = 'https://cdn.uazapi.com/media/abc123def456ghi.ogg'
  assert.deepEqual(mediaCandidates({ mediaUrl: url }), [url])
  assert.deepEqual(mediaCandidates({ content: { url } }), [url])
  assert.deepEqual(mediaCandidates({ url: 'curto' }), [])
  assert.deepEqual(mediaCandidates({ type: 'audio' }), [])
})

test('mime do áudio: usa o do payload ou cai em ogg', () => {
  assert.equal(audioMime({ mimetype: 'audio/mpeg' }), 'audio/mpeg')
  assert.equal(audioMime({ mimetype: 'audio/ogg; codecs=opus' }), 'audio/ogg')
  assert.equal(audioMime({ mimetype: 'image/png' }), 'audio/ogg')
  assert.equal(audioMime({}), 'audio/ogg')
})

test('ferramentas viram declarações do Gemini com o mesmo schema', () => {
  const decl = toGeminiFunctionDeclarations([
    { name: 'x', description: 'faz x', input_schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } },
  ])
  assert.equal(decl.length, 1)
  assert.equal(decl[0].name, 'x')
  assert.deepEqual(decl[0].parametersJsonSchema, { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] })
})

test('prazo: YYYY-MM-DD vira meio-dia UTC; formato errado é nulo', () => {
  assert.equal(parseDueDay('2026-09-30')?.toISOString(), '2026-09-30T12:00:00.000Z')
  assert.equal(parseDueDay('2026-09-30T09:00:00-03:00')?.toISOString(), '2026-09-30T12:00:00.000Z')
  assert.equal(parseDueDay('30/09/2026'), null)
  assert.equal(parseDueDay(undefined), null)
})
