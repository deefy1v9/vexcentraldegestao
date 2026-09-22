'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import TaskDetail from './TaskDetail'
import type { Option, Task, TaskStatus } from './types'

/** Página de uma demanda: estado local + ações que o detalhe precisa. */
export default function TaskPage({
  task: initial, users, clients, currentUserId, isAdmin,
}: {
  task: Task
  users: Option[]
  clients: Option[]
  currentUserId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [task, setTask] = useState<Task>(initial)

  const apply = useCallback((updated: Task) => setTask((prev) => ({ ...prev, ...updated })), [])

  async function updateStatus(taskId: string, status: TaskStatus, overrideReason?: string): Promise<void> {
    const res = await fetch(`/api/demandas/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrideReason ? { status, overrideReason } : { status }),
    })
    if (res.ok) { setTask((prev) => ({ ...prev, status })); return }
    // Backend recusou: o fluxo exige a ação própria (ou justificativa de admin)
    const body = await res.json().catch(() => ({}))
    if (body.needsOverride && isAdmin) {
      const reason = prompt(`${body.error}\n\nJustificativa (fica registrada no histórico):`)
      if (reason?.trim()) return updateStatus(taskId, status, reason.trim())
      return
    }
    alert(body.error || 'Movimento não permitido pelo fluxo da demanda.')
  }

  async function remove(id: string) {
    await fetch(`/api/demandas/${id}`, { method: 'DELETE' })
    router.push('/demandas')
  }

  return (
    <TaskDetail
      task={task}
      users={users}
      clients={clients}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      onApply={apply}
      onDelete={remove}
      onStatusChange={updateStatus}
    />
  )
}
