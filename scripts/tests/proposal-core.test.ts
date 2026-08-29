import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidCPF, isValidCNPJ, isValidDocument, personTypeOf, formatDocument, maskDocument,
  formatPhone, formatZip, toCents, formatBRL, percentOf, itemTotals, proposalTotals,
  formatProposalNumber, proposalPrefix, spTodayISO, addDaysISO, formatDateBR, isExpired,
  extractPlaceholders, renderTemplate, missingProposalFields, compareAddendum, safeFileName,
  onlyDigits, centsToNumber,
  type ProposalItemInput,
} from '../../lib/proposal-core'
import { buildValues, missingPlaceholders, type ProposalRenderData } from '../../lib/proposal-pdf'
import { DEFAULT_TEMPLATE, ADDENDUM_TEMPLATE, VEX } from '../../lib/proposal-template'

/**
 * Testes das regras de proposta. Nada aqui chama o banco, gera documento de
 * produção, envia e-mail ou cria proposta real: são funções puras.
 */

/* -------------------------------- documentos -------------------------------- */

test('CPF válido e inválido', () => {
  assert.equal(isValidCPF('529.982.247-25'), true)
  assert.equal(isValidCPF('52998224725'), true)
  assert.equal(isValidCPF('529.982.247-26'), false) // dígito trocado
  assert.equal(isValidCPF('111.111.111-11'), false) // sequência repetida
  assert.equal(isValidCPF('123'), false)
  assert.equal(isValidCPF(''), false)
})

test('CNPJ válido e inválido', () => {
  assert.equal(isValidCNPJ('68.652.648/0001-86'), true) // CNPJ da VEX
  assert.equal(isValidCNPJ('68652648000186'), true)
  assert.equal(isValidCNPJ('68.652.648/0001-87'), false)
  assert.equal(isValidCNPJ('00.000.000/0000-00'), false)
  assert.equal(isValidCNPJ('68652648'), false)
})

test('tipo de pessoa vem do tamanho do documento', () => {
  assert.equal(personTypeOf('52998224725'), 'PF')
  assert.equal(personTypeOf('68652648000186'), 'PJ')
  assert.equal(isValidDocument('52998224725', 'PF'), true)
  assert.equal(isValidDocument('52998224725', 'PJ'), false)
  assert.equal(isValidDocument('68652648000186'), true)
})

test('máscaras de documento, telefone e CEP', () => {
  assert.equal(formatDocument('52998224725'), '529.982.247-25')
  assert.equal(formatDocument('68652648000186'), '68.652.648/0001-86')
  assert.equal(formatPhone('31991465195'), '(31) 99146-5195')
  assert.equal(formatPhone('5531991465195'), '(31) 99146-5195')
  assert.equal(formatZip('31520100'), '31520-100')
  assert.equal(onlyDigits('68.652.648/0001-86'), '68652648000186')
})

test('documento aparece mascarado em listas e logs', () => {
  const masked = maskDocument('52998224725')
  assert.equal(masked, '***.982.***-**')
  assert.ok(!masked.includes('529'))
  assert.ok(!masked.includes('47'))
  assert.equal(maskDocument('68652648000186'), '**.652.***/****-**')
  assert.equal(maskDocument(null), '***')
})

/* --------------------------------- dinheiro --------------------------------- */

test('conversão para centavos aceita formato brasileiro sem usar float', () => {
  assert.equal(toCents('1.234,56'), 123456)
  assert.equal(toCents('967,00'), 96700)
  assert.equal(toCents('1234.56'), 123456)
  assert.equal(toCents(2600), 260000)
  assert.equal(toCents(''), 0)
  assert.equal(toCents(null), 0)
  // 0.1 + 0.2 em float dá 0.30000000000000004; em centavos, exato
  assert.equal(toCents('0,10') + toCents('0,20'), 30)
  assert.equal(centsToNumber(30), 0.3)
})

test('formatação em Real brasileiro', () => {
  assert.match(formatBRL(260000), /2\.600,00/)
  assert.match(formatBRL(96700), /967,00/)
  assert.match(formatBRL(0), /0,00/)
})

test('percentual sobre centavos arredonda para o centavo', () => {
  assert.equal(percentOf(10000, 10), 1000)
  assert.equal(percentOf(96700, 15), 14505)
  assert.equal(percentOf(333, 33.33), 111)
  assert.equal(percentOf(10000, 0), 0)
})

/* ---------------------------------- itens ---------------------------------- */

function item(partial: Partial<ProposalItemInput> = {}): ProposalItemInput {
  return {
    name: 'Social Media', quantity: 1, monthlyCents: 96700, setupCents: 0,
    discountCents: 0, discountPercent: null, months: 6, periodicity: 'MENSAL',
    ...partial,
  }
}

