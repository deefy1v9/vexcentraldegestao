import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { logTaskEvent, notifyWhatsApp, taskShortId } from './task-flow'
import { dispararAvisoConclusao } from './aviso-cliente'
import {
  DEFAULT_PROCESSES, DEFAULT_PROCESS_SLUG, inferProcessSlug, missingToAdvance, nextStage, ordered, prevStage,
  responsibleFor, stageForStatus, type ProcessData, type StageInput,
} from './processos'

/** Ids de quem está na equipe (ativos). */
export async function teamMemberIds(teamId: string | null | undefined): Promise<string[]> {
  if (!teamId) return []
  const ms = await prisma.teamMember.findMany({ where: { teamId, user: { isActive: true } }, select: { userId: true } })
  return ms.map((m) => m.userId)
}

/** Equipes de que a pessoa participa. */
export async function myTeamIds(userId: string): Promise<string[]> {
  const ms = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } })
  return ms.map((m) => m.teamId)
}

/**
 * Processos — lado do servidor: semente dos processos padrão, encaixe das
 * demandas antigas e a transição de etapa (concluir, aprovar, devolver, mover).
 */

const STAGES_ORDER = { orderBy: { position: 'asc' as const } }

/** Cria os processos padrão que ainda não existem (idempotente pelo slug). */
export async function ensureDefaultProcesses() {
  const existentes = new Set((await prisma.process.findMany({ select: { slug: true } })).map((p) => p.slug))
  let pos = existentes.size
  for (const p of DEFAULT_PROCESSES) {
    if (existentes.has(p.slug)) continue
    await prisma.process.create({
      data: {
        slug: p.slug, name: p.name, color: p.color, description: p.description, position: pos++,
        stages: {
          create: p.stages.map((s, i) => ({
            position: i, name: s.name, kind: s.kind, status: s.status, role: s.role ?? null,
            dueMode: s.dueMode ?? 'DIAS_APOS_ENTRADA', dueDays: s.dueDays ?? 2,
            fields: s.fields ?? [], checklist: s.checklist ?? [], checklistRequired: s.checklistRequired ?? false,
            instructions: s.instructions ?? null,
          })),
        },
      },
    })
  }
}

/**
 * Demandas sem processo (antigas, ou criadas por caminhos que ainda não
 * escolhem processo) entram no processo de conteúdo, na etapa do status atual.
 * O status não muda: só ganha a etapa correspondente.
 */
export async function attachOrphanTasks() {
  const orfas = await prisma.task.findMany({
    where: { OR: [{ processId: null }, { stageId: null }] },
    select: { id: true, status: true, processId: true, updatedAt: true, contentType: true },
  })
  if (orfas.length === 0) return 0
  await ensureDefaultProcesses()
  const padrao = await prisma.process.findUnique({ where: { slug: DEFAULT_PROCESS_SLUG }, include: { stages: STAGES_ORDER } })
  if (!padrao) return 0
  const porSlug = new Map((await prisma.process.findMany({ select: { id: true, slug: true } })).map((p) => [p.slug, p.id]))
  const cache = new Map<string, typeof padrao.stages>([[padrao.id, padrao.stages]])
  for (const t of orfas) {
    // O processo vem do tipo da demanda (logo, site, design...); sem tipo, conteúdo
    const processId = t.processId ?? porSlug.get(inferProcessSlug(t.contentType)) ?? padrao.id
    if (!cache.has(processId)) {
      const p = await prisma.process.findUnique({ where: { id: processId }, include: { stages: STAGES_ORDER } })
      cache.set(processId, p?.stages ?? [])
    }
    const etapa = stageForStatus(cache.get(processId)!, t.status)
    await prisma.task.update({
      where: { id: t.id },
      data: { processId, stageId: etapa?.id ?? null, stageEnteredAt: t.updatedAt, teamId: etapa?.teamId ?? null },
    })
  }
  return orfas.length
}

/**
 * Depois de uma mudança de status por fora do processo (quadro, ações antigas,
 * assistente), põe a demanda na etapa equivalente. Se a etapa atual já tem
 * aquele status, nada muda.
 */
export async function alignStageToStatus(taskId: string) {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true, stageId: true, process: { include: { stages: STAGES_ORDER } } },
  })
  if (!t?.process) return
  const atual = t.process.stages.find((s) => s.id === t.stageId)
  const primeira = t.process.stages[0]
  const mesmaFase = atual && (atual.status === t.status ||
    (atual.id === primeira?.id && ['BACKLOG', 'TODO', 'EM_ANDAMENTO'].includes(t.status)))
  if (mesmaFase) return
  const etapa = stageForStatus(t.process.stages, t.status)
  if (etapa) await prisma.task.update({ where: { id: taskId }, data: { stageId: etapa.id, stageEnteredAt: new Date(), teamId: etapa.teamId ?? null } })
}

