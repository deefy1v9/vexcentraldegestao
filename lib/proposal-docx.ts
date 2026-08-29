import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, HeadingLevel, BorderStyle, ImageRun, ShadingType,
} from 'docx'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { formatBRL, formatDateBR, formatDocument, renderTemplate } from './proposal-core'
import { DEFAULT_TEMPLATE, ADDENDUM_TEMPLATE, TEMPLATE_INDEX, VEX, type ProposalTemplateContent } from './proposal-template'
import { buildValues, missingPlaceholders, ProposalRenderError, type ProposalRenderData } from './proposal-pdf'

/**
 * Versão editável (DOCX) do mesmo documento — mesma estrutura, mesmos textos
 * e mesma ordem do PDF. Serve para ajustes pontuais fora do sistema; o PDF
 * continua sendo o documento oficial gerado pelo VEX.
 */

const ACCENT = '00A878'
const MUTED = '6B7280'
const LABEL_BG = 'F3F4F6'
const HIGHLIGHT_BG = 'EAF9F3'

function text(t: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({ text: t, bold: opts.bold, size: (opts.size ?? 9.5) * 2, color: opts.color, font: 'Arial' })
}

function para(t: string, opts: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacing?: number } = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    spacing: { after: opts.spacing ?? 120 },
    children: [text(t, opts)],
  })
}

function bullet(t: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [text(t)],
  })
}

function infoTable(rows: Array<[string, string]>, highlight = false) {
  const noBorder = { style: BorderStyle.SINGLE, size: 1, color: 'D9DDE3' }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.filter(([, v]) => !!v).map(([label, value]) => new TableRow({
      children: [
        new TableCell({
          width: { size: 38, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: LABEL_BG },
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
          children: [new Paragraph({ children: [text(label, { bold: true, size: 9 })] })],
        }),
        new TableCell({
          shading: highlight ? { type: ShadingType.CLEAR, fill: HIGHLIGHT_BG } : undefined,
          borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
          children: [new Paragraph({ children: [text(value, { bold: highlight, color: highlight ? ACCENT : undefined })] })],
        }),
      ],
    })),
  })
}

function logoParagraph(): Paragraph | null {
  const path = join(process.cwd(), 'public', 'logo.png')
  if (!existsSync(path)) return null
  try {
    return new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 240 },
      children: [new ImageRun({ data: readFileSync(path), transformation: { width: 92, height: 23 }, type: 'png' })],
    })
  } catch {
    return null
  }
}

