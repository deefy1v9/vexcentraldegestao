import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GSC_SCOPE, buildRange, lastAvailableDate, addDays, isISODate, isDomainProperty,
  propertyLabel, canRead, totalsFromRow, formatCtr, formatPosition, variation,
  previousRange, cacheKey, isFresh, isStateUsable, mergeTokens, needsRefresh, stateExpiry, mergeScopes,
} from '../../lib/gsc-core'

const HOJE = '2026-09-09'

/* --------------------------------- escopo --------------------------------- */

test('escopo pedido é o de leitura, sem permissão de edição', () => {
  assert.equal(GSC_SCOPE, 'https://www.googleapis.com/auth/webmasters.readonly')
})

/* --------------------------------- datas --------------------------------- */

test('data disponível respeita o atraso do relatório', () => {
  assert.equal(lastAvailableDate(HOJE), '2026-09-06')
  assert.equal(lastAvailableDate(HOJE, 0), HOJE)
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.ok(isISODate('2026-09-09'))
  assert.equal(isISODate('2026-13-01'), false)
  assert.equal(isISODate('09/09/2026'), false)
})

test('28 dias terminam no último dia com dado', () => {
  const r = buildRange('28d', HOJE)
  assert.equal(r.endDate, '2026-09-06')
  assert.equal(r.startDate, '2026-08-10')
  assert.equal(r.label, 'Últimos 28 dias')
})

test('mês corrente não pede dias que ainda não existem', () => {
  const r = buildRange('mes', HOJE, { month: '2026-09' })
  assert.equal(r.startDate, '2026-09-01')
  assert.equal(r.endDate, '2026-09-06')
  assert.equal(r.label, 'Setembro de 2026')
})

test('mês fechado usa o mês inteiro', () => {
  const r = buildRange('mes', HOJE, { month: '2026-07' })
  assert.equal(r.startDate, '2026-07-01')
  assert.equal(r.endDate, '2026-07-31')
})

test('ano corrente para no último dia disponível; ano fechado vai até dezembro', () => {
  const atual = buildRange('ano', HOJE, { year: 2026 })
  assert.equal(atual.startDate, '2026-01-01')
  assert.equal(atual.endDate, '2026-09-06')
  const passado = buildRange('ano', HOJE, { year: 2025 })
  assert.equal(passado.endDate, '2025-12-31')
})

test('intervalo personalizado é limitado ao dado disponível', () => {
  const r = buildRange('custom', HOJE, { startDate: '2026-08-01', endDate: '2026-09-30' })
  assert.equal(r.startDate, '2026-08-01')
  assert.equal(r.endDate, '2026-09-06')
  // intervalo inválido cai no padrão de 28 dias
  assert.equal(buildRange('custom', HOJE, { startDate: 'ontem' }).kind, '28d')
})

test('período anterior tem o mesmo tamanho e termina na véspera', () => {
  const anterior = previousRange({ startDate: '2026-09-01', endDate: '2026-09-10' })
  assert.deepEqual(anterior, { startDate: '2026-08-22', endDate: '2026-08-31' })
})

/* ------------------------------ propriedades ------------------------------ */

test('propriedade de domínio não vira URL', () => {
  const dominio = 'sc-domain:vexgrowth.com.br'
  assert.ok(isDomainProperty(dominio))
  assert.equal(propertyLabel(dominio), 'vexgrowth.com.br')
  // o identificador em si nunca muda
  assert.equal(dominio, 'sc-domain:vexgrowth.com.br')
})

test('prefixo de URL é preservado como veio', () => {
  assert.equal(isDomainProperty('https://vexgrowth.com.br/'), false)
  assert.equal(propertyLabel('https://vexgrowth.com.br/'), 'https://vexgrowth.com.br')
})

test('conta sem verificação não lê relatório', () => {
  assert.equal(canRead('siteUnverifiedUser'), false)
  assert.ok(canRead('siteOwner'))
  assert.ok(canRead('siteRestrictedUser'))
})

/* --------------------------------- métricas --------------------------------- */

test('totais vêm da linha sem dimensão, não da soma da tabela', () => {
  const t = totalsFromRow({ clicks: 1234.4, impressions: 98765.6, ctr: 0.0125, position: 12.34 })
  assert.equal(t.clicks, 1234)
  assert.equal(t.impressions, 98766)
  assert.equal(formatCtr(t.ctr), '1,25%')
  assert.equal(formatPosition(t.position), '12,3')
})

