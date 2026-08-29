import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { logActivity } from './activity'
import {
  formatProposalNumber, isExpired, maskDocument, missingProposalFields, onlyDigits,
  personTypeOf, proposalTotals, safeFileName, spTodayISO, formatBRL, formatDateBR,
  type ProposalKind, type ProposalItemInput,
} from './proposal-core'
import { renderProposalPdf, type ProposalRenderData, type RenderItem } from './proposal-pdf'
import { renderProposalDocx } from './proposal-docx'
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_VERSION, ADDENDUM_TEMPLATE } from './proposal-template'
import type { ProposalTemplateContent } from './proposal-template'

/**
 * Camada de domínio das propostas: numeração segura, versões, geração de
 * documento e auditoria. Nada aqui altera cliente, contrato, financeiro,
 * Asaas, Focus ou demandas — a conversão de prospect em cliente é explícita
 * e usa o cadastro normal.
 */

/* -------------------------------- template -------------------------------- */

/** Garante o modelo padrão (idempotente). */
export async function ensureDefaultTemplate() {
  const existing = await prisma.proposalTemplate.findFirst({
    where: { name: DEFAULT_TEMPLATE_NAME, version: DEFAULT_TEMPLATE_VERSION },
  })
  if (existing) return existing
  return prisma.proposalTemplate.create({
    data: {
      name: DEFAULT_TEMPLATE_NAME,
      version: DEFAULT_TEMPLATE_VERSION,
      isDefault: true,
      isActive: true,
      content: DEFAULT_TEMPLATE as unknown as Prisma.InputJsonValue,
    },
  })
}

async function templateContent(templateId: string | null, kind: ProposalKind): Promise<ProposalTemplateContent> {
  if (kind === 'ADITIVO') return ADDENDUM_TEMPLATE
  if (templateId) {
    const t = await prisma.proposalTemplate.findUnique({ where: { id: templateId } })
    if (t?.content) return t.content as unknown as ProposalTemplateContent
  }
  return DEFAULT_TEMPLATE
}

/* -------------------------------- numeração -------------------------------- */

/**
 * Próximo número da sequência. A unicidade é garantida pelo banco
 * (@@unique [kind, year, seq]); em corrida, o perdedor tenta o próximo.
 */
export async function nextNumber(kind: ProposalKind, year: number): Promise<{ seq: number; number: string }> {
  const last = await prisma.proposal.findFirst({
    where: { kind, year },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  })
  const seq = (last?.seq ?? 0) + 1
  return { seq, number: formatProposalNumber(kind, year, seq) }
}

/* -------------------------------- snapshot -------------------------------- */

export interface RecipientSnapshot {
  kind: 'CLIENTE' | 'PROSPECT'
  id: string
  name: string
  tradeName: string | null
  document: string
  personType: 'PF' | 'PJ'
  contactName: string | null
  email: string | null
  phone: string | null
  zipCode: string | null
  street: string | null
  addressNumber: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
}

export async function snapshotFromClient(clientId: string): Promise<RecipientSnapshot> {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } })
  const document = onlyDigits(c.cnpj)
  return {
    kind: 'CLIENTE',
    id: c.id,
    name: c.legalName || c.name,
    tradeName: c.legalName ? c.name : null,
    document,
    personType: personTypeOf(document),
    contactName: c.name,
    email: c.billingEmail || c.email,
    phone: c.phone,
    zipCode: c.zipCode,
    street: c.street,
    addressNumber: c.addressNumber,
    complement: c.complement,
    district: c.district,
    city: c.city,
    state: c.state,
  }
}

export async function snapshotFromProspect(prospectId: string): Promise<RecipientSnapshot> {
  const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
  return {
    kind: 'PROSPECT',
    id: p.id,
    name: p.name,
    tradeName: p.tradeName,
    document: p.document,
    personType: p.personType === 'PJ' ? 'PJ' : 'PF',
    contactName: p.contactName,
    email: p.email,
    phone: p.phone,
    zipCode: p.zipCode,
    street: p.street,
    addressNumber: p.addressNumber,
    complement: p.complement,
    district: p.district,
    city: p.city,
    state: p.state,
  }
}

