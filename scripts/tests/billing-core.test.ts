import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeCompetenceCents, dueDateFor, chargeExternalRef, nfseRef,
  focusBasicAuth, shouldGenerateNow, webhookEventKey, validateEmails,
  missingBillingFields, missingFiscalConfigFields, centsToDecimalString,
  isAliquotaIssValid, applyCompetenceToDescription,
} from '../../lib/billing-core'

const activeClient = { status: 'ATIVO', contractEnd: null }

test('cálculo dos serviços ativos na competência', () => {
  const services = [
    { monthlyValue: 1500.5, status: 'ATIVO' },
    { monthlyValue: 500, status: 'ATIVO' },
    { monthlyValue: 999, status: 'CANCELADO' }, // inativo não soma
    { monthlyValue: null, status: 'ATIVO' }, // sem valor não soma
  ]
  assert.equal(computeCompetenceCents(activeClient, services, 2026, 8), 200050)
})

test('serviço fora do período da competência não soma', () => {
  const services = [
    { monthlyValue: 100, status: 'ATIVO', startDate: new Date('2026-09-15') }, // começa depois
    { monthlyValue: 200, status: 'ATIVO', endDate: new Date('2026-07-10') }, // terminou antes
    { monthlyValue: 300, status: 'ATIVO', startDate: new Date('2026-08-01') }, // válido
  ]
  assert.equal(computeCompetenceCents(activeClient, services, 2026, 8), 30000)
})

test('contrato encerrado antes da competência: nada a cobrar', () => {
  const client = { status: 'ATIVO', contractEnd: new Date('2026-07-31') }
  const services = [{ monthlyValue: 1000, status: 'ATIVO' }]
  assert.equal(computeCompetenceCents(client, services, 2026, 8), 0)
})

test('cliente inativo: nada a cobrar', () => {
  const client = { status: 'INATIVO' }
  assert.equal(computeCompetenceCents(client, [{ monthlyValue: 100, status: 'ATIVO' }], 2026, 8), 0)
})

test('vencimento em meses menores usa o último dia válido', () => {
  assert.equal(dueDateFor(2026, 2, 30), '2026-02-28') // fevereiro comum
  assert.equal(dueDateFor(2028, 2, 30), '2028-02-29') // bissexto
  assert.equal(dueDateFor(2026, 4, 31), '2026-04-30')
  assert.equal(dueDateFor(2026, 8, 10), '2026-08-10')
})

test('referências determinísticas', () => {
  assert.equal(chargeExternalRef('abc123', 2026, 3), 'billing:abc123:2026-03')
  assert.equal(nfseRef('charge9'), 'nfse:charge9')
})

test('mesma competência gera sempre a mesma referência (dedupe)', () => {
  assert.equal(chargeExternalRef('c1', 2026, 12), chargeExternalRef('c1', 2026, 12))
  assert.notEqual(chargeExternalRef('c1', 2026, 12), chargeExternalRef('c1', 2027, 1))
})

test('autenticação Focus: Basic Base64(token:)', () => {
  assert.equal(focusBasicAuth('tok123'), `Basic ${Buffer.from('tok123:').toString('base64')}`)
})

test('janela de antecedência sem cobranças retroativas', () => {
  assert.equal(shouldGenerateNow('2026-08-15', '2026-08-20', 10), true) // dentro
  assert.equal(shouldGenerateNow('2026-08-01', '2026-08-20', 10), false) // cedo demais
  assert.equal(shouldGenerateNow('2026-08-25', '2026-08-20', 10), false) // retroativa
  assert.equal(shouldGenerateNow('2026-08-20', '2026-08-20', 10), true) // no dia
})

test('chave idempotente de webhook é estável e distinta', () => {
  const a = webhookEventKey('FOCUS', ['ref1', 'autorizado', '123'])
  const b = webhookEventKey('FOCUS', ['ref1', 'autorizado', '123'])
  const c = webhookEventKey('FOCUS', ['ref1', 'cancelado', '123'])
  assert.equal(a, b)
  assert.notEqual(a, c)
})

test('validação de e-mails: inválidos fora, máximo 10', () => {
  const many = Array.from({ length: 12 }, (_, i) => `x${i}@dominio.com.br`)
  const { ok, invalid } = validateEmails([...many, 'sem-arroba', ' '])
  assert.equal(ok.length, 10)
  assert.ok(invalid.includes('sem-arroba'))
})

test('campos obrigatórios de cobrança apontados claramente', () => {
  const missing = missingBillingFields({ name: 'X', cnpj: '', billingEmail: '', email: null, paymentDay: null })
  assert.deepEqual(missing, ['CPF/CNPJ', 'E-mail financeiro', 'Dia de vencimento'])
  assert.deepEqual(missingBillingFields({ name: 'X', cnpj: '00.000.000/0001-00', billingEmail: 'f@x.com', paymentDay: 10 }), [])
})

test('configuração fiscal incompleta bloqueia com lista de faltas', () => {
  const missing = missingFiscalConfigFields({})
  assert.ok(missing.includes('CNPJ do prestador'))
  assert.ok(missing.includes('Inscrição Municipal'))
  assert.ok(missing.includes('Chave de autenticação do Web Service da prefeitura'))
  assert.equal(missingFiscalConfigFields({
    cnpj: '1', razaoSocial: 'r', inscricaoMunicipal: 'i', codigoMunicipio: 'c',
    naturezaOperacao: '1', itemListaServico: '17.06', codigoServicoMunicipal: '999',
    descricaoPadrao: 'd', wsKeyConfigured: true,
  }).length, 0)
})

test('município sem código municipal do serviço não exige o campo', () => {
  // Osasco/SP (3534401) não utiliza o código municipal do serviço
  const osasco = missingFiscalConfigFields({
    cnpj: '1', razaoSocial: 'r', inscricaoMunicipal: 'i', codigoMunicipio: '3534401',
    naturezaOperacao: '1', itemListaServico: '17.06', descricaoPadrao: 'd',
    wsKeyConfigured: true,
  })
  assert.equal(osasco.length, 0)
  const outro = missingFiscalConfigFields({
    cnpj: '1', razaoSocial: 'r', inscricaoMunicipal: 'i', codigoMunicipio: '3550308',
    naturezaOperacao: '1', itemListaServico: '17.06', descricaoPadrao: 'd',
    wsKeyConfigured: true,
  })
  assert.deepEqual(outro, ['Código municipal do serviço'])
})

test('alíquota do ISS só é válida entre 2% e 5%', () => {
  assert.equal(isAliquotaIssValid(2), true)
  assert.equal(isAliquotaIssValid(3.5), true)
  assert.equal(isAliquotaIssValid(5), true)
  assert.equal(isAliquotaIssValid(1.99), false)
  assert.equal(isAliquotaIssValid(5.01), false)
  assert.equal(isAliquotaIssValid(null), false)
  assert.equal(isAliquotaIssValid('abc'), false)
})

test('descrição padrão recebe a competência no marcador [MM/AAAA]', () => {
  assert.equal(
    applyCompetenceToDescription('Serviços referentes à competência [MM/AAAA].', '08/2026'),
    'Serviços referentes à competência 08/2026.',
  )
  // Sem marcador, a competência é anexada ao final
  assert.equal(
    applyCompetenceToDescription('Serviços de marketing', '08/2026'),
    'Serviços de marketing — competência 08/2026',
  )
})

test('centavos para decimal sem float', () => {
  assert.equal(centsToDecimalString(200050), '2000.50')
  assert.equal(centsToDecimalString(1), '0.01')
})
