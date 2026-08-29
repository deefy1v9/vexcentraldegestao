import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { internalDeadlines, isValidISO, holidaySet, competenceOf } from '@/lib/planner-core'
import { getPlannerConfig, refreshConflicts } from '@/lib/planner'

/**
 * Edição de um item sugerido, antes da confirmação (admin).
 *
 * Toda alteração é auditável: `editedFields` guarda o que o administrador
 * mudou e `suggested` preserva a sugestão original da IA — base para
 * melhorar as próximas propostas (sem treinar modelo nesta versão).
 */

const EDITABLE = ['title', 'description', 'publishAt', 'assigneeId', 'reviewerId', 'schedulerId', 'priority', 'platform', 'contentType', 'weekGroup'] as const
const PRIORITIES = new Set(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { itemId } = await params
  const item = await prisma.planItem.findUnique({ where: { id: itemId }, include: { plan: true } })
  if (!item) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 })
  if (item.status === 'CRIADO') {
    return NextResponse.json({ error: 'Este item já virou demanda — edite pela tela de Demandas.' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const data: Record<string, unknown> = {}
  const edited = new Set(item.editedFields)

  if (has('title')) {
    const title = String(body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'Informe o título da demanda.' }, { status: 400 })
    data.title = title.slice(0, 200)
    edited.add('title')
  }
  if (has('description')) {
    data.description = body.description ? String(body.description).slice(0, 2000) : null
    edited.add('description')
  }
  if (has('priority')) {
    const p = String(body.priority ?? '')
    if (!PRIORITIES.has(p)) return NextResponse.json({ error: 'Prioridade inválida.' }, { status: 400 })
    data.priority = p
    edited.add('priority')
  }
  for (const field of ['assigneeId', 'reviewerId', 'schedulerId'] as const) {
    if (!has(field)) continue
    const value = body[field] ? String(body[field]) : null
    if (value) {
      const user = await prisma.user.findFirst({ where: { id: value, isActive: true }, select: { id: true } })
      if (!user) return NextResponse.json({ error: 'Colaborador inválido.' }, { status: 400 })
    }
    data[field] = value
    edited.add(field)
  }
  for (const field of ['platform', 'contentType'] as const) {
    if (!has(field)) continue
    data[field] = body[field] ? String(body[field]).slice(0, 80) : null
    edited.add(field)
  }
  if (has('weekGroup')) {
    const g = body.weekGroup ? String(body.weekGroup) : null
    if (g && g !== 'A' && g !== 'B') return NextResponse.json({ error: 'Grupo inválido.' }, { status: 400 })
    data.weekGroup = g
    edited.add('weekGroup')
  }

  // Mudança de data recalcula os prazos internos com a configuração vigente
  if (has('publishAt')) {
    const iso = String(body.publishAt ?? '').slice(0, 10)
    if (!isValidISO(iso)) return NextResponse.json({ error: 'Data de publicação inválida.' }, { status: 400 })
    const cfg = await getPlannerConfig()
    const holidays = holidaySet(iso, iso, cfg.extraHolidays)
    const d = internalDeadlines(iso, cfg, holidays)
    data.publishAt = new Date(`${iso}T12:00:00Z`)
    data.productionAt = new Date(`${d.production}T12:00:00Z`)
    data.reviewAt = new Date(`${d.review}T12:00:00Z`)
    data.approvalAt = d.approval ? new Date(`${d.approval}T12:00:00Z`) : null
    data.scheduleAt = d.schedule ? new Date(`${d.schedule}T12:00:00Z`) : null
    data.competence = competenceOf(iso)
    edited.add('publishAt')
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada para alterar.' }, { status: 400 })
  }

  const updated = await prisma.planItem.update({
    where: { id: itemId },
    data: {
      ...data,
      origin: 'MANUAL',
      editedFields: [...edited],
      editNote: body.editNote ? String(body.editNote).slice(0, 300) : item.editNote,
      status: item.status === 'DESCARTADO' ? 'PENDENTE' : item.status,
    },
  })

  // Conflitos são recalculados com a mudança já aplicada
  await refreshConflicts(item.planId).catch(() => {})
  const fresh = await prisma.planItem.findUnique({ where: { id: itemId } })
  return NextResponse.json({ item: fresh ?? updated })
}

/** Descarta (ou reativa) uma sugestão antes da confirmação. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { itemId } = await params
  const item = await prisma.planItem.findUnique({ where: { id: itemId } })
  if (!item) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 })
  if (item.status === 'CRIADO') {
    return NextResponse.json({ error: 'Este item já virou demanda.' }, { status: 400 })
  }

  await prisma.planItem.update({ where: { id: itemId }, data: { status: 'DESCARTADO' } })
  return NextResponse.json({ ok: true })
}