/** Gera o DOCX preenchido. Mesmas validações do PDF. */
export async function renderProposalDocx(data: ProposalRenderData): Promise<Buffer> {
  const missing = missingPlaceholders(data)
  if (missing.length > 0) {
    throw new ProposalRenderError(`Campos obrigatórios ausentes no documento: ${missing.join(', ')}`)
  }

  const template: ProposalTemplateContent = data.template ?? (data.kind === 'ADITIVO' ? ADDENDUM_TEMPLATE : DEFAULT_TEMPLATE)
  const values = buildValues(data)
  const resolve = (t: string) => renderTemplate(t, values).text

  const children: Array<Paragraph | Table> = []
  const logo = logoParagraph()
  if (logo) children.push(logo)

  for (const block of template.blocks) {
    if (block.onlyFor && block.onlyFor !== data.kind) continue
    switch (block.kind) {
      case 'cover':
        children.push(new Paragraph({
          spacing: { before: 600, after: 120 },
          children: [new TextRun({ text: template.title, bold: true, size: 68, font: 'Arial' })],
        }))
        children.push(para(template.subtitle, { size: 12, color: MUTED, align: AlignmentType.LEFT }))
        children.push(para(`Documento ${data.number}`, { size: 9, color: MUTED, align: AlignmentType.LEFT, spacing: 320 }))
        break
      case 'index':
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 160 }, children: [text(resolve(block.text ?? 'ÍNDICE'), { bold: true, size: 13 })] }))
        TEMPLATE_INDEX.forEach((item, i) => children.push(para(`${i + 1}. ${item}`, { align: AlignmentType.LEFT, spacing: 60 })))
        break
      case 'heading':
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280, after: 140 },
          children: [text(resolve(block.text ?? ''), { bold: true, size: 13 })],
        }))
        break
      case 'subheading':
        children.push(new Paragraph({
          spacing: { before: 160, after: 100 },
          children: [text(resolve(block.text ?? ''), { bold: true, size: 11, color: ACCENT })],
        }))
        break
      case 'paragraph':
        children.push(para(resolve(block.text ?? '')))
        break
      case 'bullets':
        for (const item of block.items ?? []) children.push(bullet(resolve(item)))
        break
      case 'infoTable':
        children.push(infoTable((block.rows ?? []).map(([l, v]) => [resolve(l), resolve(v)] as [string, string])))
        children.push(para('', { spacing: 120 }))
        break
      case 'totals': {
        const t = data.totals
        const summary: string[] = []
        if (t.monthlyCents > 0) summary.push(`${formatBRL(t.monthlyCents)}/mês${t.months > 0 ? ` por ${t.months} meses` : ''}`)
        if (t.setupCents > 0) summary.push(`${formatBRL(t.setupCents)} de pagamento único`)
        children.push(infoTable([
          ['Valor total', `${formatBRL(t.totalCents)}${summary.length ? ` (${summary.join(' + ')})` : ''}`],
          ['Serviço Contratado', data.items.map((i) => `${i.name} (${i.periodicity === 'UNICO' ? formatBRL(i.setupCents) : `${formatBRL(i.monthlyCents)}/mês`})`).join(' + ') || '—'],
          ...(data.paymentTerms ? ([['Condições de pagamento', data.paymentTerms]] as Array<[string, string]>) : []),
        ], true))
        children.push(para('', { spacing: 120 }))
        break
      }
      case 'services':
        data.items.forEach((item, index) => {
          const n = index + 1
          const price = item.periodicity === 'UNICO'
            ? `${formatBRL(item.setupCents)} (pagamento único)`
            : `${formatBRL(item.monthlyCents)}/mês${item.months > 0 ? ` por ${item.months} meses` : ''}`
          children.push(new Paragraph({
            spacing: { before: 160, after: 100 },
            children: [text(`2.${n}. ${item.name} - ${price}`, { bold: true, size: 11, color: ACCENT })],
          }))
          const scope = item.scope?.trim() || item.description?.trim()
          if (scope) children.push(para(`2.${n}.1. Escopo: ${scope}`))
          if (item.deliverables?.length) {
            children.push(para(`2.${n}.2. Entregáveis:`, { spacing: 60 }))
            for (const d of item.deliverables) children.push(bullet(d.endsWith(';') || d.endsWith('.') ? d : `${d};`))
          }
          if (item.quantity > 1) children.push(para(`2.${n}.3. Quantidade contratada: ${item.quantity}.`))
        })
        break
      case 'addendum': {
        const label: Record<string, string> = { ADICIONA: 'Inclusão', REMOVE: 'Exclusão', ALTERA: 'Alteração', MANTEM: 'Mantido' }
        data.items.forEach((item, index) => {
          const before = item.previousMonthlyCents ?? 0
          const after = item.periodicity === 'UNICO' ? item.setupCents : item.monthlyCents
          const delta = after - before
          children.push(new Paragraph({
            spacing: { before: 160, after: 100 },
            children: [text(`2.${index + 1}. ${label[item.changeType ?? 'ALTERA'] ?? 'Alteração'} — ${item.name}`, { bold: true, size: 10.5, color: ACCENT })],
          }))
          children.push(infoTable([
            ['Condição anterior', before > 0 ? `${formatBRL(before)}/mês` : 'não contratado'],
            ['Nova condição', item.changeType === 'REMOVE' ? 'serviço encerrado' : `${formatBRL(after)}${item.periodicity === 'UNICO' ? ' (pagamento único)' : '/mês'}`],
            ['Diferença mensal', `${delta >= 0 ? '+' : '-'} ${formatBRL(Math.abs(delta))}`],
            ['Duração', item.months > 0 ? `${item.months} meses` : '—'],
          ]))
          children.push(para('', { spacing: 120 }))
        })
        break
      }
      case 'payment': {
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
        children.push(infoTable(rows))
        children.push(para('', { spacing: 120 }))
        if (data.notes?.trim()) children.push(para(`Observações: ${data.notes.trim()}`))
        break
      }
      case 'signature':
        children.push(para(`Local: ${data.recipient.city ? `${data.recipient.city}/${data.recipient.state ?? ''}`.replace(/\/$/, '') : 'São Paulo/SP'}`, { align: AlignmentType.LEFT, spacing: 60 }))
        children.push(para(`Data: ${formatDateBR(data.issueDate)}`, { align: AlignmentType.LEFT, spacing: 600 }))
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({
            children: [
              new TableCell({
                borders: { top: { style: BorderStyle.SINGLE, size: 6, color: '1A1A1A' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [text(VEX.legalName, { bold: true, size: 9 })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [text(`CNPJ: ${VEX.cnpj}`, { size: 8, color: MUTED })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [text(`Representante VEX: ${VEX.representative} | CPF: ${VEX.representativeCpf} | Cargo: ${VEX.representativeRole}`, { size: 8, color: MUTED })] }),
                ],
              }),
              new TableCell({
                borders: { top: { style: BorderStyle.SINGLE, size: 6, color: '1A1A1A' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [text(data.recipient.name.toUpperCase(), { bold: true, size: 9 })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [text(`${data.recipient.personType === 'PJ' ? 'CNPJ' : 'CPF'}: ${formatDocument(data.recipient.document)}`, { size: 8, color: MUTED })] }),
                ],
              }),
            ],
          })],
        }))
        break
      case 'pageBreak':
        children.push(new Paragraph({ pageBreakBefore: true, children: [] }))
        break
    }
  }

  const doc = new Document({
    creator: VEX.legalName,
    title: `${template.title} ${data.number}`,
    description: template.subtitle,
    sections: [{
      properties: { page: { margin: { top: 1120, bottom: 1120, left: 1120, right: 1120 } } },
      children,
    }],
  })
  return Packer.toBuffer(doc)
}
