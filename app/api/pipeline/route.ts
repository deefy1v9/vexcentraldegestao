import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { boardData, ensureLead, itemFromBody, logOpportunityEvent, PipelineError } from '@/lib/pipeline'
import { isStage } from '@/lib/pipeline-core'

/**
 * Quadro do pipeline (oportunidades, responsáveis e catálogo) e criação de
 * negociações. Colaborador enxerga apenas as próprias oportunidades.
 */
export async function GET() {
  const viewer = await requireUser()
  if (viewer instanceof NextResponse) return viewer
  return NextResponse.json(await boardData(viewer))
}

export async function POST(req: NextRequest) {
  const viewer = await requireUser()
  if (viewer instanceof NextResponse) return viewer

  const body = await req.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  const leadName = String(body.leadName ?? '').trim()
  if (!title && !leadName) return NextResponse.json({ error: 'Informe o nome do contato ou empresa.' }, { status: 400 })

  const ownerId = body.ownerId ? String(body.ownerId) : viewer.id
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } })
  if (!owner) return NextResponse.json({ error: 'Selecione o responsável comercial.' }, { status: 400 })

  const stage = isStage(body.stage) ? body.stage : 'NOVO'
  if (stage === 'GANHO' || stage === 'PERDIDO') {
    return NextResponse.json({ error: 'Uma negociação não nasce fechada.' }, { status: 400 })
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      let prospectId: string | null = body.prospectId ? String(body.prospectId) : null
      const clientId = body.clientId ? String(body.clientId) : null

      // Cliente existente não vira lead: a oportunidade aponta direto para ele
      if (!clientId && !prospectId) {
        const lead = await ensureLead(tx, {
          name: leadName || title,
          tradeName: body.tradeName, document: body.document, email: body.email,
          phone: body.phone, contactName: body.contactName, source: body.source,
          ownerId, crmContactId: body.crmContactId, notes: body.notes,
          interestServices: Array.isArray(body.interestServices) ? body.interestServices.map(String) : [],
          personType: body.personType,
        }, viewer.id)
        prospectId = lead.id
      }

      const opp = await tx.opportunity.create({
        data: {
          title: title || leadName,
          stage,
          prospectId,
          clientId,
          ownerId,
          source: body.source ? String(body.source).slice(0, 120) : null,
          estimateCents: Math.max(0, Math.round(Number(body.estimateCents) || 0)),
          estimateNote: body.estimateNote ? String(body.estimateNote).slice(0, 300) : null,
          expectedCloseDate: body.expectedCloseDate ? new Date(`${String(body.expectedCloseDate).slice(0, 10)}T12:00:00Z`) : null,
          nextAction: body.nextAction ? String(body.nextAction).slice(0, 300) : null,
          nextActionAt: body.nextActionAt ? new Date(`${String(body.nextActionAt).slice(0, 10)}T12:00:00Z`) : null,
          notes: body.notes ? String(body.notes).slice(0, 4000) : null,
          proposalId: body.proposalId ? String(body.proposalId) : null,
          createdById: viewer.id,
          items: Array.isArray(body.items)
            ? { create: body.items.map((i: Record<string, unknown>, idx: number) => itemFromBody(i, idx)) }
            : undefined,
        },
      })
      await logOpportunityEvent(tx, opp.id, 'CRIACAO', `Oportunidade criada por ${viewer.name}`, viewer.id)
      return opp
    })

    await logActivity(viewer.id, 'criou oportunidade', 'Pipeline', created.title)
    const full = await prisma.opportunity.findUnique({ where: { id: created.id }, include: { items: true } })
    return NextResponse.json(full, { status: 201 })
  } catch (err) {
    if (err instanceof PipelineError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }
}
