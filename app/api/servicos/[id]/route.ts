import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { catalogDataFromBody } from '@/lib/services-catalog'
import { serviceCents, recurringTicketCents } from '@/lib/billing-core'

/**
 * Serviço do catálogo: detalhe com clientes vinculados e receita, edição,
 * ativação/inativação e duplicação. Inativar não apaga nada — contratações
 * existentes continuam válidas; só bloqueia novas.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const service = await prisma.serviceCatalog.findUnique({
    where: { id },
    include: {
      clientServices: {
        include: { client: { select: { id: true, name: true, status: true, tier: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!service) return NextResponse.json({ error: 'Serviço não encontrado.' }, { status: 404 })

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const contracts = service.clientServices.map((s) => ({
    id: s.id,
    clientId: s.clientId,
    clientName: s.client.name,
    clientStatus: s.client.status,
    clientTier: s.client.tier,
    status: s.status,
    contractType: s.contractType,
    cents: serviceCents(s),
    competence: s.competence,
    startDate: s.startDate,
    endDate: s.endDate,
    recurringCents: recurringTicketCents([s], today),
  }))

  // Receita já recebida com este serviço (parcelas pagas)
  const paidAgg = await prisma.clientPayment.aggregate({
    _sum: { amount: true },
    where: { status: 'PAGO', service: { catalogId: id } },
  })

  return NextResponse.json({
    service: { ...service, clientServices: undefined },
    contracts,
    stats: {
      activeClients: new Set(contracts.filter((c) => c.status === 'ATIVO' && c.clientStatus === 'ATIVO').map((c) => c.clientId)).size,
      recurringCents: contracts.reduce((s, c) => s + c.recurringCents, 0),
      receivedCents: Math.round((paidAgg._sum.amount ?? 0) * 100),
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const existing = await prisma.serviceCatalog.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Serviço não encontrado.' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data = catalogDataFromBody(body)
  if (Object.prototype.hasOwnProperty.call(data, 'name') && !String(data.name)) {
    return NextResponse.json({ error: 'Informe o nome do serviço.' }, { status: 400 })
  }
  const min = (data.minCents as number | null | undefined) ?? existing.minCents
  const max = (data.maxCents as number | null | undefined) ?? existing.maxCents
  if (min != null && max != null && max < min) {
    return NextResponse.json({ error: 'O valor máximo não pode ser menor que o mínimo.' }, { status: 400 })
  }
  if (data.name && String(data.name).toLowerCase() !== existing.name.toLowerCase()) {
    const dup = await prisma.serviceCatalog.findFirst({ where: { name: { equals: String(data.name), mode: 'insensitive' }, id: { not: id } } })
    if (dup) return NextResponse.json({ error: 'Já existe um serviço com este nome.' }, { status: 409 })
  }

  const updated = await prisma.serviceCatalog.update({ where: { id }, data: data as object })
  await logActivity(
    admin.id,
    Object.prototype.hasOwnProperty.call(data, 'isActive') && Object.keys(data).length === 1
      ? (data.isActive ? 'ativou serviço do catálogo' : 'inativou serviço do catálogo')
      : 'editou serviço do catálogo',
    'Serviços',
    updated.name,
  )
  return NextResponse.json({ service: updated })
}

/** Duplica o serviço (nome com sufixo, inativo até o admin revisar). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const src = await prisma.serviceCatalog.findUnique({ where: { id } })
  if (!src) return NextResponse.json({ error: 'Serviço não encontrado.' }, { status: 404 })

  let name = `${src.name} (cópia)`
  for (let i = 2; await prisma.serviceCatalog.findUnique({ where: { name } }); i++) name = `${src.name} (cópia ${i})`

  const copy = await prisma.serviceCatalog.create({
    data: {
      name,
      category: src.category,
      summary: src.summary,
      scope: src.scope,
      deliverables: src.deliverables,
      exclusions: src.exclusions,
      leadTimeDays: src.leadTimeDays,
      periodicity: src.periodicity,
      billingType: src.billingType,
      minCents: src.minCents,
      maxCents: src.maxCents,
      defaultCents: src.defaultCents,
      internalNotes: src.internalNotes,
      isActive: false,
    },
  })
  await logActivity(admin.id, 'duplicou serviço do catálogo', 'Serviços', copy.name)
  return NextResponse.json({ service: copy }, { status: 201 })
}
