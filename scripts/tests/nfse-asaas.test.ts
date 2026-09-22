import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asaasNfseRef, buildAsaasInvoicePayload, mapAsaasInvoiceStatus, nationalServiceCode } from '../../lib/nfse-asaas'

test('status do Asaas vira o vocabulário interno', () => {
  assert.equal(mapAsaasInvoiceStatus('SCHEDULED'), 'PROCESSANDO')
  assert.equal(mapAsaasInvoiceStatus('SYNCHRONIZED'), 'PROCESSANDO')
  assert.equal(mapAsaasInvoiceStatus('AUTHORIZED'), 'AUTORIZADO')
  assert.equal(mapAsaasInvoiceStatus('ERROR'), 'ERRO_AUTORIZACAO')
  assert.equal(mapAsaasInvoiceStatus('CANCELED'), 'CANCELADO')
  assert.equal(mapAsaasInvoiceStatus('CANCELLATION_DENIED'), 'ERRO_CANCELAMENTO')
  assert.equal(mapAsaasInvoiceStatus(undefined), 'PROCESSANDO')
})

test('código nacional: item 17.06 vira 17.06.01 (170601); código explícito prevalece', () => {
  assert.equal(nationalServiceCode({ itemListaServico: '17.06' }), '170601')
  assert.equal(nationalServiceCode({ itemListaServico: '1.04' }), '010401')
  assert.equal(nationalServiceCode({ itemListaServico: '17.06', codigoTributacao: '17.06.02' }), '170602')
  assert.equal(nationalServiceCode({ itemListaServico: '17.06', codigoTributacao: '17.06' }), '170601')
  assert.equal(nationalServiceCode({ itemListaServico: null }), undefined)
})

test('payload da nota: cobrança, competência na descrição, itens e ISS', () => {
  const p = buildAsaasInvoicePayload({
    chargeId: 'ch1',
    paymentId: 'pay_1',
    value: 5,
    competencia: '09/2026',
    description: 'Serviços de marketing referente à competência [MM/AAAA].',
    items: [{ description: 'Social media', cents: 500 }],
    aliquotaIss: 2.01,
    cfg: { itemListaServico: '17.06', issRetido: false },
  })
  assert.equal(p.payment, 'pay_1')
  assert.equal(p.value, 5)
  assert.equal(p.deductions, 0)
  assert.equal(p.externalReference, asaasNfseRef('ch1'))
  assert.equal(p.municipalServiceCode, '170601')
  assert.match(p.serviceDescription, /competência 09\/2026/)
  assert.match(p.serviceDescription, /Social media — R\$\s?5,00/)
  assert.deepEqual(p.taxes, { retainIss: false, iss: 2.01, cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0 })
  assert.match(p.effectiveDate, /^\d{4}-\d{2}-\d{2}$/)
})
