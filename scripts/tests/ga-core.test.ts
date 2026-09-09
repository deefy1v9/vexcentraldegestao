import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GA_SCOPE, isNumericPropertyId, isMeasurementId, normalizePropertyId,
  trafficDimensionFilter, TRAFFIC_LABEL, isTrafficFilter, totalsFromRow, formatRate,
  variation, eventStatus, suggestWhatsappEvents, whatsappSource, buildRange,
  previousRange, cacheKey, hasScope, grantedScopes, LEAD_EVENT_DEFAULT,
} from '../../lib/ga-core'

const HOJE = '2026-09-09'

test('escopo do Analytics é somente leitura', () => {
  assert.equal(GA_SCOPE, 'https://www.googleapis.com/auth/analytics.readonly')
})

/* ------------------------------ propriedade ------------------------------ */

test('relatório usa o ID numérico, não o de medição', () => {
  assert.ok(isNumericPropertyId('123456789'))
  assert.equal(isNumericPropertyId('G-ABC1234'), false)
  assert.ok(isMeasurementId('G-ABC1234'))
  assert.equal(isMeasurementId('123456789'), false)
  assert.equal(normalizePropertyId('properties/123456789'), '123456789')
  assert.equal(normalizePropertyId(' 123456789 '), '123456789')
  // ID de medição nunca vira ID de propriedade
  assert.equal(normalizePropertyId('G-ABC1234'), null)
})

/* -------------------------------- canais -------------------------------- */

test('busca orgânica filtra pelo grupo de canal', () => {
  const f = trafficDimensionFilter('organico') as { filter: { fieldName: string; stringFilter: { value: string } } }
  assert.equal(f.filter.fieldName, 'sessionDefaultChannelGroup')
  assert.equal(f.filter.stringFilter.value, 'Organic Search')
})

test('google orgânico combina origem e mídia', () => {
  const f = trafficDimensionFilter('google_organico') as { andGroup: { expressions: Array<{ filter: { fieldName: string; stringFilter: { value: string } } }> } }
  assert.equal(f.andGroup.expressions.length, 2)
  assert.deepEqual(
    f.andGroup.expressions.map((e) => [e.filter.fieldName, e.filter.stringFilter.value]),
    [['sessionSource', 'google'], ['sessionMedium', 'organic']],
  )
})

test('todos os canais não restringe nada', () => {
  assert.equal(trafficDimensionFilter('todos'), null)
  assert.ok(isTrafficFilter('organico'))
  assert.equal(isTrafficFilter('pago'), false)
  assert.equal(TRAFFIC_LABEL.organico, 'Busca orgânica')
})

/* -------------------------------- métricas -------------------------------- */

test('totais vêm da consulta do intervalo, na ordem das métricas', () => {
  const t = totalsFromRow([{ value: '1234' }, { value: '2000' }, { value: '5400' }, { value: '0.6321' }])
  assert.equal(t.totalUsers, 1234)
  assert.equal(t.sessions, 2000)
  assert.equal(t.screenPageViews, 5400)
  assert.equal(formatRate(t.engagementRate), '63,2%')
})

test('sem linha, tudo zero — e zero não é erro', () => {
  assert.deepEqual(totalsFromRow(undefined), { totalUsers: 0, sessions: 0, screenPageViews: 0, engagementRate: 0 })
})

test('variação sem base devolve null', () => {
  assert.equal(variation(100, 0), null)
  assert.equal(variation(120, 100), 20)
})

/* -------------------------------- eventos -------------------------------- */

