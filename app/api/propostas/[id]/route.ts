import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { formatBRL, formatDocument, isExpired, proposalTotals, toCents } from '@/lib/proposal-core'
import {
  itemsToInput, logEvent, recalcProposal, validateForGeneration, type RecipientSnapshot,
} from '@/lib/proposals'

/**
 * Proposta individual (admin): leitura completa para a prévia e edição dos
 * campos comerciais. O documento em si nunca sai por aqui — download é rota
 * própria e autenticada.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const p = await prisma.proposal.findUnique({
    where: { id },
    include: {
      items: { orderBy: { order: 'asc' } },
      createdBy: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      prospect: { select: { id: true, name: true, convertedClientId: true } },
      parent: { select: { id: true, number: true } },
      addendums: { select: { id: true, number: true, status: true, issueDate: true }, orderBy: { createdAt: 'desc' } },
      versions: { select: { version: true, note: true, createdAt: true }, orderBy: { version: 'desc' } },
      documents: { select: { id: true, version: true, format: true, size: true, fileName: true, createdAt: true, downloads: true }, orderBy: { createdAt: 'desc' } },
      events: { select: { id: true, kind: true, detail: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 },
    },
  })
  if (!p) return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 })

  const snap = p.snapshot as unknown as RecipientSnapshot
  const totals = proposalTotals(itemsToInput(p.items), {
    discountCents: p.discountCents,
    discountPercent: p.discountPercent != null ? Number(p.discountPercent) : null,
  })
  const missing = await validateForGeneration(id)

  return NextResponse.json({
    proposal: {
      ...p,
      // Documento completo só para administrador autenticado (é o caso aqui)
      recipient: { ...snap, documentFormatted: formatDocument(snap?.document) },
      expired: isExpired(p.validUntil),
      totals: {
        ...totals,
        monthlyLabel: formatBRL(totals.monthlyCents),
        setupLabel: formatBRL(totals.setupCents),
        totalLabel: formatBRL(totals.totalCents),
      },
      missing,
    },
  })
}

/** Edição dos campos comerciais e dos itens (substitui a lista inteira). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const current = await prisma.proposal.findUnique({ where: { id } })
  if (!current) return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 })
  if (['CANCELADA', 'SUBSTITUIDA'].includes(current.status)) {
    return NextResponse.json({ error: 'Esta proposta não pode mais ser editada.' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const data: Record<string, unknown> = {}

  if (has('issueDate') && body.issueDate) data.issueDate = new Date(`${String(body.issueDate).slice(0, 10)}T12:00:00Z`)
  if (has('validUntil') && body.validUntil) data.validUntil = new Date(`${String(body.validUntil).slice(0, 10)}T12:00:00Z`)
  if (has('startDate')) data.startDate = body.startDate ? new Date(`${String(body.startDate).slice(0, 10)}T12:00:00Z`) : null
  if (has('paymentDay')) data.paymentDay = body.paymentDay ? Math.min(28, Math.max(1, Number(body.paymentDay))) : null
  if (has('paymentTerms')) data.paymentTerms = body.paymentTerms ? String(body.paymentTerms).slice(0, 300) : null
  if (has('notes')) data.notes = body.notes ? String(body.notes).slice(0, 2000) : null
  if (has('discountValue')) data.discountCents = toCents(body.discountValue)
  if (has('discountPercent')) {
    data.discountPercent = body.discountPercent != null && Number.isFinite(Number(body.discountPercent))
      ? new Prisma.Decimal(String(Math.min(100, Math.max(0, Number(body.discountPercent)))))
      : null
  }

  const issue = (data.issueDate as Date | undefined) ?? current.issueDate
  const valid = (data.validUntil as Date | undefined) ?? current.validUntil
  if (valid < issue) {
    return NextResponse.json({ error: 'A validade não pode ser anterior à data da proposta.' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.proposal.update({ where: { id }, data })
    }
    if (Array.isArray(body.items)) {
      type ItemInput = Record<string, unknown>
      const items = (body.items as ItemInput[])
        .filter((i) => String(i.name ?? '').trim())
        .map((i, index) => ({
          proposalId: id,
          serviceId: i.serviceId ? String(i.serviceId) : null,
          order: index,
          name: String(i.name).trim().slice(0, 160),
          description: i.description ? String(i.description).slice(0, 2000) : null,
          scope: i.scope ? String(i.scope).slice(0, 4000) : null,
          deliverables: Array.isArray(i.deliverables) ? (i.deliverables as unknown[]).map((d) => String(d).slice(0, 200)).slice(0, 20) : [],
          quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
          monthlyCents: toCents(i.monthlyValue as string | number),
          setupCents: toCents(i.setupValue as string | number),
          discountCents: toCents(i.discountValue as string | number),
          discountPercent: i.discountPercent != null && Number.isFinite(Number(i.discountPercent))
            ? new Prisma.Decimal(String(Math.min(100, Math.max(0, Number(i.discountPercent)))))
            : null,
          months: Math.max(0, Math.round(Number(i.months) || 0)),
          periodicity: i.periodicity === 'UNICO' ? 'UNICO' : 'MENSAL',
          startDate: i.startDate ? new Date(`${String(i.startDate).slice(0, 10)}T12:00:00Z`) : null,
          notes: i.notes ? String(i.notes).slice(0, 1000) : null,
          changeType: current.kind === 'ADITIVO' ? String(i.changeType ?? 'ALTERA') : null,
          previousMonthlyCents: i.previousMonthlyValue != null ? toCents(i.previousMonthlyValue as string | number) : null,
          previousMonths: i.previousMonths != null ? Math.max(0, Math.round(Number(i.previousMonths))) : null,
        }))
      await tx.proposalItem.deleteMany({ where: { proposalId: id } })
      if (items.length > 0) await tx.proposalItem.createMany({ data: items })
    }
  })

  await recalcProposal(id)
  await logEvent(id, 'EDICAO', `Proposta editada por ${admin.name}`, admin.id)
  return NextResponse.json({ ok: true })
}
