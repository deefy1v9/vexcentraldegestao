import type { TaskLike, TaskStatus, TaskPriority, UserRef } from '@/lib/demandas-core'
import type { ClientLinkFields } from '@/lib/client-links'

/** Demanda como chega da API (regras puras usam só o TaskLike). */
export interface Task extends TaskLike {
  description?: string | null
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
}

export interface TaskEvent {
  id: string
  kind: string
  detail: string
  createdAt: string
  user?: UserRef | null
}

export interface Option { id: string; name: string }

export type View = 'fila' | 'quadro' | 'lista' | 'calendario'

export type { TaskStatus, TaskPriority, UserRef }
