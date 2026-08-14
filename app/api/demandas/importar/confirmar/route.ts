import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { normalizeTitle, PRIORITY_MAP } from '@/lib/ai-import'
import { logTaskEvent, notifyWhatsApp, taskShortId } from '@/lib/task-flow'

/**
 * Confirmação da importação: cria em lote (transação) as demandas que o
 * administrador selecionou e editou na tela de revisão.
 *
 * Idempotência: cada AiImportItem só vira demanda uma vez (trava por
 * updateMany condicionado ao status) — duplo clique não duplica. Além
 * disso, título normalizado + cliente + data final iguais a uma demanda
 * existente são pulados como duplicidade.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const importId = String(body.importId ?? '')
  const items: Array<{
    itemId: string
    title: string
    description?: string
    clientId: string | null
    responsibleId: string | null
    reviewerId: string | null
    schedulerId: string | null
    dueDate: string | null
    priority: string
    contentType?: string | null
    platform?: string | null
  }> = Array.isArray(body.items) ? body.items : []

  if (!importId || items.length === 0) {
    return NextResponse.json({ error: 'Nada para confirmar.' }, { status: 400 })
  }

  const imp = await prisma.aiImport.findUnique({ where: { id: importId } })
  if (!imp) return NextResponse.json({ error: 'Importação não encontrada.' }, { status: 404 })

  // Campos obrigatórios antes de qualquer criação — tudo ou nada
  for (const item of items) {
    if (!item.title?.trim() || !item.clientId || !item.responsibleId || !item.dueDate) {
      return NextResponse.json(
        { error: `O item "${item.title || 'sem título'}" precisa de cliente, responsável e data final antes de ser confirmado.` },
        { status: 400 },
      )
    }
  }

  const created: string[] = []
  let ignored = 0

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      // Trava de idempotência: só o primeiro clique captura o item
      const lock = await tx.aiImportItem.updateMany({
        where: { id: item.itemId, importId, status: 'PENDENTE' },
        data: { status: 'CRIADO' },
      })
      if (lock.count === 0) { ignored++; continue }

      // Deduplicação contra demandas já existentes
      const dueDate = new Date(item.dueDate!)
      const existing = await tx.task.findMany({
        where: { clientId: item.clientId, dueDate },
        select: { id: true, title: true },
      })
      const normalized = normalizeTitle(item.title)
      if (existing.some((t) => normalizeTitle(t.title) === normalized)) {
        await tx.aiImportItem.update({ where: { id: item.itemId }, data: { status: 'IGNORADO' } })
        ignored++
        continue
      }

      const task = await tx.task.create({
        data: {
          title: item.title.trim(),
          description: item.description?.trim() || null,
          status: 'TODO',
          priority: (PRIORITY_MAP[item.priority] ?? item.priority ?? 'MEDIA') as never,
          dueDate,
          clientId: item.clientId,
          assigneeId: item.responsibleId,
          producerId: item.responsibleId,
          reviewerId: item.reviewerId,
          schedulerId: item.schedulerId,
          platform: item.platform || null,
          contentType: item.contentType || null,
          importId,
          creatorId: admin.id,
          tags: [],
        },
      })
      await tx.aiImportItem.update({
        where: { id: item.itemId },
        data: { createdTaskId: task.id },
      })
      created.push(task.id)
    }

    await tx.aiImport.update({
      where: { id: importId },
      data: {
        status: 'CONFIRMADO',
        itemsCreated: { increment: created.length },
        itemsIgnored: { increment: ignored },
      },
    })
  })

  // Pós-transação: histórico por demanda + UMA mensagem de WhatsApp por
  // responsável, com a lista completa (nunca uma mensagem por demanda)
  const tasks = await prisma.task.findMany({
    where: { id: { in: created } },
    include: {
      client: { select: { name: true, tier: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: 'asc' },
  })
  for (const task of tasks) {
    await logTaskEvent(task.id, 'CRIACAO', `Criada via importação com IA por ${admin.name}`, admin.id)
  }

  const byAssignee = new Map<string, typeof tasks>()
  for (const task of tasks) {
    if (!task.assignee) continue
    const list = byAssignee.get(task.assignee.id)
    if (list) list.push(task)
    else byAssignee.set(task.assignee.id, [task])
  }
  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 's/ data')
  for (const [assigneeId, list] of byAssignee) {
    const lines = list.slice(0, 20).map((t) => {
      // Prazo de produção (D-2) — o processo segue: produzir, revisar, agendar
      const prod = t.dueDate ? new Date(new Date(t.dueDate).getTime() - 2 * 86400_000) : null
      return `${taskShortId(t.number)} ${t.title}${t.client ? ` — ${t.client.name}` : ''} • produzir até ${fmt(prod)} • publicar ${fmt(t.dueDate)}`
    })
    const extra = list.length > 20 ? `\n… e mais ${list.length - 20} demanda(s).` : ''
    await notifyWhatsApp(
      assigneeId,
      `📋 ${list.length} nova(s) demanda(s) atribuída(s) a você:\n\n${lines.join('\n')}${extra}\n\nFluxo: produzir → revisar (1 dia antes) → agendar (data final). Detalhes no sistema.`,
    )
  }

  await logActivity(admin.id, `confirmou importação com IA (${created.length} demandas)`, 'Demandas', imp.fileName ?? 'texto')
  return NextResponse.json({ created: created.length, ignored })
}
