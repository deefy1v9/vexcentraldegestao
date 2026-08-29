import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import {
  addDaysISO, isValidDocument, onlyDigits, personTypeOf, spTodayISO, toCents,
} from '@/lib/proposal-core'
import {
  ensureDefaultTemplate, logEvent, nextNumber, recalcProposal, snapshotFromClient,
  snapshotFromProspect, toListRow,
} from '@/lib/proposals'

/**
 * Propostas comerciais e aditivos (admin).
 *
 * GET  — listagem com filtros; documentos sempre mascarados.
 * POST — cria a proposta em rascunho. Nada é gerado nem enviado aqui.
 */

export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const prospectId = searchParams.get('prospectId')
  const status = searchParams.get('status')
  const kind = searchParams.get('kind')
  const search = (searchParams.get('q') ?? '').trim()
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where: Prisma.ProposalWhereInput = {
    ...(clientId ? { clientId } : {}),
    ...(prospectId ? { prospectId } : {}),
    ...(status ? { status } : {}),
    ...(kind ? { kind } : {}),
    ...(from || to
      ? {
          issueDate: {
            ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59Z`) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { number: { contains: search, mode: 'insensitive' } },
            { client: { name: { contains: search, mode: 'insensitive' } } },
            { prospect: { name: { contains: search, mode: 'insensitive' } } },
            // Busca por documento aceita o número digitado com ou sem máscara
            ...(onlyDigits(search).length >= 3
              ? [{ prospect: { document: { contains: onlyDigits(search) } } } as Prisma.ProposalWhereInput]
              : []),
          ],
        }
      : {}),
  }

  const proposals = await prisma.proposal.findMany({
    where,
    include: {
      items: { select: { name: true }, orderBy: { order: 'asc' } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json({ proposals: proposals.map(toListRow) })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const kind = body.kind === 'ADITIVO' ? 'ADITIVO' : 'PROPOSTA'
  const clientId: string | null = body.clientId ? String(body.clientId) : null
  const prospectId: string | null = body.prospectId ? String(body.prospectId) : null
  const parentId: string | null = body.parentId ? String(body.parentId) : null

  if (!clientId && !prospectId) {
    return NextResponse.json({ error: 'Selecione um cliente ou cadastre um prospect.' }, { status: 400 })
  }
  if (kind === 'ADITIVO' && !parentId) {
    return NextResponse.json({ error: 'O aditivo precisa referenciar a proposta ou contrato de origem.' }, { status: 400 })
  }

  const snapshot = clientId ? await snapshotFromClient(clientId) : await snapshotFromProspect(prospectId!)
  if (!snapshot.document || !isValidDocument(snapshot.document)) {
    return NextResponse.json(
      { error: 'O cadastro precisa de um CPF/CNPJ válido antes de gerar a proposta.' },
      { status: 400 },
    )
  }

  const today = spTodayISO()
  const issueDate = typeof body.issueDate === 'string' && body.issueDate ? body.issueDate.slice(0, 10) : today
  const validUntil = typeof body.validUntil === 'string' && body.validUntil
    ? body.validUntil.slice(0, 10)
    : addDaysISO(issueDate, 15)
  if (validUntil < issueDate) {
    return NextResponse.json({ error: 'A validade não pode ser anterior à data da proposta.' }, { status: 400 })
  }

  const template = kind === 'PROPOSTA' ? await ensureDefaultTemplate() : null
  const year = Number(issueDate.slice(0, 4))

  type ItemInput = {
    serviceId?: string | null; name?: string; description?: string | null; scope?: string | null
    deliverables?: string[]; quantity?: number; monthlyValue?: string | number; setupValue?: string | number
    discountValue?: string | number; discountPercent?: number | null; months?: number
    periodicity?: string; startDate?: string | null; notes?: string | null
    changeType?: string | null; previousMonthlyValue?: string | number | null; previousMonths?: number | null
  }
  const rawItems: ItemInput[] = Array.isArray(body.items) ? body.items : []
  const items = rawItems
    .filter((i) => (i.name ?? '').trim())
    .map((i, index) => ({
      serviceId: i.serviceId || null,
      order: index,
      name: String(i.name).trim().slice(0, 160),
      description: i.description ? String(i.description).slice(0, 2000) : null,
      scope: i.scope ? String(i.scope).slice(0, 4000) : null,
      deliverables: Array.isArray(i.deliverables) ? i.deliverables.map((d) => String(d).slice(0, 200)).slice(0, 20) : [],
      quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
      monthlyCents: toCents(i.monthlyValue ?? 0),
      setupCents: toCents(i.setupValue ?? 0),
      discountCents: toCents(i.discountValue ?? 0),
      discountPercent: i.discountPercent != null && Number.isFinite(Number(i.discountPercent))
        ? new Prisma.Decimal(String(Math.min(100, Math.max(0, Number(i.discountPercent)))))
        : null,
      months: Math.max(0, Math.round(Number(i.months) || 0)),
      periodicity: i.periodicity === 'UNICO' ? 'UNICO' : 'MENSAL',
      startDate: i.startDate ? new Date(`${String(i.startDate).slice(0, 10)}T12:00:00Z`) : null,
      notes: i.notes ? String(i.notes).slice(0, 1000) : null,
      changeType: kind === 'ADITIVO' ? (i.changeType ?? 'ALTERA') : null,
      previousMonthlyCents: i.previousMonthlyValue != null ? toCents(i.previousMonthlyValue) : null,
      previousMonths: i.previousMonths != null ? Math.max(0, Math.round(Number(i.previousMonths))) : null,
    }))

  // Numeração: o unique (kind, year, seq) resolve corrida — o perdedor tenta o próximo
  let created: { id: string; number: string } | null = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < 6 && !created; attempt++) {
    const { seq, number } = await nextNumber(kind, year)
    try {
      created = await prisma.proposal.create({
        data: {
          number, kind, year, seq,
          clientId, prospectId, parentId,
          templateId: template?.id ?? null,
          status: 'RASCUNHO',
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          issueDate: new Date(`${issueDate}T12:00:00Z`),
          validUntil: new Date(`${validUntil}T12:00:00Z`),
          startDate: body.startDate ? new Date(`${String(body.startDate).slice(0, 10)}T12:00:00Z`) : null,
          paymentDay: body.paymentDay ? Math.min(28, Math.max(1, Number(body.paymentDay))) : null,
          paymentTerms: body.paymentTerms ? String(body.paymentTerms).slice(0, 300) : null,
          notes: body.notes ? String(body.notes).slice(0, 2000) : null,
          discountCents: toCents(body.discountValue ?? 0),
          discountPercent: body.discountPercent != null && Number.isFinite(Number(body.discountPercent))
            ? new Prisma.Decimal(String(Math.min(100, Math.max(0, Number(body.discountPercent)))))
            : null,
          createdById: admin.id,
          items: { create: items },
        },
        select: { id: true, number: true },
      })
    } catch (err) {
      lastError = err
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err
    }
  }
  if (!created) {
    console.error('[propostas] falha na numeração', lastError)
    return NextResponse.json({ error: 'Não foi possível gerar o número da proposta. Tente de novo.' }, { status: 409 })
  }

  await recalcProposal(created.id)
  await logEvent(created.id, 'CRIACAO', `${kind === 'ADITIVO' ? 'Aditivo' : 'Proposta'} criada por ${admin.name}`, admin.id)
  await logActivity(admin.id, `criou ${kind === 'ADITIVO' ? 'aditivo' : 'proposta'} ${created.number}`, 'Propostas', created.number)

  return NextResponse.json({ id: created.id, number: created.number }, { status: 201 })
}
