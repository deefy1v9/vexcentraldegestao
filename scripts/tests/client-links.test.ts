import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeProfileUrl, linkHandle, clientLinks } from '../../lib/client-links'

test('URL completa é mantida como está', () => {
  assert.equal(normalizeProfileUrl('instagram', 'https://www.instagram.com/cxlabbrazil/'), 'https://www.instagram.com/cxlabbrazil/')
})

test('handle e @handle viram URL canônica', () => {
  assert.equal(normalizeProfileUrl('instagram', '@cxlabbrazil'), 'https://www.instagram.com/cxlabbrazil')
  assert.equal(normalizeProfileUrl('instagram', 'cxlabbrazil'), 'https://www.instagram.com/cxlabbrazil')
  assert.equal(normalizeProfileUrl('tiktok', 'cxlab'), 'https://www.tiktok.com/@cxlab')
  assert.equal(normalizeProfileUrl('linkedin', 'cxlab'), 'https://www.linkedin.com/company/cxlab')
  assert.equal(normalizeProfileUrl('youtube', 'cxlab'), 'https://www.youtube.com/@cxlab')
})

test('site sem protocolo ganha https', () => {
  assert.equal(normalizeProfileUrl('website', 'vexgrowth.com.br'), 'https://vexgrowth.com.br')
  assert.equal(normalizeProfileUrl('instagram', 'instagram.com/cxlabbrazil'), 'https://instagram.com/cxlabbrazil')
})

test('vazio vira null', () => {
  assert.equal(normalizeProfileUrl('instagram', ''), null)
  assert.equal(normalizeProfileUrl('instagram', '   '), null)
  assert.equal(normalizeProfileUrl('website', null), null)
})

test('handle curto para o chip', () => {
  assert.equal(linkHandle('instagram', 'https://www.instagram.com/cxlabbrazil/'), '@cxlabbrazil')
  assert.equal(linkHandle('website', 'https://www.vexgrowth.com.br/sobre'), 'vexgrowth.com.br')
  assert.equal(linkHandle('youtube', 'https://www.youtube.com/@cxlab'), '@cxlab')
})

test('clientLinks só lista o que está preenchido, na ordem fixa', () => {
  const links = clientLinks({ instagram: 'https://www.instagram.com/cxlabbrazil/', website: 'cxlab.com.br', facebook: '' })
  assert.deepEqual(links.map((l) => l.kind), ['website', 'instagram'])
  assert.equal(links[1].handle, '@cxlabbrazil')
  assert.equal(links[1].label, 'Instagram')
  assert.deepEqual(clientLinks(null), [])
})
