import { prisma } from './prisma'
import { deliverMessage } from './crm-delivery'
import { processAiJob } from './ai/agent'

/**
 * Despachante de tarefas de fundo. Roda a cada minuto dentro do próprio
 * processo do servidor (ver instrumentation.ts) e também pode ser disparado
 * por fora em /api/cron/dispatch.
 *
 * Assume UMA réplica do serviço app — é como o stack está configurado. Com
 * mais de uma réplica seria preciso um lock distribuído, senão duas instâncias
 * enviariam a mesma mensagem agendada.
 */

const MAX_SEND_ATTEMPTS = 3
const BATCH = 20
/** Job parado nesse tempo é considerado órfão (container caiu no meio). */
const STUCK_JOB_MS = 5 * 60 * 1000

let running = false

export interface DispatchReport {
  enviadas: number
  falhas: number
  expiradas: number
  jobsReprocessados: number
}

/** Envia as mensagens agendadas cuja hora já chegou. */
async function dispatchScheduledMessages(report: DispatchReport): Promise<void> {
  const due = await prisma.scheduledMessage.findMany({
    where: { status: 'PENDENTE', scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' },
    take: BATCH,
  })

  for (const msg of due) {
    // Marca antes de enviar: se o processo cair no meio, a mensagem não é
    // reenviada por engano na próxima rodada.
    const claimed = await prisma.scheduledMessage.updateMany({
      where: { id: msg.id, status: 'PENDENTE' },
      data: { status: 'ENVIANDO', attempts: { increment: 1 } },
    })
    if (claimed.count === 0) continue

    try {
      await deliverMessage(msg.whatsappNumber, msg.content, {
        senderName: msg.createdByAi ? 'IA (agendada)' : 'Agendada',
        senderId: msg.createdById,
      })
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: 'ENVIADA', sentAt: new Date(), lastError: null },
      })
      report.enviadas++
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      const attempts = msg.attempts + 1
      const desistir = attempts >= MAX_SEND_ATTEMPTS
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: desistir ? 'FALHOU' : 'PENDENTE', lastError: error.slice(0, 500) },
      })
      if (desistir) report.falhas++
      console.error('[scheduler] envio agendado falhou', msg.id, error)
    }
  }
}

/** Fecha ações de IA que ninguém confirmou dentro do prazo. */
async function expirePendingActions(report: DispatchReport): Promise<void> {
  const res = await prisma.aiPendingAction.updateMany({
    where: { status: 'AGUARDANDO', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRADA', resolvedAt: new Date() },
  })
  report.expiradas += res.count
}

/**
 * Reprocessa jobs do agente que ficaram para trás — ou porque o webhook
 * respondeu e o processamento em background morreu junto com o container, ou
 * porque a tentativa anterior falhou.
 */
async function retryStuckAiJobs(report: DispatchReport): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_JOB_MS)
  const stuck = await prisma.aiJob.findMany({
    where: {
      OR: [
        { status: 'PENDENTE', createdAt: { lt: new Date(Date.now() - 60_000) } },
        { status: 'PROCESSANDO', startedAt: { lt: cutoff } },
      ],
      attempts: { lt: 3 },
    },
    orderBy: { createdAt: 'asc' },
    take: 5,
    select: { id: true },
  })

  for (const job of stuck) {
    await processAiJob(job.id)
    report.jobsReprocessados++
  }
}

/** Uma rodada completa. Nunca lança: o intervalo não pode morrer. */
export async function runDispatcher(): Promise<DispatchReport> {
  const report: DispatchReport = { enviadas: 0, falhas: 0, expiradas: 0, jobsReprocessados: 0 }
  if (running) return report
  running = true
  try {
    await dispatchScheduledMessages(report)
    await expirePendingActions(report)
    await retryStuckAiJobs(report)
  } catch (err) {
    console.error('[scheduler] rodada falhou', err instanceof Error ? err.message : err)
  } finally {
    running = false
  }
  return report
}

let started = false

/** Liga o laço de fundo. Idempotente — chamar duas vezes não cria dois timers. */
export function startScheduler(): void {
  if (started) return
  started = true

  const tick = () => {
    void runDispatcher()
  }

  // Primeira rodada com folga para o servidor terminar de subir.
  setTimeout(tick, 15_000)
  const timer = setInterval(tick, 60_000)
  // Não segura o processo vivo só por causa do timer.
  timer.unref?.()

  console.log('[scheduler] despachante ativo (intervalo de 60s)')
}
