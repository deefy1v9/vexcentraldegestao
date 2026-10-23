import { after } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getSetting } from './settings'
import { isConfigured, uazSendTextChecked } from './uazapi'
import { logTaskEvent, notifyWhatsApp } from './task-flow'
import {
  enfileirarAviso, processarFila,
  type DepsEnfileirar, type DepsProcessar, type RelatorioFila, type ResultadoEnfileirar,
} from './aviso-cliente-core'

/**
 * Liga o aviso ao cliente por etapa (lib/aviso-cliente-core.ts) ao banco, à
 * fila ClientNotice e ao WhatsApp da Central (UAZAPI). A regra mora no core.
 */

export const AVISO_SETTING = 'AVISO_CONCLUSAO_CLIENTE'
const AVISO_PROVIDER = 'WHATSAPP'
const AVISO_ACTION = 'aviso-conclusao'
/** Linha que ficou em ENVIANDO além disso foi interrompida no meio do envio. */
const ENVIO_PRESO_MS = 10 * 60 * 1000

const geralLigado = async () => (await getSetting(AVISO_SETTING).catch(() => '')).trim() === 'on'
const evento = (taskId: string, texto: string) => logTaskEvent(taskId, 'AVISO', texto)

const depsEnfileirar: DepsEnfileirar = {
  agora: () => new Date(),
  carregar: (taskId) =>
    prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true, number: true, title: true, assigneeId: true, stageId: true, clientText: true,
        scheduledFor: true, dueDate: true, stageEnteredAt: true, stageDeadlines: true,
        process: { select: { stages: { select: { id: true, name: true, position: true, notifyClient: true, clientPhrase: true, kind: true, dueMode: true, dueDays: true } } } },
        client: { select: { id: true, name: true, avisoConclusaoAtivo: true, whatsappGroupId: true } },
      },
    }).then((t) => (t ? { ...t, stages: t.process?.stages ?? [] } : null)),
  geralLigado,
  pendentesDoCliente: async (clientId) =>
    (await prisma.clientNotice.findMany({ where: { clientId, status: 'PENDENTE' }, select: { concludedAt: true } })).map((n) => n.concludedAt),
  criarAviso: async (a) => {
    try {
      await prisma.clientNotice.create({ data: a })
      return 'criado'
    } catch (e) {
      // (taskId, stageId) é único: esta etapa da demanda já teve aviso
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'ja-existe'
      throw e
    }
  },
  registrarEvento: evento,
  avisarResponsavel: (userId, texto) => notifyWhatsApp(userId, texto),
}

const depsProcessar: DepsProcessar = {
  agora: () => new Date(),
  vencidos: async (agora) => {
    // Envio interrompido no meio (queda do servidor): vira falha, nunca reenvia
    // sozinho — melhor avisar a equipe do que mandar em dobro ao cliente
    await prisma.clientNotice.updateMany({
      where: { status: 'ENVIANDO', updatedAt: { lt: new Date(agora.getTime() - ENVIO_PRESO_MS) } },
      data: { status: 'FALHOU', error: 'envio interrompido no meio: confira no grupo se a mensagem saiu' },
    })
    const rows = await prisma.clientNotice.findMany({
      where: { status: 'PENDENTE', sendAfter: { lte: agora } },
      orderBy: { concludedAt: 'asc' },
      take: 200,
      select: {
        id: true, taskId: true, clientId: true, attempts: true, line: true,
        task: { select: { number: true, title: true, assigneeId: true } },
        client: { select: { name: true, avisoConclusaoAtivo: true, whatsappGroupId: true } },
      },
    })
    return rows
  },
  geralLigado,
  whatsappConfigurado: () => isConfigured().catch(() => false),
  reservar: async (ids) => {
    const ok: string[] = []
    for (const id of ids) {
      const r = await prisma.clientNotice.updateMany({ where: { id, status: 'PENDENTE' }, data: { status: 'ENVIANDO' } })
      if (r.count === 1) ok.push(id)
    }
    return ok
  },
  enviarGrupo: (grupoId, texto) => uazSendTextChecked(grupoId, texto),
  marcarEnviados: async (ids, batchId) => {
    await prisma.clientNotice.updateMany({ where: { id: { in: ids } }, data: { status: 'ENVIADO', sentAt: new Date(), batchId, error: null } })
  },
  reagendar: async (ids, sendAfter, attempts, erro) => {
    await prisma.clientNotice.updateMany({ where: { id: { in: ids } }, data: { status: 'PENDENTE', sendAfter, attempts, error: erro.slice(0, 500) } })
  },
  marcarFalha: async (ids, attempts, erro) => {
    await prisma.clientNotice.updateMany({ where: { id: { in: ids } }, data: { status: 'FALHOU', attempts, error: erro.slice(0, 500) } })
  },
  cancelar: async (ids, motivo) => {
    await prisma.clientNotice.updateMany({ where: { id: { in: ids }, status: 'PENDENTE' }, data: { status: 'CANCELADO', error: motivo } })
  },
  registrarEnvio: async ({ clientId, ok, detalhe, taskIds }) => {
    await prisma.integrationLog.create({
      data: { provider: AVISO_PROVIDER, action: AVISO_ACTION, refId: clientId, ok, error: `${detalhe} · demandas ${taskIds.join(', ')}`.slice(0, 900) },
    })
  },
  registrarEvento: evento,
  avisarResponsavel: (userId, texto) => notifyWhatsApp(userId, texto),
}

/** Avalia agora o fim da etapa `deStageId` (útil em scripts). Nunca lança. */
export function avisarEtapa(taskId: string, deStageId: string | null | undefined): Promise<ResultadoEnfileirar> {
  return enfileirarAviso({ taskId, deStageId }, depsEnfileirar)
}

/**
 * Chamado depois que a demanda muda de etapa, com a etapa de onde ela saiu.
 * Roda depois da resposta: quem moveu não espera, e uma falha aqui nunca volta
 * como erro. Fora de uma requisição, roda em segundo plano do mesmo jeito.
 */
export function dispararAvisoEtapa(taskId: string, deStageId: string | null | undefined): void {
  if (!deStageId) return
  const run = () => avisarEtapa(taskId, deStageId).then(() => undefined, () => undefined)
  try {
    after(run)
  } catch {
    void run()
  }
}

let processando = false

/** Esvazia a fila (agendador, a cada minuto). Sem rodadas simultâneas. Nunca lança. */
export async function processarFilaAvisos(agora?: Date): Promise<RelatorioFila> {
  const vazio: RelatorioFila = { enviados: 0, mensagens: 0, falhas: 0, cancelados: 0, adiados: 0 }
  if (processando) return vazio
  processando = true
  try {
    return await processarFila(agora ? { ...depsProcessar, agora: () => agora } : depsProcessar)
  } catch {
    return vazio
  } finally {
    processando = false
  }
}