test('estado do evento separa "não aconteceu" de "não configurado"', () => {
  assert.equal(eventStatus({ mapeado: false, ocorrenciasNoPeriodo: 0, existeEmAlgumaJanela: false }), 'NAO_VERIFICADO')
  assert.equal(eventStatus({ mapeado: true, ocorrenciasNoPeriodo: 5, existeEmAlgumaJanela: true }), 'VALIDADO')
  // aconteceu antes, mas não no período: continua configurado
  assert.equal(eventStatus({ mapeado: true, ocorrenciasNoPeriodo: 0, existeEmAlgumaJanela: true }), 'SEM_OCORRENCIA')
  assert.equal(eventStatus({ mapeado: true, ocorrenciasNoPeriodo: 0, existeEmAlgumaJanela: false }), 'CONFIGURACAO_NECESSARIA')
})

test('lead padrão do GA4 é generate_lead', () => {
  assert.equal(LEAD_EVENT_DEFAULT, 'generate_lead')
})

test('sugestão de evento de WhatsApp olha o nome', () => {
  const nomes = ['page_view', 'click', 'whatsapp_click', 'clique_zap', 'scroll']
  assert.deepEqual(suggestWhatsappEvents(nomes), ['whatsapp_click', 'clique_zap'])
})

test('evento próprio de WhatsApp manda; click genérico não soma junto', () => {
  assert.deepEqual(whatsappSource({ whatsappEvent: 'whatsapp_click', whatsappUrlContains: 'wa.me' }), { modo: 'evento', evento: 'whatsapp_click' })
  // só click: cai para o filtro de destino
  assert.deepEqual(whatsappSource({ whatsappEvent: 'click', whatsappUrlContains: 'wa.me' }), { modo: 'click', contem: 'wa.me' })
  assert.deepEqual(whatsappSource({ whatsappEvent: null, whatsappUrlContains: null }), { modo: 'indefinido' })
})

/* -------------------------------- períodos -------------------------------- */

test('28 dias termina ontem, sem misturar o dia incompleto', () => {
  const r = buildRange('28d', HOJE)
  assert.equal(r.endDate, '2026-09-08')
  assert.equal(r.startDate, '2026-08-12')
  assert.equal(r.emAndamento, false)
})

test('mês corrente aparece marcado como em andamento', () => {
  const r = buildRange('mes', HOJE, { month: '2026-09' })
  assert.equal(r.startDate, '2026-09-01')
  assert.equal(r.endDate, HOJE)
  assert.equal(r.emAndamento, true)
})

test('mês e ano fechados não ficam em andamento', () => {
  assert.equal(buildRange('mes', HOJE, { month: '2026-07' }).emAndamento, false)
  const ano = buildRange('ano', HOJE, { year: 2025 })
  assert.equal(ano.endDate, '2025-12-31')
  assert.equal(ano.emAndamento, false)
})

test('ano corrente para em hoje, sem projetar o resto', () => {
  const r = buildRange('ano', HOJE, { year: 2026 })
  assert.equal(r.startDate, '2026-01-01')
  assert.equal(r.endDate, HOJE)
  assert.ok(r.emAndamento)
})

test('período anterior tem o mesmo tamanho', () => {
  assert.deepEqual(previousRange({ startDate: '2026-09-01', endDate: '2026-09-10' }), { startDate: '2026-08-22', endDate: '2026-08-31' })
})

/* --------------------------- cache e escopos --------------------------- */

test('cache separa propriedade, período, canal e tipo', () => {
  const r = { startDate: '2026-08-12', endDate: '2026-09-08' }
  assert.equal(cacheKey('123', r, 'organico', 'totais'), '123:2026-08-12:2026-09-08:organico:totais')
  assert.notEqual(cacheKey('123', r, 'organico', 'totais'), cacheKey('123', r, 'todos', 'totais'))
})

test('escopo concedido é lido da resposta, não presumido', () => {
  const concedido = 'openid https://www.googleapis.com/auth/webmasters.readonly'
  assert.ok(hasScope(concedido, 'https://www.googleapis.com/auth/webmasters.readonly'))
  assert.equal(hasScope(concedido, GA_SCOPE), false)
  assert.equal(grantedScopes(null).length, 0)
  assert.ok(hasScope(`${concedido} ${GA_SCOPE}`, GA_SCOPE))
})