/* --------------------------------- totais --------------------------------- */

export function itemsToInput(items: Array<{
  quantity: number; monthlyCents: number; setupCents: number; discountCents: number
  discountPercent?: Prisma.Decimal | number | null; months: number; periodicity: string; name: string
}>): ProposalItemInput[] {
  return items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    monthlyCents: i.monthlyCents,
    setupCents: i.setupCents,
    discountCents: i.discountCents,
    discountPercent: i.discountPercent != null ? Number(i.discountPercent) : null,
    months: i.months,
    periodicity: i.periodicity === 'UNICO' ? 'UNICO' : 'MENSAL',
  }))
}

/** Recalcula e persiste os totais da proposta a partir dos itens salvos. */
export async function recalcProposal(proposalId: string) {
  const proposal = await prisma.proposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { items: true },
  })
  const totals = proposalTotals(itemsToInput(proposal.items), {
    discountCents: proposal.discountCents,
    discountPercent: proposal.discountPercent != null ? Number(proposal.discountPercent) : null,
  })
  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      monthlyCents: totals.monthlyCents,
      setupCents: totals.setupCents,
      totalCents: totals.totalCents,
      itemsDiscountCents: totals.itemsDiscountCents,
      months: totals.months,
    },
  })
  return totals
}

/* ------------------------------- render data ------------------------------- */

export async function buildRenderData(proposalId: string): Promise<ProposalRenderData> {
  const p = await prisma.proposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { items: { orderBy: { order: 'asc' } }, parent: { select: { number: true } } },
  })
  const snap = p.snapshot as unknown as RecipientSnapshot
  const totals = proposalTotals(itemsToInput(p.items), {
    discountCents: p.discountCents,
    discountPercent: p.discountPercent != null ? Number(p.discountPercent) : null,
  })

  const items: RenderItem[] = p.items.map((i, idx) => ({
    name: i.name,
    description: i.description,
    scope: i.scope,
    deliverables: i.deliverables,
    quantity: i.quantity,
    months: i.months,
    periodicity: i.periodicity === 'UNICO' ? 'UNICO' : 'MENSAL',
    monthlyCents: totals.items[idx]?.monthlyCents ?? i.monthlyCents,
    setupCents: totals.items[idx]?.setupCents ?? i.setupCents,
    discountCents: totals.items[idx]?.discountCents ?? i.discountCents,
    changeType: i.changeType,
    previousMonthlyCents: i.previousMonthlyCents,
  }))

  return {
    kind: p.kind === 'ADITIVO' ? 'ADITIVO' : 'PROPOSTA',
    number: p.number,
    issueDate: p.issueDate.toISOString().slice(0, 10),
    validUntil: p.validUntil.toISOString().slice(0, 10),
    startDate: p.startDate?.toISOString().slice(0, 10) ?? null,
    paymentTerms: p.paymentTerms,
    notes: p.notes,
    parentNumber: p.parent?.number ?? null,
    recipient: {
      name: snap.name,
      tradeName: snap.tradeName,
      document: snap.document,
      personType: snap.personType,
      contactName: snap.contactName,
      email: snap.email,
      phone: snap.phone,
      zipCode: snap.zipCode,
      street: snap.street,
      addressNumber: snap.addressNumber,
      complement: snap.complement,
      district: snap.district,
      city: snap.city,
      state: snap.state,
    },
    items,
    totals: {
      monthlyCents: totals.monthlyCents,
      setupCents: totals.setupCents,
      totalCents: totals.totalCents,
      months: totals.months,
      itemsDiscountCents: totals.itemsDiscountCents,
      generalDiscountCents: totals.generalDiscountCents,
    },
    template: await templateContent(p.templateId, p.kind === 'ADITIVO' ? 'ADITIVO' : 'PROPOSTA'),
  }
}

