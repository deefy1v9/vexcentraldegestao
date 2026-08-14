import { prisma } from './prisma'
import { isConfigured, uazSendText } from './uazapi'
import { spNow } from './billing-whatsapp'

/**
 * Fluxo de produção das demandas:
 *   Backlog → A Fazer → Em Andamento → Em Revisão → Aprovado p/ Agendamento → Concluído
 *
 * Prazos derivados da data final: produção D-2, revisão D-1, entrega D.
 * As transições sensíveis (entrar em revisão, aprovar, concluir) têm ações
 * próprias — o arrasto livre no kanban é validado no backend. Notificações
 * usam a integração WhatsApp existente, sempre com mensagens curtas.
 */

export type TaskStatusValue = 'BACKLOG' | 'TODO' | 'EM_ANDAMENTO' | 'EM_REVISAO' | 'APROVADO' | 'CONCLUIDO'

const DAY = 24 * 60 * 60 * 1000

/**
 * ID da demanda para identificação em mensagens e na interface —
 * o número sequencial (#1, #2...) exibido no card e no painel.
 */
export function taskShortId(number: number): string {
  return `#${number}`
}

/** Prazos derivados da data final (D-2 produção, D-1 revisão). */
export function taskDeadlines(dueDate: Date | null) {
  if (!dueDate) return { production: null, review: null, final: null }
  return {
    production: new Date(dueDate.getTime() - 2 * DAY),
    review: new Date(dueDate.getTime() - 1 * DAY),
    final: dueDate,
  }
}

/** Link de produção aceito: URL https de Drive/Docs do Google. */
export function isValidDriveLink(link: string): boolean {
  try {
    const u = new URL(link.trim())
    return u.protocol === 'https:' && /(^|\.)(drive|docs)\.google\.com$/.test(u.hostname)
  } catch {
    return false
  }
}

export async function logTaskEvent(taskId: string, kind: string, detail: string, userId?: string | null) {
  await prisma.taskEvent.create({
    data: { taskId, kind, detail: detail.slice(0, 900), userId: userId ?? null },
  }).catch(() => {})
}

/** Aviso curto no WhatsApp — só o essencial, nunca textão. */
export async function notifyWhatsApp(userId: string | null | undefined, text: string) {
  if (!userId) return
  if (!(await isConfigured())) return
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, isActive: true },
  })
  if (!user?.phone || !user.isActive) return
  await uazSendText(user.phone, text).catch(() => {})
}

/**
 * Valida uma mudança de status vinda do arrasto no kanban (PUT genérico).
 * Devolve mensagem de erro, exigência de justificativa ou null (permitido).
 * As etapas controladas têm rotas próprias; o arrasto só circula entre
 * Backlog/A Fazer/Em Andamento — o resto exige a ação correspondente
 * (ou justificativa de administrador).
 */
export function validateDragTransition(
  task: { status: string; driveLink: string | null },
  next: TaskStatusValue,
  isAdmin: boolean,
  overrideReason?: string,
): { error?: string; needsOverride?: boolean; overrideOk?: boolean } {
  const from = task.status as TaskStatusValue
  if (from === next) return {}

  const free = new Set(['BACKLOG', 'TODO', 'EM_ANDAMENTO'])

  // Movimentação livre dentro da fase de produção
  if (free.has(from) && free.has(next)) return {}

  // Entrar em revisão arrastando: permitido se já houver link do Drive
  // (o caminho normal é o botão "Enviar para revisão")
  if (free.has(from) && next === 'EM_REVISAO') {
    if (task.driveLink) return {}
    return { error: 'Para enviar à revisão, adicione o link do Google Drive na demanda e use "Enviar para revisão".' }
  }

  // Todo o resto é etapa controlada
  const controlled: Record<string, string> = {
    APROVADO: 'A aprovação é feita pelo revisor com o botão "Aprovar" na demanda.',
    CONCLUIDO: 'A conclusão exige a confirmação do agendamento na demanda.',
  }
  if (from === 'EM_REVISAO' && (next === 'EM_ANDAMENTO' || free.has(next))) {
    if (isAdmin && overrideReason?.trim()) return { overrideOk: true }
    if (isAdmin) return { needsOverride: true, error: 'Sair de "Em Revisão" exige aprovar ou solicitar ajustes. Como administrador, informe uma justificativa para mover mesmo assim.' }
    return { error: 'Sair de "Em Revisão" exige aprovar ou solicitar ajustes (botões na demanda).' }
  }

  if (isAdmin && overrideReason?.trim()) return { overrideOk: true }
  if (isAdmin) {
    return {
      needsOverride: true,
      error: controlled[next] ?? 'Movimento fora do fluxo. Como administrador, informe uma justificativa para prosseguir.',
    }
  }
  return { error: controlled[next] ?? 'Movimento não permitido pelo fluxo da demanda.' }
}

/**
 * Responsáveis padrão da operação. A fonte da verdade são os IDs salvos em
 * SystemSettings (DEFAULT_REVIEWER_ID / DEFAULT_SCHEDULER_ID) — nunca
 * comparação por nome. O fallback por nome existe só para a primeira
 * execução, antes de os IDs serem configurados.
 */
