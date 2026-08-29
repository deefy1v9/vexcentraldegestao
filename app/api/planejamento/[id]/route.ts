import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildProposal, refreshConflicts } from '@/lib/planner'

/**
 * Prévia do planejamento (admin). GET devolve a análise, a proposta e os
 * itens sugeridos — sem o conteúdo do contrato, que nunca volta ao frontend
 * depois de processado.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const analysis = await prisma.contractAnalysis.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, tier: true, operationalGroup: true } },
      proposal: { include: { items: { orderBy: [{ publishAt: 'asc' }, { sequence: 'asc' }] } } },
    },
  })
  if (!analysis) return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 })

  const extraction = analysis.extraction as Record<string, unknown> | null
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, position: true, specialties: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    analysis: {
      id: analysis.id,
      status: analysis.status,
      fileName: analysis.fileName,
      model: analysis.model,
      confidence: analysis.confidence,
      warnings: analysis.warnings,
      missing: analysis.missing,
      error: analysis.error,
      durationMs: analysis.durationMs,
      createdAt: analysis.createdAt,
      // Resumo da extração — nunca o texto integral do contrato
      deliveries: (extraction?.deliveries as unknown[]) ?? [],
      contractStart: extraction?.contract_start ?? null,
      contractEnd: extraction?.contract_end ?? null,
      responsibilities: {
        agency: (extraction?.agency_responsibilities as string[]) ?? [],
        client: (extraction?.client_responsibilities as string[]) ?? [],
        approvals: (extraction?.approval_dependencies as string[]) ?? [],
      },
      observations: (extraction?.observations as string[]) ?? [],
    },
    client: analysis.client,
    proposal: analysis.proposal
      ? {
          id: analysis.proposal.id,
          status: analysis.proposal.status,
          weekGroup: analysis.proposal.weekGroup,
          groupReason: analysis.proposal.groupReason,
          summary: analysis.proposal.summary,
          items: analysis.proposal.items,
        }
      : null,
    users,
  })
}

/** Remonta a prévia com os dados atuais (sem nova chamada à IA). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? 'rebuild')

  const analysis = await prisma.contractAnalysis.findUnique({ where: { id }, include: { proposal: true } })
  if (!analysis) return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 })

  if (action === 'cancel') {
    if (analysis.proposal) {
      await prisma.planProposal.update({ where: { id: analysis.proposal.id }, data: { status: 'CANCELADO' } })
      // Só as sugestões pendentes somem; o que já virou demanda fica intacto
      await prisma.planItem.deleteMany({ where: { planId: analysis.proposal.id, status: { in: ['PENDENTE', 'APROVADO'] } } })
    }
    await prisma.contractAnalysis.update({ where: { id }, data: { status: 'CANCELADO' } })
    return NextResponse.json({ ok: true, cancelled: true })
  }

  if (action === 'refresh') {
    if (!analysis.proposal) return NextResponse.json({ error: 'Sem proposta para atualizar.' }, { status: 400 })
    const conflicts = await refreshConflicts(analysis.proposal.id)
    return NextResponse.json({ ok: true, conflicts })
  }

  const built = await buildProposal(id)
  return NextResponse.json({ ok: true, ...built })
}