/** Campos que impedem a geração — checados antes de qualquer render. */
export async function validateForGeneration(proposalId: string): Promise<string[]> {
  const p = await prisma.proposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { items: true },
  })
  const snap = p.snapshot as unknown as RecipientSnapshot
  return missingProposalFields({
    recipientName: snap?.name,
    document: snap?.document,
    email: snap?.email,
    issueDate: p.issueDate.toISOString().slice(0, 10),
    validUntil: p.validUntil.toISOString().slice(0, 10),
    items: p.items.map((i) => ({
      name: i.name, monthlyCents: i.monthlyCents, setupCents: i.setupCents, periodicity: i.periodicity,
    })),
  })
}

/* ------------------------------- documentos ------------------------------- */

export class ProposalError extends Error {}

/**
 * Gera (ou reaproveita) o documento da versão atual. Idempotente: o mesmo
 * conteúdo na mesma versão não é regravado. Os bytes ficam no banco e só
 * saem por rota autenticada.
 */
export async function generateDocument(
  proposalId: string,
  format: 'PDF' | 'DOCX',
  user: { id: string; name: string },
): Promise<{ documentId: string; size: number; reused: boolean }> {
  const missing = await validateForGeneration(proposalId)
  if (missing.length > 0) throw new ProposalError(`Não é possível gerar: falta ${missing.join(', ')}.`)

  const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } })
  const existing = await prisma.proposalDocument.findUnique({
    where: { proposalId_version_format: { proposalId, version: proposal.currentVersion, format } },
  })
  if (existing) return { documentId: existing.id, size: existing.size, reused: true }

  const data = await buildRenderData(proposalId)
  const bytes = format === 'PDF' ? await renderProposalPdf(data) : await renderProposalDocx(data)
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const fileName = safeFileName(`${proposal.number}-v${proposal.currentVersion}`, format.toLowerCase())

  const doc = await prisma.proposalDocument.create({
    data: {
      proposalId,
      version: proposal.currentVersion,
      format,
      bytes,
      size: bytes.length,
      checksum,
      fileName,
      createdById: user.id,
    },
  }).catch(async (err) => {
    // Corrida entre dois cliques: aproveita o documento do vencedor
    const raced = await prisma.proposalDocument.findUnique({
      where: { proposalId_version_format: { proposalId, version: proposal.currentVersion, format } },
    })
    if (raced) return raced
    throw err
  })

  if (proposal.status === 'RASCUNHO') {
    await prisma.proposal.update({ where: { id: proposalId }, data: { status: 'GERADA' } })
  }
  await logEvent(proposalId, format, `${format} da versão ${proposal.currentVersion} gerado por ${user.name}`, user.id, {
    version: proposal.currentVersion, size: bytes.length,
  })
  return { documentId: doc.id, size: doc.size, reused: false }
}

/* --------------------------------- versões --------------------------------- */

/**
 * Congela a versão atual e abre a próxima. Documento anterior é preservado —
 * nada é sobrescrito em silêncio.
 */
export async function createVersion(proposalId: string, user: { id: string; name: string }, note?: string) {
  const proposal = await prisma.proposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { items: { orderBy: { order: 'asc' } } },
  })

  await prisma.proposalVersion.upsert({
    where: { proposalId_version: { proposalId, version: proposal.currentVersion } },
    update: {},
    create: {
      proposalId,
      version: proposal.currentVersion,
      snapshot: {
        proposal: {
          number: proposal.number, status: proposal.status,
          issueDate: proposal.issueDate, validUntil: proposal.validUntil,
          startDate: proposal.startDate, months: proposal.months,
          monthlyCents: proposal.monthlyCents, setupCents: proposal.setupCents,
          totalCents: proposal.totalCents, paymentTerms: proposal.paymentTerms,
          notes: proposal.notes, snapshot: proposal.snapshot,
        },
        items: proposal.items,
      } as unknown as Prisma.InputJsonValue,
      note: note ?? null,
      createdById: user.id,
    },
  })

  const updated = await prisma.proposal.update({
    where: { id: proposalId },
    data: { currentVersion: { increment: 1 }, status: 'RASCUNHO' },
  })
  await logEvent(proposalId, 'VERSAO', `Versão ${updated.currentVersion} aberta por ${user.name}${note ? ` — ${note}` : ''}`, user.id, {
    version: updated.currentVersion,
  })
  return updated
}

