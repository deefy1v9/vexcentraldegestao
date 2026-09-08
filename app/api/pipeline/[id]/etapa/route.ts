import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { moveStage, PipelineError } from '@/lib/pipeline'

/**
 * Mudança de etapa. Arrastar no Kanban, escolher no seletor ou confirmar a
 * proposta caem todos aqui, com as mesmas validações rodando no servidor.
 * Mover para "Fechado — ganho" dispara a conversão em cliente; se ela falhar,
 * a transação volta atrás e a oportunidade fica na etapa anterior.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser()
  if (viewer instanceof NextResponse) return viewer
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  try {
    const result = await moveStage(id, String(body.stage ?? ''), viewer, {
      lossReason: body.lossReason,
      conversion: body.conversion,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof PipelineError) return NextResponse.json({ error: err.message }, { status: 400 })
    const message = err instanceof Error ? err.message : 'Falha ao mover a negociação.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