test('sem dados, total é zero e posição fica sem número', () => {
  const t = totalsFromRow(undefined)
  assert.deepEqual(t, { clicks: 0, impressions: 0, ctr: 0, position: 0 })
  assert.equal(formatPosition(0), '—')
})

test('variação sem base de comparação devolve null', () => {
  assert.equal(variation(10, 0), null)
  assert.equal(variation(150, 100), 50)
})

/* ---------------------------------- cache ---------------------------------- */

test('chave de cache separa propriedade, período e tipo', () => {
  const r = { startDate: '2026-08-10', endDate: '2026-09-06' }
  assert.equal(cacheKey('p1', r, 'totais'), 'p1:2026-08-10:2026-09-06:totais')
  assert.notEqual(cacheKey('p1', r, 'totais'), cacheKey('p2', r, 'totais'))
  assert.notEqual(cacheKey('p1', r, 'totais'), cacheKey('p1', r, 'consultas'))
})

test('cache vencido não é reaproveitado', () => {
  const agora = new Date('2026-09-09T12:00:00Z')
  assert.ok(isFresh(new Date('2026-09-09T12:05:00Z'), agora))
  assert.equal(isFresh(new Date('2026-09-09T11:55:00Z'), agora), false)
})

/* ---------------------------------- OAuth ---------------------------------- */

test('state é de uso único e expira', () => {
  const agora = new Date('2026-09-09T12:00:00Z')
  const valido = { usedAt: null, expiresAt: new Date('2026-09-09T12:05:00Z') }
  assert.ok(isStateUsable(valido, agora).ok)
  assert.equal(isStateUsable({ usedAt: agora, expiresAt: new Date('2026-09-09T12:05:00Z') }, agora).ok, false)
  assert.equal(isStateUsable({ usedAt: null, expiresAt: new Date('2026-09-09T11:59:00Z') }, agora).ok, false)
  assert.equal(isStateUsable(null, agora).ok, false)
  assert.ok(stateExpiry(agora).getTime() > agora.getTime())
})

test('renovação não apaga refresh token válido', () => {
  const atual = { refreshToken: 'refresh-antigo', accessToken: 'access-antigo', expiryDate: new Date('2026-09-09T12:00:00Z') }
  // Google não reenvia refresh_token na renovação
  const semRefresh = mergeTokens(atual, { access_token: 'access-novo', expiry_date: 1757500000000 })
  assert.equal(semRefresh.refreshToken, 'refresh-antigo')
  assert.equal(semRefresh.accessToken, 'access-novo')
  // string vazia também não sobrescreve
  assert.equal(mergeTokens(atual, { refresh_token: '  ' }).refreshToken, 'refresh-antigo')
  // reautorização com refresh novo, aí sim troca
  assert.equal(mergeTokens(atual, { refresh_token: 'refresh-novo' }).refreshToken, 'refresh-novo')
})

test('token vencido ou perto do fim precisa renovar', () => {
  const agora = new Date('2026-09-09T12:00:00Z')
  assert.ok(needsRefresh(null, agora))
  assert.ok(needsRefresh(new Date('2026-09-09T11:59:00Z'), agora))
  assert.ok(needsRefresh(new Date('2026-09-09T12:00:30Z'), agora))
  assert.equal(needsRefresh(new Date('2026-09-09T13:00:00Z'), agora), false)
})

test('escopos somam sem repetir e sem perder o anterior', () => {
  const gsc = 'https://www.googleapis.com/auth/webmasters.readonly openid'
  const ga = 'https://www.googleapis.com/auth/analytics.readonly openid'
  const junto = mergeScopes(gsc, ga)
  assert.ok(junto.includes('webmasters.readonly'))
  assert.ok(junto.includes('analytics.readonly'))
  // openid aparece uma vez só
  assert.equal(junto.split(' ').filter((s) => s === 'openid').length, 1)
  // separador é espaço de verdade: nada pode quebrar a string no meio
  assert.equal(mergeScopes('https://a/scope', null), 'https://a/scope')
  assert.equal(mergeScopes(null, null), '')
})