/* -------------------------------- auditoria -------------------------------- */

export async function logEvent(
  proposalId: string,
  kind: string,
  detail: string,
  userId?: string | null,
  meta?: Record<string, unknown>,
) {
  await prisma.proposalEvent.create({
    data: {
      proposalId,
      kind,
      detail: detail.slice(0, 500),
      userId: userId ?? null,
      meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  }).catch(() => {})
}

/* --------------------------------- status --------------------------------- */

const ALLOWED_STATUS = new Set([
  'RASCUNHO', 'GERADA', 'ENVIADA', 'VISUALIZADA', 'APROVADA', 'RECUSADA', 'EXPIRADA', 'CANCELADA', 'SUBSTITUIDA',
])

export async function setStatus(
  proposalId: string,
  status: string,
  user: { id: string; name: string },
  reason?: string,
) {
  if (!ALLOWED_STATUS.has(status)) throw new ProposalError('Status inválido.')
  const now = new Date()
  const data: Record<string, unknown> = { status }
  if (status === 'APROVADA') data.approvedAt = now
  if (status === 'RECUSADA') data.rejectedAt = now
  if (status === 'CANCELADA') data.canceledAt = now

  const updated = await prisma.proposal.update({ where: { id: proposalId }, data })
  await logEvent(proposalId, 'STATUS', `Status alterado para ${status} por ${user.name}${reason ? ` — ${reason}` : ''}`, user.id, { status })
  await logActivity(user.id, `alterou status da proposta ${updated.number} para ${status}`, 'Propostas', updated.number)
  return updated
}

/** Marca como expiradas as propostas cuja validade passou (sem sobrescrever decisões). */
export async function expireOverdue(): Promise<number> {
  const today = spTodayISO()
  const candidates = await prisma.proposal.findMany({
    where: {
      status: { in: ['GERADA', 'ENVIADA', 'VISUALIZADA'] },
      validUntil: { lt: new Date(`${today}T00:00:00Z`) },
    },
    select: { id: true, validUntil: true, number: true },
  })
  let count = 0
  for (const p of candidates) {
    if (!isExpired(p.validUntil, today)) continue
    await prisma.proposal.update({ where: { id: p.id }, data: { status: 'EXPIRADA' } })
    await logEvent(p.id, 'STATUS', 'Proposta expirada automaticamente pela validade', null, { number: p.number })
    count++
  }
  return count
}

/* ------------------------------- conversão ------------------------------- */

/**
 * Converte o prospect de uma proposta aprovada em cliente, usando o cadastro
 * normal. Não cria cobrança, nota, demanda nem e-mail — isso continua sendo
 * decisão explícita do administrador nas telas próprias.
 */
export async function convertProspect(proposalId: string, user: { id: string; name: string }) {
  const proposal = await prisma.proposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { prospect: true, items: { orderBy: { order: 'asc' } } },
  })
  if (!proposal.prospect) throw new ProposalError('Esta proposta não é de um prospect.')
  if (proposal.status !== 'APROVADA') throw new ProposalError('Converta apenas propostas aprovadas.')

  // Já convertido? Devolve o mesmo cliente — nunca duplica
  if (proposal.prospect.convertedClientId) {
    return { clientId: proposal.prospect.convertedClientId, created: false }
  }
  const doc = proposal.prospect.document
  const existing = doc ? await prisma.client.findFirst({ where: { cnpj: doc } }) : null
  if (existing) {
    await prisma.prospect.update({
      where: { id: proposal.prospect.id },
      data: { convertedClientId: existing.id, convertedAt: new Date() },
    })
    await prisma.proposal.update({ where: { id: proposalId }, data: { convertedClientId: existing.id } })
    return { clientId: existing.id, created: false }
  }

  const p = proposal.prospect
  const monthly = proposal.monthlyCents / 100

  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        name: p.tradeName || p.name,
        legalName: p.name,
        cnpj: p.document,
        email: p.email,
        phone: p.phone,
        status: 'ATIVO',
        monthlyValue: monthly > 0 ? monthly : null,
        contractStart: proposal.startDate ?? proposal.issueDate,
        contractMonths: proposal.months > 0 ? proposal.months : null,
        paymentDay: proposal.paymentDay,
        billingEmail: p.email,
        zipCode: p.zipCode,
        street: p.street,
        addressNumber: p.addressNumber,
        complement: p.complement,
        district: p.district,
        city: p.city,
        state: p.state,
        notes: p.notes,
      },
    })
    for (const item of proposal.items) {
      if (item.changeType === 'REMOVE') continue
      await tx.clientService.create({
        data: {
          clientId: created.id,
          serviceName: item.name,
          description: item.description,
          monthlyValue: item.periodicity === 'UNICO' ? null : item.monthlyCents / 100,
          totalContractValue: item.periodicity === 'UNICO' ? item.setupCents / 100 : null,
          contractDuration: item.months > 0 ? item.months : null,
          startDate: item.startDate ?? proposal.startDate,
          status: 'ATIVO',
          proposalDescription: item.description,
          defaultScope: item.scope,
          defaultDeliverables: item.deliverables,
          defaultMonthlyCents: item.monthlyCents || null,
          defaultSetupCents: item.setupCents || null,
          defaultMonths: item.months || null,
          billingKind: item.periodicity === 'UNICO' ? 'UNICO' : 'RECORRENTE',
        },
      })
    }
    await tx.prospect.update({
      where: { id: p.id },
      data: { convertedClientId: created.id, convertedAt: new Date() },
    })
    await tx.proposal.update({ where: { id: proposalId }, data: { convertedClientId: created.id } })
    return created
  })

  await logEvent(proposalId, 'CONVERSAO', `Prospect convertido em cliente por ${user.name}`, user.id, { clientId: client.id })
  await logActivity(user.id, `converteu prospect em cliente (${proposal.number})`, 'Clientes', client.name)
  return { clientId: client.id, created: true }
}

