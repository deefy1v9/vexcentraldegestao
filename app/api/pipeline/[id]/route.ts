import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { OPPORTUNITY_INCLUDE, logOpportunityEvent, projectedTierFor } from '@/lib/pipeline'

/** Detalhe da oportunidade com histórico, e edição dos campos comerciais. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser()
  if (viewer instanceof NextResponse) return viewer
  const { id } = await params

  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      ...OPPORTUNITY_INCLUDE,
      events: { orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } } } },
    },
  })
  if (!opportunity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (viewer.role !== 'ADMIN' && opportunity.ownerId !== viewer.id) {
    return NextResponse.json({ error: 'Sem acesso a esta negociação.' }, { status: 403 })
  }
  return NextResponse.json({ opportunity, projected: await projectedTierFor(id) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser()
  if (viewer instanceof NextResponse) return viewer
  const { id } = await params

  const atual = await prisma.opportunity.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (viewer.role !== 'ADMIN' && atual.ownerId !== viewer.id) {
    return NextResponse.json({ error: 'Sem acesso a esta negociação.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const data: Record<string, unknown> = {}
  const eventos: Array<{ type: string; message: string }> = []

  if (has('title') && String(body.title).trim()) data.title = String(body.title).trim().slice(0, 160)
  if (has('notes')) data.notes = body.notes ? String(body.notes).slice(0, 4000) : null
  if (has('source')) data.source = body.source ? String(body.source).slice(0, 120) : null
  if (has('nextAction')) data.nextAction = body.nextAction ? String(body.nextAction).slice(0, 300) : null
  if (has('nextActionAt')) data.nextActionAt = body.nextActionAt ? new Date(`${String(body.nextActionAt).slice(0, 10)}T12:00:00Z`) : null
  if (has('expectedCloseDate')) data.expectedCloseDate = body.expectedCloseDate ? new Date(`${String(body.expectedCloseDate).slice(0, 10)}T12:00:00Z`) : null
  if (has('estimateNote')) data.estimateNote = body.estimateNote ? String(body.estimateNote).slice(0, 300) : null

  if (has('estimateCents')) {
    const valor = Math.max(0, Math.round(Number(body.estimateCents) || 0))
    if (valor !== atual.estimateCents) {
      eventos.push({ type: 'VALOR', message: `Valor estimado alterado para R$ ${(valor / 100).toFixed(2)}` })
    }
    data.estimateCents = valor
  }
  if (has('ownerId') && body.ownerId && body.ownerId !== atual.ownerId) {
    const novo = await prisma.user.findUnique({ where: { id: String(body.ownerId) }, select: { id: true, name: true } })
    if (!novo) return NextResponse.json({ error: 'Responsável inválido.' }, { status: 400 })
    data.ownerId = novo.id
    eventos.push({ type: 'RESPONSAVEL', message: `Responsável alterado para ${novo.name}` })
  }
  if (has('proposalId')) {
    const pid = body.proposalId ? String(body.proposalId) : null
    if (pid) {
      const proposta = await prisma.proposal.findUnique({ where: { id: pid }, select: { id: true, number: true } })
      if (!proposta) return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 })
      eventos.push({ type: 'PROPOSTA', message: `Proposta vinculada: ${proposta.number}` })
    }
    data.proposalId = pid
  }
  if (has('clientId')) data.clientId = body.clientId ? String(body.clientId) : null

  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({ where: { id }, data })
    for (const e of eventos) await logOpportunityEvent(tx, id, e.type, `${e.message} (por ${viewer.name})`, viewer.id)
  })

  const full = await prisma.opportunity.findUnique({ where: { id }, include: OPPORTUNITY_INCLUDE })
  return NextResponse.json(full)
}
