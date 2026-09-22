'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ListChecks, Users } from 'lucide-react'
import AiImportModal from '@/components/demandas/AiImportModal'
import { filterTasks, summarize, type DemandasFilters, type Period, type TaskStatus } from '@/lib/demandas-core'
import StatTiles, { type TileKey } from './StatTiles'
import DemandasToolbar, { DemandasChips } from './DemandasToolbar'
import MyQueue from './MyQueue'
import TeamPanel from './TeamPanel'
import BoardView from './BoardView'
import ListView from './ListView'
import CalendarTab from './CalendarTab'
import NewTaskModal from './NewTaskModal'
import TaskDetailModal from './TaskDetailModal'
import type { Option, Task, View } from './types'

const VIEWS: View[] = ['fila', 'quadro', 'lista', 'calendario']
const PERIODS: Period[] = ['hoje', 'semana', 'mes']

/**
 * Tela de Demandas: números no topo, filtros compactos, painel lateral
 * (fila pessoal ou carga da equipe) e o mesmo conjunto de demandas em três
 * lentes — quadro, lista e calendário. Filtros e visão vivem na URL.
 */
export default function DemandasWorkspace({
  initialTasks, clients, users, currentUserId, isAdmin,
}: {
  initialTasks: Task[]
  clients: Option[]
  users: Option[]
  currentUserId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showAiImport, setShowAiImport] = useState(false)
  const [asideTab, setAsideTab] = useState<'equipe' | 'fila'>(isAdmin ? 'equipe' : 'fila')

  /* ------------------------- estado que vive na URL ------------------------- */
  const view: View = VIEWS.includes(params.get('visao') as View) ? (params.get('visao') as View) : 'quadro'
  const filters: DemandasFilters = useMemo(() => {
    const periodo = params.get('periodo') ?? ''
    return {
      q: params.get('q') ?? '',
      assignee: isAdmin ? (params.get('resp') ?? '') : '',
      client: params.get('cliente') ?? '',
      period: PERIODS.includes(periodo as Period) ? (periodo as Period) : '',
      tier: params.get('grupo') ?? '',
      status: params.get('etapa') ?? '',
      late: params.get('atrasadas') === '1',
      // Colaborador começa nas próprias demandas; "Equipe" abre o resto
      mine: isAdmin ? false : params.get('escopo') !== 'equipe',
      action: params.get('vez') === '1',
    }
  }, [params, isAdmin])

  const push = useCallback((next: Partial<DemandasFilters> & { view?: View }) => {
    const m = { ...filters, ...next }
    const q = new URLSearchParams()
    q.set('visao', next.view ?? view)
    if (m.q) q.set('q', m.q)
    if (m.assignee) q.set('resp', m.assignee)
    if (m.client) q.set('cliente', m.client)
    if (m.period) q.set('periodo', m.period)
    if (m.tier) q.set('grupo', m.tier)
    if (m.status) q.set('etapa', m.status)
    if (m.late) q.set('atrasadas', '1')
    if (!isAdmin && !m.mine) q.set('escopo', 'equipe')
    if (m.action) q.set('vez', '1')
    router.replace(`${pathname}?${q.toString()}`, { scroll: false })
  }, [filters, view, isAdmin, router, pathname])

  // Abertura direta por link (?task=id): o calendário e as notificações
  // apontam para cá. Roda uma vez por id.
  const deepLinkId = params.get('task')
  const openedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!deepLinkId || openedRef.current === deepLinkId) return
    if (!tasks.some((t) => t.id === deepLinkId)) return
    openedRef.current = deepLinkId
    // Abrir a demanda do link é o efeito pretendido — uma vez por id
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(deepLinkId)
  }, [deepLinkId, tasks])

  /* --------------------------------- dados --------------------------------- */
  const visible = useMemo(() => filterTasks(tasks, filters, currentUserId), [tasks, filters, currentUserId])
  const summary = useMemo(() => summarize(tasks, currentUserId, isAdmin), [tasks, currentUserId, isAdmin])
  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null

  const activeTile: TileKey | null = filters.late ? 'late'
    : filters.period === 'hoje' ? 'today'
    : filters.period === 'semana' ? 'week'
    : (isAdmin ? filters.status === 'EM_REVISAO' : filters.action) ? 'action'
    : null

  function toggleTile(key: TileKey) {
    const base: Partial<DemandasFilters> = { late: false, period: '', action: false, status: filters.status === 'EM_REVISAO' ? '' : filters.status }
    if (activeTile === key) { push(base); return }
    if (key === 'late') push({ ...base, late: true })
    else if (key === 'today') push({ ...base, period: 'hoje' })
    else if (key === 'week') push({ ...base, period: 'semana' })
    else if (isAdmin) push({ ...base, status: 'EM_REVISAO' })
    else push({ ...base, action: true })
  }

  const applyTask = useCallback((updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))
  }, [])

  async function reloadTasks() {
    const res = await fetch('/api/demandas')
    if (res.ok) setTasks(await res.json())
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus, overrideReason?: string): Promise<void> {
    const res = await fetch(`/api/demandas/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrideReason ? { status, overrideReason } : { status }),
    })
    if (res.ok) { setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t))); return }
    // Backend recusou: o fluxo exige a ação própria (ou justificativa de admin)
    const body = await res.json().catch(() => ({}))
    if (body.needsOverride && isAdmin) {
      const reason = prompt(`${body.error}\n\nJustificativa (fica registrada no histórico):`)
      if (reason?.trim()) return updateTaskStatus(taskId, status, reason.trim())
      return
    }
    alert(body.error || 'Movimento não permitido pelo fluxo da demanda.')
  }

  async function deleteTask(id: string) {
    await fetch(`/api/demandas/${id}`, { method: 'DELETE' })
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setSelectedId(null)
  }

  const open = useCallback((t: Task) => setSelectedId(t.id), [])
  const close = useCallback(() => setSelectedId(null), [])

  const aside = asideTab === 'equipe' && isAdmin
    ? <TeamPanel tasks={tasks} users={users} selected={filters.assignee} onSelect={(id) => push({ assignee: id })} />
    : <MyQueue tasks={tasks} userId={currentUserId} onOpen={open} />

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 sm:px-6 pt-4 pb-3 space-y-3 shrink-0 border-b border-gray-100">
        <StatTiles summary={summary} isAdmin={isAdmin} active={activeTile} onToggle={toggleTile} />
        <DemandasToolbar
          filters={filters}
          onChange={push}
          users={users}
          clients={clients}
          view={view}
          onView={(v) => push({ view: v })}
          isAdmin={isAdmin}
          onNew={() => setShowNew(true)}
          onImport={() => setShowAiImport(true)}
        />
        <DemandasChips
          filters={filters}
          users={users}
          clients={clients}
          onRemove={(k) => push({ [k]: k === 'late' || k === 'action' ? false : '' } as Partial<DemandasFilters>)}
          onClear={() => push({ q: '', assignee: '', client: '', period: '', tier: '', status: '', late: false, action: false })}
        />
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Painel lateral: fila pessoal (colaborador) ou equipe/fila (admin) */}
        <aside className="hidden lg:flex w-[300px] xl:w-[320px] shrink-0 flex-col border-r border-gray-100 bg-white min-h-0">
          {isAdmin && (
            <div className="flex p-2 gap-1 border-b border-gray-100 shrink-0" role="tablist">
              {([['equipe', 'Equipe', Users], ['fila', 'Minha fila', ListChecks]] as const).map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={asideTab === k}
                  onClick={() => setAsideTab(k)}
                  className={`flex-1 h-8 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 ${asideTab === k ? 'bg-[#030A8C] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0">{aside}</div>
        </aside>

        <main className="flex-1 min-h-0 flex flex-col bg-gray-50/40">
          {view === 'fila' && (
            <>
              <div className="lg:hidden flex-1 min-h-0 bg-white"><MyQueue tasks={tasks} userId={currentUserId} onOpen={open} /></div>
              <div className="hidden lg:flex flex-1 min-h-0 flex-col">
                <BoardView tasks={visible} canDrag onOpen={open} onDrop={updateTaskStatus} forceBacklog={filters.status === 'BACKLOG'} />
              </div>
            </>
          )}
          {view === 'quadro' && <BoardView tasks={visible} canDrag onOpen={open} onDrop={updateTaskStatus} forceBacklog={filters.status === 'BACKLOG'} />}
          {view === 'lista' && <ListView tasks={visible} onOpen={open} />}
          {view === 'calendario' && <CalendarTab tasks={visible} onOpen={open} />}
        </main>
      </div>

      {selectedTask && (
        <TaskDetailModal
          key={selectedTask.id}
          task={selectedTask}
          users={users}
          clients={clients}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={close}
          onApply={applyTask}
          onDelete={deleteTask}
          onStatusChange={updateTaskStatus}
        />
      )}

      {showNew && isAdmin && (
        <NewTaskModal
          clients={clients}
          users={users}
          defaultAssignee={filters.assignee && filters.assignee !== 'none' ? filters.assignee : ''}
          onClose={() => setShowNew(false)}
          onCreated={(t) => { setTasks((prev) => [t, ...prev]); setShowNew(false); setSelectedId(t.id) }}
        />
      )}

      {showAiImport && isAdmin && (
        <AiImportModal clients={clients} users={users} onClose={() => setShowAiImport(false)} onCreated={reloadTasks} />
      )}
    </div>
  )
}
