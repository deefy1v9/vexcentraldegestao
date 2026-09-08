import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { itemFromBody, logOpportunityEvent, OPPORTUNITY_INCLUDE } from '@/lib/pipeline'
import { priceWarnings } from '@/lib/pipeline-core'

async function guard(id: string, viewer: { id: string; role: string }) {
  const opp = await prisma.opportunity.findUnique({
    where: { id },
    select: { id: true, ownerId: true, convertedClientId: true },
  })
  if (!opp) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (viewer.role !== 'ADMIN' && opp.ownerId !== viewer.id) {
    return { error: NextResponse.json({ error: 'Sem acesso a esta negociação.' }, { status: 403 }) }
  }
  if (opp.convertedClientId) {
    return {
      error: NextResponse.json(
        { error: 'Negociação já convertida: os serviços agora vivem no cadastro do cliente.' },
        { status: 400 },
      ),
    }
  }
  return { error: null as NextResponse | null }
}

/** Serviços orçados: catálogo como referência, valor negociado no item. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser()
  if (viewer instanceof NextResponse) return viewer
  const { id } = await params
  const g = await guard(id, viewer)
  if (g.error) return g.error

  const body = await req.json().catch(() => ({}))
  const count = await prisma.opportunityItem.count({ where: { opportunityId: id } })
  const dados = itemFromBody(body, count)
  if (!dados.name) return NextResponse.json({ error: 'Informe o serviço.' }, { status: 400 })

  const catalogo = dados.catalogId
    ? await prisma.serviceCatalog.findUnique({ where: { id: dados.catalogId }, select: { minCents: true, maxCents: true } })
    : null

  await prisma.$transaction(async (tx) => {
    await tx.opportunityItem.create({ data: { ...dados, opportunityId: id } })
    await logOpportunityEvent(tx, id, 'VALOR', `Serviço orçado: ${dados.name} (por ${viewer.name})`, viewer.id)
  })

  const full = await prisma.opportunity.findUnique({ where: { id }, include: OPPORTUNITY_INCLUDE })
  return NextResponse.json({
    opportunity: full,
    warnings: priceWarnings([{
      ...dados,
      catalogMinCents: catalogo?.minCents ?? null,
      catalogMaxCents: catalogo?.maxCents ?? null,
    }]),
  }, { status: 201 })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser()
  if (viewer instanceof NextResponse) return viewer
  const { id } = await params
  const g = await guard(id, viewer)
  if (g.error) return g.error

  const body = await req.json().catch(() => ({}))
  const itemId = String(body.itemId ?? '')
  const item = await prisma.opportunityItem.findUnique({ where: { id: itemId } })
  if (!item || item.opportunityId !== id) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 })

  const dados = itemFromBody({
    catalogId: item.catalogId, name: item.name, scope: item.scope, contractType: item.contractType,
    quantity: item.quantity, unitCents: item.unitCents, discountCents: item.discountCents,
    months: item.months, startDate: item.startDate?.toISOString(), competence: item.competence, notes: item.notes,
    ...body,
  }, item.order)
  if (!dados.name) return NextResponse.json({ error: 'Informe o serviço.' }, { status: 400 })

  const catalogo = dados.catalogId
    ? await prisma.serviceCatalog.findUnique({ where: { id: dados.catalogId }, select: { minCents: true, maxCents: true } })
    : null

  await prisma.$transaction(async (tx) => {
    await tx.opportunityItem.update({ where: { id: itemId }, data: dados })
    await logOpportunityEvent(tx, id, 'VALOR', `Serviço orçado atualizado: ${dados.name} (por ${viewer.name})`, viewer.id)
  })
  const full = await prisma.opportunity.findUnique({ where: { id }, include: OPPORTUNITY_INCLUDE })
  return NextResponse.json({
    opportunity: full,
    warnings: priceWarnings([{
      ...dados,
      catalogMinCents: catalogo?.minCents ?? null,
      catalogMaxCents: catalogo?.maxCents ?? null,
    }]),
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser()
  if (viewer instanceof NextResponse) return viewer
  const { id } = await params
  const g = await guard(id, viewer)
  if (g.error) return g.error

  const itemId = new URL(req.url).searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ error: 'itemId obrigatório' }, { status: 400 })
  const item = await prisma.opportunityItem.findUnique({ where: { id: itemId } })
  if (!item || item.opportunityId !== id) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    await tx.opportunityItem.delete({ where: { id: itemId } })
    await logOpportunityEvent(tx, id, 'VALOR', `Serviço removido do orçamento: ${item.name} (por ${viewer.name})`, viewer.id)
  })
  const full = await prisma.opportunity.findUnique({ where: { id }, include: OPPORTUNITY_INCLUDE })
  return NextResponse.json({ opportunity: full })
}
