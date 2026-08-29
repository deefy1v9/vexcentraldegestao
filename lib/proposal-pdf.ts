import PDFDocument from 'pdfkit'
import { join } from 'path'
import { existsSync } from 'fs'
import {
  formatBRL, formatDateBR, formatDocument, formatPhone, formatZip, renderTemplate,
} from './proposal-core'
import {
  DEFAULT_TEMPLATE, ADDENDUM_TEMPLATE, TEMPLATE_INDEX, VEX,
  type ProposalTemplateContent, type TemplateBlock,
} from './proposal-template'

/**
 * Geração do PDF da proposta com PDFKit — texto real e selecionável, nunca
 * imagem. Sem navegador headless: o container roda node puro, e a fidelidade
 * ao modelo vem do layout replicado aqui (A4, mesmas margens, mesma ordem de
 * blocos, logo no topo de cada página, tabelas com o mesmo desenho).
 */

const A4 = { width: 595.28, height: 841.89 }
const MARGIN = 56 // ~2 cm, igual ao modelo
const CONTENT_WIDTH = A4.width - MARGIN * 2

const COLORS = {
  text: '#1A1A1A',
  muted: '#6B7280',
  accent: '#00A878', // verde dos destaques do modelo
  tableLabel: '#F3F4F6',
  tableHighlight: '#EAF9F3',
  border: '#D9DDE3',
}

const FONT = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'

/* ---------------------------------- dados ---------------------------------- */

export interface RenderItem {
  name: string
  description?: string | null
  scope?: string | null
  deliverables?: string[]
  quantity: number
  months: number
  periodicity: 'MENSAL' | 'UNICO'
  monthlyCents: number
  setupCents: number
  discountCents: number
  changeType?: string | null
  previousMonthlyCents?: number | null
}

export interface RenderRecipient {
  name: string
  tradeName?: string | null
  document: string
  personType: 'PF' | 'PJ'
  contactName?: string | null
  email?: string | null
  phone?: string | null
  zipCode?: string | null
  street?: string | null
  addressNumber?: string | null
  complement?: string | null
  district?: string | null
  city?: string | null
  state?: string | null
}

export interface RenderTotals {
  monthlyCents: number
  setupCents: number
  totalCents: number
  months: number
  itemsDiscountCents: number
  generalDiscountCents: number
}

export interface ProposalRenderData {
  kind: 'PROPOSTA' | 'ADITIVO'
  number: string
  issueDate: string // YYYY-MM-DD
  validUntil: string
  startDate?: string | null
  paymentTerms?: string | null
  notes?: string | null
  recipient: RenderRecipient
  items: RenderItem[]
  totals: RenderTotals
  parentNumber?: string | null
  template?: ProposalTemplateContent
}

/* -------------------------------- placeholders -------------------------------- */

/** Qualificação da parte no preâmbulo, conforme pessoa física ou jurídica. */
function qualification(r: RenderRecipient): string {
  const doc = formatDocument(r.document)
  const address = [r.street, r.addressNumber, r.district, r.city && r.state ? `${r.city}/${r.state}` : r.city,
    r.zipCode ? `CEP ${formatZip(r.zipCode)}` : null].filter(Boolean).join(', ')
  if (r.personType === 'PJ') {
    const base = `inscrita no CNPJ nº ${doc}`
    const rep = r.contactName ? `, neste ato representada por ${r.contactName}` : ''
    return address ? `${base}, com sede à ${address}${rep}` : `${base}${rep}`
  }
  const base = `portador(a) do CPF nº ${doc}`
  return address ? `${base}, residente e domiciliado(a) à ${address}` : base
}

