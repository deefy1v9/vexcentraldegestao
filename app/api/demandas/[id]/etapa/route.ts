import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { moveTaskStage, StageError, type StageAction } from '@/lib/processos-server'

const ACTIONS: StageAction[] = ['avancar', 'devolver', 'mover', 'checklist', 'assumir']

/**
 * Anda com a demanda no processo:
 * POST { action: 'avancar' | 'devolver' | 'mover' | 'checklist', ... }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '') as StageAction
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  try {
    const task = await moveTaskStage(id, {
      action,
      toStageId: body.toStageId ? String(body.toStageId) : undefined,
      note: body.note ? String(body.note) : undefined,
      driveLink: body.driveLink ? String(body.driveLink) : undefined,
      link: body.link ? String(body.link) : undefined,
      publicationLink: body.publicationLink ? String(body.publicationLink) : undefined,
      publicationDate: body.publicationDate ? String(body.publicationDate) : undefined,
      checklistKey: body.checklistKey ? String(body.checklistKey) : undefined,
      checked: !!body.checked,
    }, user)
    return NextResponse.json({ ok: true, stageId: task.stageId, status: task.status, assigneeId: task.assigneeId })
  } catch (e) {
    if (e instanceof StageError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[etapa]', e)
    return NextResponse.json({ error: 'Falha ao mover a demanda.' }, { status: 500 })
  }
}
