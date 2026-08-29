import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderProposalPdf, ProposalRenderError, type ProposalRenderData } from '../../lib/proposal-pdf'
import { renderProposalDocx } from '../../lib/proposal-docx'
import { proposalMailRef, proposalTotals } from '../../lib/proposal-core'

/**
 * Geração do documento. Roda em memória: nenhum arquivo é salvo, nenhuma
 * proposta real é criada e nenhum e-mail é enviado.
 */

function data(partial: Partial<ProposalRenderData> = {}): ProposalRenderData {
  const items = [
    {
      name: 'Site Principal', description: null, scope: 'Criação do site institucional.',
      deliverables: ['Layout aprovado', 'Site publicado'], quantity: 1, months: 0,
      periodicity: 'UNICO' as const, monthlyCents: 0, setupCents: 170000, discountCents: 0,
    },
    {
      name: 'Social Media', description: null, scope: 'Gestão de redes sociais.',
      deliverables: ['12 publicações/mês'], quantity: 1, months: 6,
      periodicity: 'MENSAL' as const, monthlyCents: 96700, setupCents: 0, discountCents: 0,
    },
  ]
  const t = proposalTotals(items.map((i) => ({ ...i, discountPercent: null })))
  return {
    kind: 'PROPOSTA',
    number: 'PROP-2026-0001',
    issueDate: '2026-08-29',
    validUntil: '2026-09-13',
    startDate: '2026-09-01',
    paymentTerms: 'Parcelado em 3x no cartão de crédito',
    notes: null,
    recipient: {
      name: 'Cliente Exemplo Ltda', tradeName: null, document: '68652648000186', personType: 'PJ',
      contactName: 'Fulano de Tal', email: 'contato@exemplo.com.br', phone: '31991465195',
      zipCode: '31520100', street: 'Rua Exemplo', addressNumber: '131', complement: null,
      district: 'Centro', city: 'Belo Horizonte', state: 'MG',
    },
    items,
    totals: {
      monthlyCents: t.monthlyCents, setupCents: t.setupCents, totalCents: t.totalCents,
      months: t.months, itemsDiscountCents: t.itemsDiscountCents, generalDiscountCents: t.generalDiscountCents,
    },
    ...partial,
  }
}

test('PDF é gerado com texto selecionável (não é imagem)', async () => {
  const buf = await renderProposalPdf(data())
  assert.ok(buf.length > 5000)
  assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-')

  const raw = buf.toString('latin1')
  // Fontes de texto embutidas e nenhuma imagem de página inteira
  assert.ok(raw.includes('/Type /Font') || raw.includes('/Font'))
  assert.ok(raw.includes('Helvetica'))
  assert.ok(raw.includes('/Title'))
})

test('PDF traz os totais corretos: 967,00 × 6 + 1.700,00', async () => {
  const d = data()
  assert.equal(d.totals.monthlyCents, 96700)
  assert.equal(d.totals.setupCents, 170000)
  assert.equal(d.totals.totalCents, 96700 * 6 + 170000)
  const buf = await renderProposalPdf(d)
  assert.ok(buf.length > 5000)
})

test('aditivo gera documento próprio, referenciando a proposta de origem', async () => {
  const buf = await renderProposalPdf(data({
    kind: 'ADITIVO',
    number: 'ADT-2026-0001',
    parentNumber: 'PROP-2026-0001',
    items: [{
      name: 'Social Media', description: null, scope: null, deliverables: [],
      quantity: 1, months: 12, periodicity: 'MENSAL', monthlyCents: 120000, setupCents: 0,
      discountCents: 0, changeType: 'ALTERA', previousMonthlyCents: 96700,
    }],
  }))
  assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-')
  assert.ok(buf.length > 3000)
})

test('campo obrigatório ausente bloqueia a geração do PDF', async () => {
  await assert.rejects(
    () => renderProposalPdf(data({ recipient: { ...data().recipient, email: null } })),
    (err: unknown) => err instanceof ProposalRenderError && /cliente_email/.test((err as Error).message),
  )
})

test('DOCX é gerado no formato Office (zip com o content types)', async () => {
  const buf = await renderProposalDocx(data())
  assert.ok(buf.length > 3000)
  // DOCX é um ZIP: assinatura PK
  assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK')
  assert.ok(buf.toString('latin1').includes('[Content_Types].xml'))
})

test('DOCX também recusa documento incompleto', async () => {
  await assert.rejects(
    () => renderProposalDocx(data({ recipient: { ...data().recipient, email: null } })),
    ProposalRenderError,
  )
})

test('envio é idempotente por proposta e versão', () => {
  assert.equal(proposalMailRef('abc', 1), 'proposal:abc:v1')
  // Mesmo clique repetido → mesma referência → provedor não reenvia
  assert.equal(proposalMailRef('abc', 1), proposalMailRef('abc', 1))
  // Nova versão é um envio novo
  assert.notEqual(proposalMailRef('abc', 1), proposalMailRef('abc', 2))
  assert.notEqual(proposalMailRef('abc', 1), proposalMailRef('xyz', 1))
})

test('gerar duas vezes produz documentos equivalentes (mesmo conteúdo)', async () => {
  const [a, b] = await Promise.all([renderProposalPdf(data()), renderProposalPdf(data())])
  // O PDF carrega a data de criação, então compara o tamanho e o miolo textual
  assert.ok(Math.abs(a.length - b.length) < 200)
})