/** Dados iniciais de uma demanda nova num processo: primeira etapa e responsável. */
export async function startProcessData(processId: string, roles: { assigneeId?: string | null; producerId?: string | null; reviewerId?: string | null; schedulerId?: string | null }) {
  const p = await prisma.process.findUnique({ where: { id: processId }, include: { stages: STAGES_ORDER } })
  const primeira = p?.stages[0]
  if (!p || !primeira) return {}
  const membros = await teamMemberIds(primeira.teamId)
  const quem = responsibleFor(primeira, roles, membros)
  return {
    processId: p.id,
    stageId: primeira.id,
    stageEnteredAt: new Date(),
    teamId: primeira.teamId ?? null,
    // Etapa de equipe com várias pessoas: começa na fila, sem responsável
    assigneeId: primeira.teamId && !primeira.role && !primeira.defaultUserId ? quem : (quem ?? roles.assigneeId ?? null),
  }
}

export type StageAction = 'avancar' | 'devolver' | 'mover' | 'checklist' | 'assumir'

export interface StageMoveInput extends StageInput {
  action: StageAction
  toStageId?: string
  checklistKey?: string
  checked?: boolean
}

export class StageError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/**
 * Transição de etapa. Regras:
 * - concluir/aprovar: só o responsável atual ou admin; exige o que a etapa pede;
 * - devolver: só em etapa de aprovação, com observação; volta uma etapa;
 * - mover: só admin, para qualquer etapa, com justificativa;
 * - checklist: marca/desmarca um item da etapa atual.
 * O status antigo é espelhado da etapa de destino.
 */