test('item mensal: total é mensalidade × meses', () => {
  const t = itemTotals(item())
  assert.equal(t.monthlyCents, 96700)
  assert.equal(t.setupCents, 0)
  assert.equal(t.totalCents, 96700 * 6)
})

test('item de pagamento único não multiplica por meses', () => {
  const t = itemTotals(item({ periodicity: 'UNICO', monthlyCents: 0, setupCents: 200000, months: 6 }))
  assert.equal(t.monthlyCents, 0)
  assert.equal(t.setupCents, 200000)
  assert.equal(t.totalCents, 200000)
})

test('quantidade multiplica o valor do item', () => {
  const t = itemTotals(item({ quantity: 3, monthlyCents: 50000 }))
  assert.equal(t.monthlyCents, 150000)
  assert.equal(t.totalCents, 150000 * 6)
})

test('desconto fixo e percentual somam e nunca deixam o item negativo', () => {
  assert.equal(itemTotals(item({ discountCents: 20000 })).monthlyCents, 76700)
  assert.equal(itemTotals(item({ discountPercent: 10 })).monthlyCents, 96700 - 9670)
  assert.equal(itemTotals(item({ discountCents: 10000, discountPercent: 10 })).monthlyCents, 96700 - 9670 - 10000)
  const over = itemTotals(item({ discountCents: 999999 }))
  assert.equal(over.monthlyCents, 0)
  assert.equal(over.totalCents, 0)
})

/* -------------------------------- proposta -------------------------------- */

test('exemplo da especificação: social media + site + meta ads', () => {
  const totals = proposalTotals([
    item({ name: 'Social Media', monthlyCents: 96700, months: 6 }),
    item({ name: 'Site', periodicity: 'UNICO', monthlyCents: 0, setupCents: 200000, months: 0 }),
    item({ name: 'Meta Ads', monthlyCents: 60000, months: 6 }),
  ])
  assert.equal(totals.monthlyCents, 96700 + 60000) // mensalidade recorrente
  assert.equal(totals.setupCents, 200000) // pagamento inicial
  assert.equal(totals.months, 6)
  assert.equal(totals.totalCents, (96700 + 60000) * 6 + 200000)
})

test('durações diferentes: a vigência é a maior entre os recorrentes', () => {
  const totals = proposalTotals([
    item({ months: 6 }),
    item({ name: 'SEO', monthlyCents: 50000, months: 12 }),
  ])
  assert.equal(totals.months, 12)
  assert.equal(totals.totalCents, (96700 + 50000) * 12)
})

test('desconto geral incide sobre o total da vigência', () => {
  const base = proposalTotals([item({ monthlyCents: 100000, months: 10 })])
  assert.equal(base.totalCents, 1000000)
  const withFixed = proposalTotals([item({ monthlyCents: 100000, months: 10 })], { discountCents: 50000 })
  assert.equal(withFixed.totalCents, 950000)
  const withPercent = proposalTotals([item({ monthlyCents: 100000, months: 10 })], { discountPercent: 10 })
  assert.equal(withPercent.totalCents, 900000)
  const clamped = proposalTotals([item({ monthlyCents: 100000, months: 10 })], { discountCents: 99999999 })
  assert.equal(clamped.totalCents, 0)
})

test('proposta sem itens tem totais zerados', () => {
  const totals = proposalTotals([])
  assert.equal(totals.totalCents, 0)
  assert.equal(totals.months, 0)
})

/* -------------------------------- numeração -------------------------------- */

test('numeração sequencial legível por tipo e ano', () => {
  assert.equal(formatProposalNumber('PROPOSTA', 2026, 1), 'PROP-2026-0001')
  assert.equal(formatProposalNumber('PROPOSTA', 2026, 42), 'PROP-2026-0042')
  assert.equal(formatProposalNumber('ADITIVO', 2026, 7), 'ADT-2026-0007')
  assert.equal(proposalPrefix('ADITIVO'), 'ADT')
})

test('concorrência: sequências diferentes nunca geram o mesmo número', () => {
  const numbers = new Set([1, 2, 3, 4, 5].map((s) => formatProposalNumber('PROPOSTA', 2026, s)))
  assert.equal(numbers.size, 5)
  // O mesmo (tipo, ano, seq) é sempre o mesmo texto — o unique do banco decide o vencedor
  assert.equal(formatProposalNumber('PROPOSTA', 2026, 3), formatProposalNumber('PROPOSTA', 2026, 3))
  assert.notEqual(formatProposalNumber('PROPOSTA', 2026, 3), formatProposalNumber('ADITIVO', 2026, 3))
})

/* ---------------------------------- datas ---------------------------------- */