export function buildValues(data: ProposalRenderData): Record<string, string> {
  const r = data.recipient
  return {
    numero: data.number,
    documento_origem: data.parentNumber ?? '',
    data_proposta: formatDateBR(data.issueDate),
    validade: formatDateBR(data.validUntil),
    data_inicio: formatDateBR(data.startDate) || formatDateBR(data.issueDate),
    cliente_nome: r.tradeName ? `${r.name} (${r.tradeName})` : r.name,
    cliente_nome_maiusculo: r.name.toUpperCase(),
    cliente_razao_social: r.name,
    cliente_nome_fantasia: r.tradeName ?? '',
    cliente_documento: formatDocument(r.document),
    cliente_responsavel: r.contactName || r.name,
    cliente_email: r.email ?? '',
    cliente_telefone: formatPhone(r.phone),
    cliente_endereco: [r.street, r.addressNumber, r.district].filter(Boolean).join(', '),
    cliente_cidade: r.city ?? '',
    cliente_estado: r.state ?? '',
    cliente_cep: formatZip(r.zipCode),
    cliente_qualificacao: qualification(r),
    valor_mensal: formatBRL(data.totals.monthlyCents),
    valor_unico: formatBRL(data.totals.setupCents),
    valor_total: formatBRL(data.totals.totalCents),
    duracao: data.totals.months > 0 ? `${data.totals.months} meses` : 'sem recorrência',
    condicoes_pagamento: data.paymentTerms ?? '',
    observacoes: data.notes ?? '',
  }
}

/** Placeholders sem valor no documento — a geração é bloqueada se houver. */
export function missingPlaceholders(data: ProposalRenderData): string[] {
  const template = data.template ?? (data.kind === 'ADITIVO' ? ADDENDUM_TEMPLATE : DEFAULT_TEMPLATE)
  const values = buildValues(data)
  const missing = new Set<string>()
  const check = (text?: string) => {
    if (!text) return
    for (const key of renderTemplate(text, values).missing) missing.add(key)
  }
  for (const block of template.blocks) {
    check(block.text)
    block.items?.forEach(check)
    block.rows?.forEach(([label, value]) => { check(label); check(value) })
  }
  // Campos opcionais por natureza não travam a emissão
  for (const optional of ['observacoes', 'condicoes_pagamento', 'cliente_nome_fantasia', 'documento_origem']) {
    missing.delete(optional)
  }
  return [...missing]
}

/* --------------------------------- desenho --------------------------------- */

type Doc = InstanceType<typeof PDFDocument>

function logoPath(): string | null {
  const p = join(process.cwd(), 'public', 'logo.png')
  return existsSync(p) ? p : null
}

function drawHeaderLogo(doc: Doc) {
  const logo = logoPath()
  if (!logo) return
  try {
    // Logo no topo direito de todas as páginas, como no modelo
    doc.image(logo, A4.width - MARGIN - 92, 30, { width: 92 })
  } catch {
    /* logo ausente não impede a emissão */
  }
}

/** Espaço restante na página; abaixo disso, quebra antes de desenhar. */
function ensureSpace(doc: Doc, needed: number) {
  const bottom = A4.height - MARGIN
  if (doc.y + needed > bottom) doc.addPage()
}

function paragraph(doc: Doc, text: string, opts: { size?: number; bold?: boolean; color?: string; gap?: number } = {}) {
  doc.font(opts.bold ? FONT_BOLD : FONT)
    .fontSize(opts.size ?? 9.5)
    .fillColor(opts.color ?? COLORS.text)
    .text(text, MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'justify', lineGap: 1.5 })
  doc.moveDown(opts.gap ?? 0.6)
}

function heading(doc: Doc, text: string) {
  ensureSpace(doc, 60)
  doc.moveDown(0.5)
  doc.font(FONT_BOLD).fontSize(13).fillColor(COLORS.text)
    .text(text, MARGIN, doc.y, { width: CONTENT_WIDTH })
  doc.moveDown(0.5)
}

function subheading(doc: Doc, text: string) {
  ensureSpace(doc, 40)
  doc.moveDown(0.3)
  doc.font(FONT_BOLD).fontSize(11).fillColor(COLORS.accent)
    .text(text, MARGIN, doc.y, { width: CONTENT_WIDTH })
  doc.moveDown(0.4)
}

function bullets(doc: Doc, items: string[]) {
  doc.font(FONT).fontSize(9.5).fillColor(COLORS.text)
  for (const item of items) {
    ensureSpace(doc, 30)
    const y = doc.y
    doc.text('•', MARGIN + 10, y, { width: 10 })
    doc.text(item, MARGIN + 24, y, { width: CONTENT_WIDTH - 24, align: 'justify', lineGap: 1.5 })
    doc.moveDown(0.25)
  }
  doc.moveDown(0.4)
}