/* --------------------------------- listagem --------------------------------- */

/** Linha da listagem — documento sempre mascarado. */
export function toListRow(p: {
  id: string; number: string; kind: string; status: string; issueDate: Date; validUntil: Date
  monthlyCents: number; totalCents: number; months: number; updatedAt: Date
  snapshot: unknown; createdBy?: { name: string } | null
  items?: Array<{ name: string }>
}) {
  const snap = p.snapshot as RecipientSnapshot | null
  return {
    id: p.id,
    number: p.number,
    kind: p.kind,
    status: isExpired(p.validUntil) && ['GERADA', 'ENVIADA', 'VISUALIZADA'].includes(p.status) ? 'EXPIRADA' : p.status,
    recipientName: snap?.name ?? '—',
    recipientKind: snap?.kind ?? 'CLIENTE',
    documentMasked: maskDocument(snap?.document),
    issueDate: p.issueDate,
    validUntil: p.validUntil,
    monthly: formatBRL(p.monthlyCents),
    total: formatBRL(p.totalCents),
    monthlyCents: p.monthlyCents,
    totalCents: p.totalCents,
    months: p.months,
    services: (p.items ?? []).map((i) => i.name),
    owner: p.createdBy?.name ?? '—',
    updatedAt: p.updatedAt,
    validLabel: formatDateBR(p.validUntil),
  }
}