test('datas no fuso de São Paulo, sem deslocamento', () => {
  // 03:00 UTC de 30/08 ainda é 29/08 em São Paulo
  assert.equal(spTodayISO(new Date('2026-08-30T02:00:00Z')), '2026-08-29')
  assert.equal(addDaysISO('2026-08-29', 15), '2026-09-13')
  assert.equal(formatDateBR('2026-08-29'), '29/08/2026')
  assert.equal(formatDateBR(null), '')
})

test('proposta expira no dia seguinte à validade', () => {
  assert.equal(isExpired('2026-08-28', '2026-08-29'), true)
  assert.equal(isExpired('2026-08-29', '2026-08-29'), false) // vence hoje ainda vale
  assert.equal(isExpired('2026-09-30', '2026-08-29'), false)
})

/* ------------------------------- placeholders ------------------------------- */

test('placeholders são extraídos e substituídos de forma determinística', () => {
  const text = 'Olá {{cliente_nome}}, documento {{cliente_documento}}, total {{valor_total}}.'
  assert.deepEqual(extractPlaceholders(text).sort(), ['cliente_documento', 'cliente_nome', 'valor_total'])
  const r = renderTemplate(text, { cliente_nome: 'ACME', cliente_documento: '00.000.000/0001-00', valor_total: 'R$ 10,00' })
  assert.equal(r.text, 'Olá ACME, documento 00.000.000/0001-00, total R$ 10,00.')
  assert.deepEqual(r.missing, [])
  // Duas execuções com os mesmos valores dão exatamente o mesmo texto
  assert.equal(renderTemplate(text, { cliente_nome: 'ACME', cliente_documento: 'x', valor_total: 'y' }).text,
    renderTemplate(text, { cliente_nome: 'ACME', cliente_documento: 'x', valor_total: 'y' }).text)
})

test('placeholder sem valor é reportado e nunca aparece no documento', () => {
  const r = renderTemplate('Cliente {{cliente_nome}} — {{campo_vazio}}', { cliente_nome: 'ACME', campo_vazio: null })
  assert.deepEqual(r.missing, ['campo_vazio'])
  assert.ok(!r.text.includes('{{'))
  assert.ok(!r.text.includes('null'))
  assert.ok(!r.text.includes('undefined'))
  for (const value of [undefined, '', '   ']) {
    const out = renderTemplate('{{x}}', { x: value })
    assert.deepEqual(out.missing, ['x'])
    assert.equal(out.text.trim(), '')
  }
})

/* ---------------------------- campos obrigatórios ---------------------------- */

test('campos obrigatórios bloqueiam a geração', () => {
  const missing = missingProposalFields({})
  assert.ok(missing.includes('Nome ou razão social'))
  assert.ok(missing.includes('CPF/CNPJ'))
  assert.ok(missing.includes('Data da proposta'))
  assert.ok(missing.includes('Validade'))
  assert.ok(missing.includes('Ao menos um serviço'))

  assert.deepEqual(missingProposalFields({
    recipientName: 'ACME', document: '68652648000186',
    issueDate: '2026-08-29', validUntil: '2026-09-13',
    items: [{ name: 'Social Media', monthlyCents: 96700, periodicity: 'MENSAL' }],
  }), [])
})

test('documento inválido e validade anterior à emissão são apontados', () => {
  const missing = missingProposalFields({
    recipientName: 'ACME', document: '11111111111',
    issueDate: '2026-09-10', validUntil: '2026-09-01',
    items: [{ name: 'X', monthlyCents: 100 }],
  })
  assert.ok(missing.includes('CPF/CNPJ válido'))
  assert.ok(missing.includes('Validade posterior à data da proposta'))
})

test('proposta com serviços zerados exige valor em ao menos um', () => {
  const missing = missingProposalFields({
    recipientName: 'ACME', document: '68652648000186',
    issueDate: '2026-08-29', validUntil: '2026-09-13',
    items: [{ name: 'Serviço', monthlyCents: 0, setupCents: 0 }],
  })
  assert.ok(missing.includes('Valor em ao menos um serviço'))
})

/* ------------------------------- documento ------------------------------- */

function renderData(partial: Partial<ProposalRenderData> = {}): ProposalRenderData {
  return {
    kind: 'PROPOSTA',
    number: 'PROP-2026-0001',
    issueDate: '2026-08-29',
    validUntil: '2026-09-13',
    startDate: '2026-09-01',
    paymentTerms: 'Parcelado em 3x no cartão',
    notes: null,
    recipient: {
      name: 'Cliente Exemplo Ltda', tradeName: null, document: '68652648000186', personType: 'PJ',
      contactName: 'Fulano', email: 'contato@exemplo.com.br', phone: '31991465195',
      zipCode: '31520100', street: 'Rua Exemplo', addressNumber: '131', complement: null,
      district: 'Centro', city: 'Belo Horizonte', state: 'MG',
    },
    items: [{
      name: 'Social Media', description: null, scope: 'Gestão de redes', deliverables: ['12 posts/mês'],
      quantity: 1, months: 6, periodicity: 'MENSAL', monthlyCents: 96700, setupCents: 0, discountCents: 0,
    }],
    totals: { monthlyCents: 96700, setupCents: 0, totalCents: 580200, months: 6, itemsDiscountCents: 0, generalDiscountCents: 0 },
    ...partial,
  }
}