export async function moveTaskStage(taskId: string, input: StageMoveInput, user: { id: string; role: string; name?: string | null }) {
  const isAdmin = user.role === 'ADMIN'
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { process: { include: { stages: STAGES_ORDER } } },
  })
  if (!task) throw new StageError('Demanda não encontrada.', 404)
  if (!task.process) throw new StageError('Esta demanda ainda não tem processo.')
  const stages = task.process.stages
  const atual = stages.find((s) => s.id === task.stageId) ?? stages[0]
  const ehResponsavel = task.assigneeId === user.id
  const daEquipe = !!task.teamId && (await teamMemberIds(task.teamId)).includes(user.id)

  /* assumir: alguém da equipe (ou admin) pega a tarefa da fila */
  if (input.action === 'assumir') {
    if (task.assigneeId && !isAdmin) throw new StageError('Esta tarefa já tem responsável.')
    if (!isAdmin && !daEquipe) throw new StageError('Só quem é da equipe desta etapa pode assumir.', 403)
    const t = await prisma.task.update({ where: { id: taskId }, data: { assigneeId: user.id } })
    await logTaskEvent(taskId, 'ETAPA', `${user.name ?? 'Alguém'} assumiu "${atual.name}".`, user.id)
    return t
  }

  if (!isAdmin && !ehResponsavel) {
    throw new StageError(daEquipe && !task.assigneeId ? 'Assuma a tarefa antes de concluir a etapa.' : 'Só o responsável pela etapa (ou um administrador) pode fazer isso.', 403)
  }

  /* checklist: não muda de etapa */
  if (input.action === 'checklist') {
    if (!input.checklistKey?.startsWith(`${atual.id}:`)) throw new StageError('Item de checklist inválido.')
    const feitos = new Set(task.checklistDone)
    if (input.checked) feitos.add(input.checklistKey); else feitos.delete(input.checklistKey)
    return prisma.task.update({ where: { id: taskId }, data: { checklistDone: [...feitos] } })
  }

  let destino = null as (typeof stages)[number] | null
  if (input.action === 'avancar') {
    if (atual.kind === 'FINAL') throw new StageError('A demanda já está concluída.')
    const falta = missingToAdvance(atual, task, input)
    if (falta.length) throw new StageError(`Para ${atual.kind === 'APROVACAO' ? 'aprovar' : 'concluir'} falta: ${falta.join(', ')}.`)
    destino = nextStage(stages, atual.id)
  } else if (input.action === 'devolver') {
    if (atual.kind !== 'APROVACAO') throw new StageError('Só dá para devolver numa etapa de aprovação.')
    if (!input.note?.trim()) throw new StageError('Escreva o que precisa ser ajustado.')
    destino = prevStage(stages, atual.id)
  } else if (input.action === 'mover') {
    if (!isAdmin) throw new StageError('Só administradores movem a demanda para qualquer etapa.', 403)
    if (!input.note?.trim()) throw new StageError('Informe a justificativa (fica no histórico).')
    destino = stages.find((s) => s.id === input.toStageId) ?? null
  }
  if (!destino) throw new StageError('Etapa de destino não encontrada.')

  /* o que foi preenchido no painel vai para os campos de sempre */
  const agora = new Date()
  const data: Prisma.TaskUncheckedUpdateInput = {}
  const dados = { ...((task.processData ?? {}) as ProcessData) }
  if (input.driveLink?.trim()) { data.driveLink = input.driveLink.trim(); data.driveLinkSentAt = agora; data.driveLinkSentBy = user.id }
  if (input.publicationLink?.trim()) data.publicationLink = input.publicationLink.trim()
  if (input.publicationDate) { data.scheduledFor = new Date(input.publicationDate); data.scheduledAt = agora; data.scheduledById = user.id }
  if (input.link?.trim() || input.note?.trim()) {
    dados[atual.id] = { ...dados[atual.id], ...(input.link?.trim() ? { link: input.link.trim() } : {}), ...(input.note?.trim() ? { note: input.note.trim() } : {}), at: agora.toISOString(), by: user.id }
    data.processData = dados as Prisma.InputJsonValue
  }
  if (atual.kind === 'APROVACAO') {
    data.reviewedById = user.id; data.reviewedAt = agora
    if (input.action === 'devolver') data.reviewNote = input.note!.trim()
  }

  const membrosDestino = await teamMemberIds(destino.teamId)
  const novoResponsavel = destino.kind === 'FINAL' ? task.assigneeId : responsibleFor(destino, task, membrosDestino)
  Object.assign(data, {
    stageId: destino.id,
    stageEnteredAt: agora,
    status: destino.status,
    assigneeId: novoResponsavel,
    teamId: destino.kind === 'FINAL' ? null : (destino.teamId ?? null),
  })
  const atualizada = await prisma.task.update({ where: { id: taskId }, data })
  // Chegou ao fim do processo: avisa o grupo do cliente depois da resposta
  dispararAvisoConclusao(taskId, task.status, destino.status)

  const verbo = input.action === 'avancar' ? (atual.kind === 'APROVACAO' ? 'aprovou' : 'concluiu') : input.action === 'devolver' ? 'devolveu' : 'moveu'
  const detalhe = input.action === 'mover'
    ? `${user.name ?? 'Alguém'} moveu de "${atual.name}" para "${destino.name}". Justificativa: ${input.note!.trim()}`
    : input.action === 'devolver'
      ? `${user.name ?? 'Alguém'} devolveu "${atual.name}" para "${destino.name}": ${input.note!.trim()}`
      : `${user.name ?? 'Alguém'} ${verbo} "${atual.name}". Agora: "${destino.name}".`
  await logTaskEvent(taskId, 'ETAPA', detalhe, user.id)

  // Foi para a fila de uma equipe: avisa quem é dela
  if (!novoResponsavel && destino.teamId && destino.kind !== 'FINAL') {
    const equipe = await prisma.team.findUnique({ where: { id: destino.teamId }, select: { name: true } })
    for (const id of membrosDestino.filter((m) => m !== user.id)) {
      await notifyWhatsApp(id, `Nova tarefa na fila da equipe ${equipe?.name ?? ''}: ${task.title} (${taskShortId(task.number)}) em "${destino.name}". Abra a Central para assumir.`)
    }
  }
  if (novoResponsavel && novoResponsavel !== user.id && destino.kind !== 'FINAL') {
    const aviso = input.action === 'devolver'
      ? `A demanda ${task.title} (${taskShortId(task.number)}) voltou para você em "${destino.name}": ${input.note!.trim()}`
      : `Nova tarefa: ${task.title} (${taskShortId(task.number)}) está em "${destino.name}" com você.`
    await notifyWhatsApp(novoResponsavel, aviso)
  }
  return atualizada
}

/** Lista de processos com etapas, na ordem da tela. */
export function listProcesses(opts: { onlyActive?: boolean } = {}) {
  return prisma.process.findMany({
    where: opts.onlyActive ? { active: true } : {},
    include: {
      stages: { ...STAGES_ORDER, include: { defaultUser: { select: { id: true, name: true } }, team: { select: { id: true, name: true, color: true } } } },
      _count: { select: { tasks: true } },
    },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
  })
}

export { ordered }