/** Tabela de duas colunas — rótulo cinza à esquerda, valor à direita. */
function infoTable(doc: Doc, rows: Array<[string, string]>, opts: { highlight?: boolean } = {}) {
  const labelWidth = CONTENT_WIDTH * 0.38
  const valueWidth = CONTENT_WIDTH - labelWidth
  const padX = 10
  const padY = 8

  for (const [label, value] of rows) {
    if (!value) continue
    doc.font(FONT_BOLD).fontSize(9)
    const labelHeight = doc.heightOfString(label, { width: labelWidth - padX * 2 })
    doc.font(opts.highlight ? FONT_BOLD : FONT).fontSize(9.5)
    const valueHeight = doc.heightOfString(value, { width: valueWidth - padX * 2 })
    const rowHeight = Math.max(labelHeight, valueHeight) + padY * 2

    ensureSpace(doc, rowHeight + 4)
    const y = doc.y

    doc.rect(MARGIN, y, labelWidth, rowHeight).fillAndStroke(COLORS.tableLabel, COLORS.border)
    doc.rect(MARGIN + labelWidth, y, valueWidth, rowHeight)
      .fillAndStroke(opts.highlight ? COLORS.tableHighlight : '#FFFFFF', COLORS.border)

    doc.font(FONT_BOLD).fontSize(9).fillColor(COLORS.text)
      .text(label, MARGIN + padX, y + padY, { width: labelWidth - padX * 2 })
    doc.font(opts.highlight ? FONT_BOLD : FONT).fontSize(9.5)
      .fillColor(opts.highlight ? COLORS.accent : COLORS.text)
      .text(value, MARGIN + labelWidth + padX, y + padY, { width: valueWidth - padX * 2 })

    doc.y = y + rowHeight
  }
  doc.moveDown(0.8)
}

/** Cláusula 2: um bloco por serviço, no formato 2.1, 2.1.1, 2.1.2... */
function servicesSection(doc: Doc, data: ProposalRenderData) {
  data.items.forEach((item, index) => {
    const n = index + 1
    const priceLabel = item.periodicity === 'UNICO'
      ? `${formatBRL(item.setupCents)} (pagamento único)`
      : `${formatBRL(item.monthlyCents)}/mês${item.months > 0 ? ` por ${item.months} meses` : ''}`

    ensureSpace(doc, 70)
    doc.font(FONT_BOLD).fontSize(11).fillColor(COLORS.accent)
      .text(`2.${n}. ${item.name} - ${priceLabel}`, MARGIN, doc.y, { width: CONTENT_WIDTH })
    doc.moveDown(0.4)

    const scope = item.scope?.trim() || item.description?.trim()
    if (scope) paragraph(doc, `2.${n}.1. Escopo: ${scope}`)
    if (item.deliverables && item.deliverables.length > 0) {
      paragraph(doc, `2.${n}.2. Entregáveis:`, { gap: 0.2 })
      bullets(doc, item.deliverables.map((d) => (d.endsWith(';') || d.endsWith('.') ? d : `${d};`)))
    }
    if (item.quantity > 1) {
      paragraph(doc, `2.${n}.3. Quantidade contratada: ${item.quantity}.`)
    }
    if (item.setupCents > 0 && item.periodicity !== 'UNICO') {
      paragraph(doc, `2.${n}.4. Valor de implementação: ${formatBRL(item.setupCents)}.`)
    }
  })

  if (data.items.length === 0) {
    paragraph(doc, 'Nenhum serviço informado.')
  }
}

/** Cláusula 7/3: valores consolidados. */
function paymentSection(doc: Doc, data: ProposalRenderData) {
  const t = data.totals
  const rows: Array<[string, string]> = []
  if (t.monthlyCents > 0) rows.push(['Mensalidade', `${formatBRL(t.monthlyCents)}/mês`])
  if (t.months > 0) rows.push(['Duração', `${t.months} meses`])
  if (t.setupCents > 0) rows.push(['Pagamento único / implementação', formatBRL(t.setupCents)])
  const discount = t.itemsDiscountCents + t.generalDiscountCents
  if (discount > 0) rows.push(['Descontos aplicados', `- ${formatBRL(discount)}`])
  rows.push(['Valor total do contrato', formatBRL(t.totalCents)])
  if (data.paymentTerms) rows.push(['Condições de pagamento', data.paymentTerms])
  rows.push(['Validade desta proposta', formatDateBR(data.validUntil)])
  infoTable(doc, rows)
  if (data.notes?.trim()) {
    paragraph(doc, `Observações: ${data.notes.trim()}`)
  }
}

