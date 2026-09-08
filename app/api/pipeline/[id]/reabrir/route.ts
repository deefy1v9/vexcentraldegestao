import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { PipelineError, reopenOpportunity } from '@/lib/pipeline'

/**
 * Ação administrativa: solta uma conversão já concluída para nova análise.
 * Cliente, serviços, pagamentos e documentos são preservados — a reabertura
 * fica registrada no histórico da oportunidade.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  try {
    await reopenOpportunity(id, admin, String(body.reason ?? ''))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PipelineError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }
}