test('valores do documento saem formatados e sem campo vazio', () => {
  const values = buildValues(renderData())
  assert.equal(values.cliente_documento, '68.652.648/0001-86')
  assert.equal(values.data_proposta, '29/08/2026')
  assert.match(values.valor_total, /5\.802,00/)
  assert.equal(values.duracao, '6 meses')
  assert.ok(values.cliente_qualificacao.includes('CNPJ'))
})

test('pessoa física recebe a qualificação correta no preâmbulo', () => {
  const values = buildValues(renderData({
    recipient: { ...renderData().recipient, personType: 'PF', document: '52998224725', name: 'Fulano de Tal' },
  }))
  assert.ok(values.cliente_qualificacao.includes('CPF'))
  assert.ok(values.cliente_qualificacao.includes('529.982.247-25'))
  assert.equal(values.cliente_nome_maiusculo, 'FULANO DE TAL')
})

test('documento completo não tem placeholder pendente', () => {
  assert.deepEqual(missingPlaceholders(renderData()), [])
  assert.deepEqual(missingPlaceholders(renderData({ kind: 'ADITIVO', parentNumber: 'PROP-2026-0001' })), [])
})

test('faltando dado do cliente, o documento é bloqueado', () => {
  const missing = missingPlaceholders(renderData({
    recipient: { ...renderData().recipient, email: null },
  }))
  assert.ok(missing.includes('cliente_email'))
})

test('modelo preserva os textos institucionais e os dados da VEX', () => {
  const blocks = JSON.stringify(DEFAULT_TEMPLATE.blocks)
  assert.equal(DEFAULT_TEMPLATE.title, 'PROPOSTA COMERCIAL')
  assert.equal(DEFAULT_TEMPLATE.subtitle, 'Serviços de Marketing Digital.')
  assert.ok(blocks.includes('CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARKETING DIGITAL'))
  assert.ok(blocks.includes('11. CONFIDENCIALIDADE E LGPD'))
  assert.ok(blocks.includes('13. TERMO DE ACEITE'))
  assert.ok(blocks.includes(VEX.cnpj))
  // Dados do cliente do modelo original não podem ter sobrado
  assert.ok(!blocks.includes('PRISCILA'))
  assert.ok(!blocks.includes('060.163.253-25'))
  assert.ok(!blocks.includes('priscilasousa10'))
  assert.ok(ADDENDUM_TEMPLATE.blocks.some((b) => b.kind === 'addendum'))
})

/* --------------------------------- aditivo --------------------------------- */

test('aditivo compara condição anterior e nova', () => {
  const cmp = compareAddendum([
    { name: 'Social Media', changeType: 'ALTERA', previousMonthlyCents: 96700, newMonthlyCents: 120000, previousMonths: 6, newMonths: 12 },
    { name: 'SEO', changeType: 'ADICIONA', previousMonthlyCents: 0, newMonthlyCents: 50000, previousMonths: 0, newMonths: 12 },
    { name: 'Meta Ads', changeType: 'REMOVE', previousMonthlyCents: 60000, newMonthlyCents: 0, previousMonths: 6, newMonths: 0 },
  ], 12)
  assert.equal(cmp.previousMonthlyCents, 156700)
  assert.equal(cmp.newMonthlyCents, 170000)
  assert.equal(cmp.deltaMonthlyCents, 13300)
  assert.equal(cmp.deltaTotalCents, 13300 * 12)
  assert.equal(cmp.lines[2].deltaMonthlyCents, -60000)
})

/* -------------------------------- arquivos -------------------------------- */

test('nome de arquivo é seguro para download', () => {
  assert.equal(safeFileName('PROP-2026-0001-v1', 'pdf'), 'PROP-2026-0001-v1.pdf')
  const traversal = safeFileName('Proposta Ação/Ç ../../etc/passwd', 'pdf')
  assert.equal(traversal, 'Proposta-Acao-C-.-.-etc-passwd.pdf')
  assert.ok(!traversal.includes('/'))
  assert.ok(!traversal.includes('..'))
  assert.equal(safeFileName('../../secret', 'pdf'), 'secret.pdf')
  assert.equal(safeFileName('', 'docx'), 'documento.docx')
})
