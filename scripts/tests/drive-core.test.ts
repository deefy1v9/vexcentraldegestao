import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nomeDaPastaNova, normalizarNome, pastaDoCliente } from '../../lib/drive-core'

const pastas = [
  { id: '1', name: 'MOOP - ANA' },
  { id: '2', name: 'VEX GROWTH' },
  { id: '3', name: '_ENCERRADOS' },
  { id: '4', name: 'PROMO PRIME' },
  { id: '5', name: 'TRUSTED FOOTBALL' },
  { id: '6', name: 'Espaço Fada dos Pés' },
]

test('acha a pasta pela primeira palavra que importa e pelo maior número de palavras em comum', () => {
  assert.equal(pastaDoCliente('MOOP', pastas)?.id, '1')
  assert.equal(pastaDoCliente('Promo Prime / Fabio', pastas)?.id, '4')
  assert.equal(pastaDoCliente('Trusted Football Tickets', pastas)?.id, '5')
  assert.equal(pastaDoCliente('Espaço Fada dos Pés', pastas)?.id, '6')
})

test('nunca devolve a pasta modelo nem a de encerrados, e sem casamento devolve null', () => {
  assert.equal(pastaDoCliente('VEX Growth', pastas), null)
  assert.equal(pastaDoCliente('Cliente Novo Qualquer', pastas), null)
  assert.equal(pastaDoCliente('', pastas), null)
})

test('nome de pasta nova: maiúsculas, sem acento e sem sufixo', () => {
  assert.equal(nomeDaPastaNova('Trusted Football Tickets'), 'TRUSTED FOOTBALL TICKETS')
  assert.equal(nomeDaPastaNova('Promo Prime / Fabio'), 'PROMO PRIME')
  assert.equal(nomeDaPastaNova('Bruna Marcon Estética LTDA'), 'BRUNA MARCON ESTETICA')
  assert.equal(normalizarNome('Fada dos Pés'), 'FADA DOS PES')
})