/** Cláusula 2 do aditivo: comparação antes × depois. */
function addendumSection(doc: Doc, data: ProposalRenderData) {
  const label: Record<string, string> = {
    ADICIONA: 'Inclusão', REMOVE: 'Exclusão', ALTERA: 'Alteração', MANTEM: 'Mantido',
  }
  data.items.forEach((item, index) => {
    const before = item.previousMonthlyCents ?? 0
    const after = item.periodicity === 'UNICO' ? item.setupCents : item.monthlyCents
    const delta = after - before
    ensureSpace(doc, 80)
    doc.font(FONT_BOLD).fontSize(10.5).fillColor(COLORS.accent)
      .text(`2.${index + 1}. ${label[item.changeType ?? 'ALTERA'] ?? 'Alteração'} — ${item.name}`, MARGIN, doc.y, { width: CONTENT_WIDTH })
    doc.moveDown(0.3)
    infoTable(doc, [
      ['Condição anterior', before > 0 ? `${formatBRL(before)}/mês` : 'não contratado'],
      ['Nova condição', item.changeType === 'REMOVE' ? 'serviço encerrado' : (item.periodicity === 'UNICO' ? `${formatBRL(after)} (pagamento único)` : `${formatBRL(after)}/mês`)],
      ['Diferença mensal', `${delta >= 0 ? '+' : '-'} ${formatBRL(Math.abs(delta))}`],
      ['Duração', item.months > 0 ? `${item.months} meses` : '—'],
    ])
  })
}

function signature(doc: Doc, data: ProposalRenderData) {
  ensureSpace(doc, 180)
  doc.moveDown(1)
  paragraph(doc, `Local: ${data.recipient.city ? `${data.recipient.city}/${data.recipient.state ?? ''}`.replace(/\/$/, '') : 'São Paulo/SP'}`, { gap: 0.1 })
  paragraph(doc, `Data: ${formatDateBR(data.issueDate)}`, { gap: 1.6 })

  const colWidth = (CONTENT_WIDTH - 40) / 2
  const y = doc.y
  doc.moveTo(MARGIN, y).lineTo(MARGIN + colWidth, y).strokeColor(COLORS.text).stroke()
  doc.moveTo(MARGIN + colWidth + 40, y).lineTo(MARGIN + colWidth * 2 + 40, y).stroke()

  doc.font(FONT_BOLD).fontSize(9).fillColor(COLORS.text)
    .text(VEX.legalName, MARGIN, y + 6, { width: colWidth, align: 'center' })
  doc.font(FONT).fontSize(8).fillColor(COLORS.muted)
    .text(`CNPJ: ${VEX.cnpj}`, MARGIN, doc.y, { width: colWidth, align: 'center' })
    .text(`Representante VEX: ${VEX.representative} | CPF: ${VEX.representativeCpf} | Cargo: ${VEX.representativeRole}`,
      MARGIN, doc.y, { width: colWidth, align: 'center' })

  doc.font(FONT_BOLD).fontSize(9).fillColor(COLORS.text)
    .text(data.recipient.name.toUpperCase(), MARGIN + colWidth + 40, y + 6, { width: colWidth, align: 'center' })
  doc.font(FONT).fontSize(8).fillColor(COLORS.muted)
    .text(`${data.recipient.personType === 'PJ' ? 'CNPJ' : 'CPF'}: ${formatDocument(data.recipient.document)}`,
      MARGIN + colWidth + 40, doc.y, { width: colWidth, align: 'center' })
}

function cover(doc: Doc, template: ProposalTemplateContent, data: ProposalRenderData) {
  doc.y = 130
  doc.font(FONT_BOLD).fontSize(34).fillColor(COLORS.text)
    .text(template.title, MARGIN, doc.y, { width: CONTENT_WIDTH * 0.75, lineGap: 2 })
  doc.moveDown(0.4)
  doc.font(FONT).fontSize(12).fillColor(COLORS.muted)
    .text(template.subtitle, MARGIN, doc.y, { width: CONTENT_WIDTH })
  doc.moveDown(0.6)
  doc.font(FONT).fontSize(9).fillColor(COLORS.muted)
    .text(`Documento ${data.number}`, MARGIN, doc.y, { width: CONTENT_WIDTH })
  doc.moveDown(2.5)
}

