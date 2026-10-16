import type { TaskStatus } from '@prisma/client'

/**
 * Validação do que vem do editor de processos. Devolve as etapas já no
 * formato do Prisma, na ordem recebida (a posição é o índice).
 */

const KINDS = ['EXECUCAO', 'APROVACAO', 'FINAL']
const STATUSES: TaskStatus[] = ['BACKLOG', 'TODO', 'EM_ANDAMENTO', 'EM_REVISAO', 'APROVADO', 'CONCLUIDO']
const ROLES = ['PRODUTOR', 'REVISOR', 'AGENDADOR']
const DUE_MODES = ['DIAS_APOS_ENTRADA', 'ANTES_DA_ENTREGA']
const FIELDS = ['LINK_DRIVE', 'LINK', 'LINK_PUBLICACAO', 'DATA_PUBLICACAO', 'NOTA']

export interface ParsedStage {
  id?: string
  position: number
  name: string
  instructions: string | null
  kind: string
  status: TaskStatus
  role: string | null
  defaultUserId: string | null
  teamId: string | null
  dueMode: string
  dueDays: number
  fields: string[]
  checklist: string[]
  checklistRequired: boolean
}

export function parseStages(raw: unknown): { stages: ParsedStage[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'O processo precisa de pelo menos uma etapa.' }
  const stages: ParsedStage[] = []
  for (const [i, r] of raw.entries()) {
    const s = (r ?? {}) as Record<string, unknown>
    const name = String(s.name ?? '').trim()
    if (!name) return { error: `A etapa ${i + 1} está sem nome.` }
    const kind = KINDS.includes(String(s.kind)) ? String(s.kind) : 'EXECUCAO'
    const fallbackStatus: TaskStatus = kind === 'FINAL' ? 'CONCLUIDO' : kind === 'APROVACAO' ? 'EM_REVISAO' : 'EM_ANDAMENTO'
    stages.push({
      id: s.id ? String(s.id) : undefined,
      position: i,
      name: name.slice(0, 80),
      instructions: s.instructions ? String(s.instructions).trim().slice(0, 1000) || null : null,
      kind,
      status: STATUSES.includes(s.status as TaskStatus) ? (s.status as TaskStatus) : fallbackStatus,
      role: ROLES.includes(String(s.role)) ? String(s.role) : null,
      defaultUserId: s.defaultUserId ? String(s.defaultUserId) : null,
      teamId: s.teamId ? String(s.teamId) : null,
      dueMode: DUE_MODES.includes(String(s.dueMode)) ? String(s.dueMode) : 'DIAS_APOS_ENTRADA',
      dueDays: Math.max(0, Math.min(90, Math.round(Number(s.dueDays ?? 2)) || 0)),
      fields: Array.isArray(s.fields) ? s.fields.map(String).filter((f) => FIELDS.includes(f)) : [],
      checklist: Array.isArray(s.checklist) ? s.checklist.map((c) => String(c).trim()).filter(Boolean).slice(0, 20) : [],
      checklistRequired: !!s.checklistRequired,
    })
  }
  const finais = stages.filter((s) => s.kind === 'FINAL')
  if (finais.length !== 1 || stages[stages.length - 1].kind !== 'FINAL') {
    return { error: 'O processo precisa terminar em uma (e só uma) etapa final.' }
  }
  if (stages.length < 2) return { error: 'Inclua ao menos uma etapa de trabalho antes da final.' }
  if (stages[0].kind === 'APROVACAO') return { error: 'A primeira etapa não pode ser de aprovação: não há o que devolver.' }
  return { stages }
}

export function slugify(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'processo'
}