export async function defaultAssignments() {
  const [users, rows] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
    }),
    prisma.$queryRaw<Array<{ key: string; value: string }>>`
      SELECT key, value FROM "SystemSettings"
      WHERE key IN ('DEFAULT_REVIEWER_ID', 'DEFAULT_SCHEDULER_ID')
    `,
  ])
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const byId = (id?: string) => (id && users.find((u) => u.id === id)) || null
  const byName = (needle: string) =>
    users.find((u) => u.name.toLowerCase().includes(needle)) ?? null

  const reviewer = byId(settings.DEFAULT_REVIEWER_ID) ?? byName('antonio') ??
    users.find((u) => u.role === 'ADMIN') ?? null
  const scheduler = byId(settings.DEFAULT_SCHEDULER_ID) ?? byName('igor')
  const producer = scheduler ?? byName('igor')

  return {
    producerId: producer?.id ?? null,
    reviewerId: reviewer?.id ?? null,
    schedulerId: scheduler?.id ?? null,
  }
}

/* ------------------------------- lembretes ------------------------------- */

const REMINDER_SKIP_PRODUCTION: TaskStatusValue[] = ['EM_REVISAO', 'APROVADO', 'CONCLUIDO']

/**
 * Lembretes diários das demandas (roda junto do agendador, 1x por dia):
 * - D-2 da entrega: lembra o produtor de entregar para revisão;
 * - D-1 da entrega: lembra o revisor — apenas se a demanda já está em
 *   revisão; se ainda está em produção, só registra no histórico.
 * Nunca muda status, nunca move card, não exige resposta. Os campos
 * reminder*At garantem envio único por demanda.
 */
export async function runTaskReminders(): Promise<{ sent: number }> {
  if (!(await isConfigured())) return { sent: 0 }

  const { date: today } = spNow()
  const todayUTC = new Date(`${today}T00:00:00Z`)
  let sent = 0

  const open = await prisma.task.findMany({
    where: {
      status: { notIn: ['CONCLUIDO'] },
      dueDate: { not: null },
    },
    include: {
      producer: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  })

  for (const task of open) {
    if (!task.dueDate) continue
    const dueStr = task.dueDate.toISOString().slice(0, 10)
    const diffDays = Math.round((new Date(`${dueStr}T00:00:00Z`).getTime() - todayUTC.getTime()) / DAY)

    // D-2: produção
    if (diffDays === 2 && !task.reminderProductionAt &&
        !REMINDER_SKIP_PRODUCTION.includes(task.status as TaskStatusValue)) {
      const target = task.producer ?? task.assignee
      if (target) {
        await notifyWhatsApp(target.id, `Lembrete: a demanda ${task.title} (${taskShortId(task.number)}) precisa ser entregue para revisão.`)
        await prisma.task.update({ where: { id: task.id }, data: { reminderProductionAt: new Date() } })
        await logTaskEvent(task.id, 'LEMBRETE', `Lembrete de produção enviado para ${target.name} (WhatsApp)`)
        sent++
      }
    }

    // D-1: revisão
    if (diffDays === 1 && !task.reminderReviewAt) {
      if (task.status === 'EM_REVISAO') {
        const target = task.reviewer ?? task.assignee
        if (target) {
          await notifyWhatsApp(target.id, `Lembrete: a demanda ${task.title} (${taskShortId(task.number)}) precisa ser revisada.`)
          await prisma.task.update({ where: { id: task.id }, data: { reminderReviewAt: new Date() } })
          await logTaskEvent(task.id, 'LEMBRETE', `Lembrete de revisão enviado para ${target.name} (WhatsApp)`)
          sent++
        }
      } else if (['BACKLOG', 'TODO', 'EM_ANDAMENTO'].includes(task.status)) {
        // Produção atrasada: não avisa o revisor de algo que não existe,
        // apenas registra a situação no histórico da demanda
        await prisma.task.update({ where: { id: task.id }, data: { reminderReviewAt: new Date() } })
        await logTaskEvent(task.id, 'AVISO', 'Véspera da entrega e a produção ainda não foi enviada para revisão')
      }
    }
  }

  return { sent }
}

/**
 * Demanda criada já dentro da janela de lembrete (D-2 ou menos até a data
 * final): dispara um único lembrete imediato ao produtor.
 */
export async function maybeImmediateReminder(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { producer: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
  })
  if (!task?.dueDate || task.reminderProductionAt) return
  if (REMINDER_SKIP_PRODUCTION.includes(task.status as TaskStatusValue)) return

  const { date: today } = spNow()
  const todayUTC = new Date(`${today}T00:00:00Z`)
  const dueStr = task.dueDate.toISOString().slice(0, 10)
  const diffDays = Math.round((new Date(`${dueStr}T00:00:00Z`).getTime() - todayUTC.getTime()) / DAY)
  if (diffDays > 2 || diffDays < 0) return

  const target = task.producer ?? task.assignee
  if (!target) return
  await notifyWhatsApp(target.id, `Lembrete: a demanda ${task.title} (${taskShortId(task.number)}) precisa ser entregue para revisão.`)
  await prisma.task.update({ where: { id: task.id }, data: { reminderProductionAt: new Date() } })
  await logTaskEvent(task.id, 'LEMBRETE', `Lembrete imediato de produção enviado para ${target.name} (WhatsApp)`)
}
