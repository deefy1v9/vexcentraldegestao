import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { confirmProposal, setClientGroup } from '@/lib/planner'

/**
 * Confirmação explícita do planejamento: só aqui as demandas passam a
 * existir, criadas pelo mesmo fluxo do módulo de Demandas.
 *
 * POST { itemIds?: string[] } — sem itemIds, confirma tudo que está pendente.
 * Idempotente: repetir a chamada (ou o duplo clique) não duplica demanda.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const itemIds: string[] = Array.isArray(body.itemIds) ? body.itemIds.map(String) : []

  const analysis = await prisma.contractAnalysis.findUnique({
    where: { id },
    include: { proposal: true, client: { select: { id: true, name: true } } },
  })
  if (!analysis?.proposal) return NextResponse.json({ error: 'Planejamento não encontrado.' }, { status: 404 })
  if (analysis.proposal.status === 'CANCELADO') {
    return NextResponse.json({ error: 'Este planejamento foi cancelado.' }, { status: 400 })
  }

  try {
    const result = await confirmProposal(analysis.proposal.id, admin.id, admin.name, itemIds)

    // Grupo operacional escolhido vira o grupo do cliente (estabilidade)
    if (result.created > 0 && (analysis.proposal.weekGroup === 'A' || analysis.proposal.weekGroup === 'B')) {
      await setClientGroup(analysis.clientId, analysis.proposal.weekGroup)
    }

    if (result.created > 0) {
      await logActivity(
        admin.id,
        `confirmou planejamento com IA (${result.created} demandas)`,
        'Calendário',
        analysis.client.name,
      )
    }
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Não foi possível confirmar o planejamento.' },
      { status: 400 },
    )
  }
}