function totalsBlock(doc: Doc, data: ProposalRenderData) {
  const t = data.totals
  const summary: string[] = []
  if (t.monthlyCents > 0) summary.push(`${formatBRL(t.monthlyCents)}/mês${t.months > 0 ? ` por ${t.months} meses` : ''}`)
  if (t.setupCents > 0) summary.push(`${formatBRL(t.setupCents)} de pagamento único`)
  const serviceLine = data.items
    .map((i) => `${i.name} (${i.periodicity === 'UNICO' ? formatBRL(i.setupCents) : `${formatBRL(i.monthlyCents)}/mês`})`)
    .join(' + ')

  infoTable(doc, [
    ['Valor total', `${formatBRL(t.totalCents)}${summary.length > 0 ? ` (${summary.join(' + ')})` : ''}`],
    ['Serviço Contratado', serviceLine || '—'],
    ...(data.paymentTerms ? ([['Condições de pagamento', data.paymentTerms]] as Array<[string, string]>) : []),
  ], { highlight: true })
}

function indexBlock(doc: Doc, title: string) {
  doc.y = MARGIN + 40
  doc.font(FONT_BOLD).fontSize(13).fillColor(COLORS.text).text(title, MARGIN, doc.y)
  doc.moveDown(0.6)
  doc.font(FONT).fontSize(10).fillColor(COLORS.text)
  TEMPLATE_INDEX.forEach((item, i) => {
    doc.text(`${i + 1}. ${item}`, MARGIN + 24, doc.y, { width: CONTENT_WIDTH - 24 })
    doc.moveDown(0.25)
  })
}

/* --------------------------------- render --------------------------------- */

export class ProposalRenderError extends Error {}

/**
 * Gera o PDF. Lança se algum placeholder obrigatório estiver vazio — o
 * documento nunca sai com `{{campo}}`, `null` ou `undefined`.
 */
export async function renderProposalPdf(data: ProposalRenderData): Promise<Buffer> {
  const missing = missingPlaceholders(data)
  if (missing.length > 0) {
    throw new ProposalRenderError(`Campos obrigatórios ausentes no documento: ${missing.join(', ')}`)
  }

  const template = data.template ?? (data.kind === 'ADITIVO' ? ADDENDUM_TEMPLATE : DEFAULT_TEMPLATE)
  const values = buildValues(data)
  const resolve = (text: string) => renderTemplate(text, values).text

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: {
      Title: `${template.title} ${data.number}`,
      Author: VEX.legalName,
      Subject: template.subtitle,
      Creator: 'VEX Central de Gestão',
    },
    autoFirstPage: false,
  })

  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolvePromise, reject) => {
    doc.on('end', () => resolvePromise(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  doc.on('pageAdded', () => {
    drawHeaderLogo(doc)
    doc.font(FONT).fontSize(9.5).fillColor(COLORS.text)
    doc.x = MARGIN
    doc.y = MARGIN + 40
  })
  doc.addPage()

  for (const block of template.blocks as TemplateBlock[]) {
    if (block.onlyFor && block.onlyFor !== data.kind) continue
    switch (block.kind) {
      case 'cover': cover(doc, template, data); break
      case 'index': indexBlock(doc, resolve(block.text ?? 'ÍNDICE')); break
      case 'heading': heading(doc, resolve(block.text ?? '')); break
      case 'subheading': subheading(doc, resolve(block.text ?? '')); break
      case 'paragraph': paragraph(doc, resolve(block.text ?? '')); break
      case 'bullets': bullets(doc, (block.items ?? []).map(resolve)); break
      case 'infoTable':
        infoTable(doc, (block.rows ?? []).map(([l, v]) => [resolve(l), resolve(v)] as [string, string]))
        break
      case 'services': servicesSection(doc, data); break
      case 'addendum': addendumSection(doc, data); break
      case 'totals': totalsBlock(doc, data); break
      case 'payment': paymentSection(doc, data); break
      case 'signature': signature(doc, data); break
      case 'pageBreak': doc.addPage(); break
    }
  }

  doc.end()
  return done
}
