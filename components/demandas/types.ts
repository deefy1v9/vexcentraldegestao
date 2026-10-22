import type { TaskLike, TaskStatus, TaskPriority, UserRef } from '@/lib/demandas-core'
import type { ClientLinkFields } from '@/lib/client-links'

/** Demanda como chega da API (regras puras usam só o TaskLike). */
export interface Task extends TaskLike {
  description?: string | null
  /** "Texto para o cliente": o que vai no aviso de conclusão no grupo dele */
  clientText?: string | null
  platform?: string | null
  contentType?: string | null
  driveLink?: string | null
  tags: string[]
  client?: ({ id: string; name: string; tier?: string | null } & ClientLinkFields) | null
  creator: UserRef
  scheduledFor?: Date | string | null
  scheduledPlatform?: string | null
  publicationLink?: string | null
  _count: { comments: number }
  // Processo e etapa atual (lista)
  processId?: string | null
  stageId?: string | null
  stageEnteredAt?: Date | string | null
  process?: { id: string; name: string; color: string } | null
  stage?: { id: string; name: string; kind: string; dueMode: string; dueDays: number; position: number } | null
  team?: { id: string; name: string; color: string } | null
}

/** Equipe, para a fila e os filtros. */
export interface TeamOption { id: string; name: string; color: string }

/** Processo para filtros e para escolher ao criar demanda. */
export interface ProcessOption { id: string; name: string; color: string; stageCount: number }

export interface TaskEvent {
  id: string
  kind: string
  detail: string
  createdAt: string
  user?: UserRef | null
}

export interface Option { id: string; name: string }

export type View = 'tarefas' | 'fila' | 'quadro' | 'lista' | 'calendario'

export type { TaskStatus, TaskPriority, UserRef }
