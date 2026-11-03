'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ListChecks, Plus, Users } from 'lucide-react'
import Header from '@/components/layout/Header'
import { Button } from '@/components/vex/button'
import { EstrelaIa } from '@/components/vex/estrela-ia'
import AiImportModal from '@/components/demandas/AiImportModal'
import {
  canSee, filterTasks, isLate, sortTasks, tabCounts, tabFromFilters, filtersForTab, EMPTY_DEMANDAS_FILTERS,
  type ActionKind, type DemandasFilters, type ListTab, type Period, type SortKey, type TaskStatus,
} from '@/lib/demandas-core'
import { DemandasTopBar, DemandasTabs, DemandasFilterRow, DemandasChips } from './DemandasToolbar'
import MyQueue from './MyQueue'
import TeamPanel from './TeamPanel'
import BoardView from './BoardView'
import ListView from './ListView'
import CalendarTab from './CalendarTab'
import NewTaskModal from './NewTaskModal'
import TarefasView from './tarefas/TarefasView'
import BarraDaVisao from './tarefas/BarraDaVisao'
import type { Option, ProcessOption, Task, View } from './types'

const VIEWS: View[] = ['tarefas', 'fila', 'lista', 'quadro', 'calendario']
const PERIODS: Period[] = ['hoje', 'semana', 'mes']
const SORTS: SortKey[] = ['prazo', 'prioridade', 'cliente', 'recentes']

/**
 * Tela de Demandas no padrão do modelo: painel lateral de altura inteira
 * (fila pessoal ou carga da equipe), escopo "minhas / equipe", abas com
 * contadores, filtros e a lista paginada — com quadro e calendário como
 * lentes alternativas do mesmo conjunto. Filtros e visão vivem na URL.
 */
export default function DemandasWorkspace({
  initialTasks, clients, users, processes, myTeamIds = [], currentUserId, isAdmin,
}: {
  initialTasks: Task[]
  clients: Option[]
  processes: ProcessOption[]
  myTeamIds?: string[]
  users: Option[]
  currentUserId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [allTasks, setTasks] = useState<Task[]>(initialTasks)
  // Colaborador não vê o que está com o revisor
  const tasks = useMemo(() => allTasks.filter((t) => canSee(t, currentUserId, isAdmin, myTeamIds)), [allTasks, currentUserId, isAdmin, myTeamIds])
  const [showNew, setShowNew] = useState(false)
  const [showAiImport, setShowAiImport] = useState(false)
  const [asideTab, setAsideTab] = useState<'equipe' | 'fila'>(isAdmin ? 'equipe' : 'fila')

  /* ------------------------- estado que vive na URL ------------------------- */
  const view: View = VIEWS.includes(params.get('visao') as View) ? (params.get('visao') as View) : 'tarefas'
  const sort: SortKey = SORTS.includes(params.get('ordem') as SortKey) ? (params.get('ordem') as SortKey) : 'prazo'
  const filters: DemandasFilters = useMemo(() => {
    const periodo = params.get('periodo') ?? ''
    const escopo = params.get('escopo')
    return {
      q: params.get('q') ?? '',
      assignee: isAdmin ? (params.get('resp') ?? '') : '',
      client: params.get('cliente') ?? '',
      period: PERIODS.includes(periodo as Period) ? (periodo as Period) : '',
      tier: params.get('grupo') ?? '',
      status: params.get('etapa') ?? '',
      late: params.get('atrasadas') === '1',
      // Colaborador começa nas próprias demandas; admin começa na equipe
      // Colaborador só tem as próprias demandas: escopo fixo
      mine: isAdmin ? escopo === 'minhas' : true,
      action: params.get('vez') === '1',
    }
  }, [params, isAdmin])

  const push = useCallback((next: Partial<DemandasFilters> & { view?: View; sort?: SortKey }) => {
    const m = { ...filters, ...next }
    const q = new URLSearchParams()
    const v = next.view ?? view
    if (v !== 'tarefas') q.set('visao', v)
    const s = next.sort ?? sort
    if (s !== 'prazo') q.set('ordem', s)
    if (m.q) q.set('q', m.q)
    if (m.assignee) q.set('resp', m.assignee)
    if (m.client) q.set('cliente', m.client)
    if (m.period) q.set('periodo', m.period)
    if (m.tier) q.set('grupo', m.tier)
    if (m.status) q.set('etapa', m.status)
    if (m.late) q.set('atrasadas', '1')
    if (isAdmin && m.mine) q.set('escopo', 'minhas')
    if (m.action) q.set('vez', '1')
    const qs = q.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [filters, view, sort, isAdmin, router, pathname])

  // Links antigos (?task=id) continuam valendo: vão para a página da demanda
  const deepLinkId = params.get('task')
  useEffect(() => {
    if (deepLinkId) router.replace(`/demandas/${deepLinkId}`)
  }, [deepLinkId, router])

  /* --------------------------------- dados --------------------------------- */
  const tab: ListTab = tabFromFilters(filters)
  // Recorte (minhas/equipe + busca/responsável/cliente/grupo) sem a aba: é
  // sobre ele que as abas contam
  const scoped = useMemo(() => filterTasks(tasks, { ...filters, late: false, period: filters.period === 'hoje' ? '' : filters.period, status: ['EM_REVISAO', 'CONCLUIDO'].includes(filters.status) ? '' : filters.status }, currentUserId), [tasks, filters, currentUserId])
  const counts = useMemo(() => tabCounts(scoped), [scoped])
  const visible = useMemo(() => {
    const f = filterTasks(tasks, filters, currentUserId)
    // Na aba "Todas" a lista mostra só o que está em aberto; concluídas têm aba própria
    return tab === 'todas' && view !== 'quadro' ? f.filter((t) => t.status !== 'CONCLUIDO') : f
  }, [tasks, filters, currentUserId, tab, view])
  const sorted = useMemo(() => sortTasks(visible, sort), [visible, sort])

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

  // Cada demanda abre em página própria
  const open = useCallback((t: Task) => router.push(`/demandas/${t.id}`), [router])

  // "Iniciar" já move para Em andamento e abre o detalhe; as outras ações
  // abrem o detalhe, onde fica o formulário da etapa
  async function rowAction(t: Task, kind: ActionKind) {
    if (kind === 'iniciar' && t.status !== 'EM_ANDAMENTO') await updateTaskStatus(t.id, 'EM_ANDAMENTO')
    router.push(`/demandas/${t.id}`)
  }

  const aside = asideTab === 'equipe' && isAdmin
    ? <TeamPanel tasks={tasks} users={users} selected={filters.assignee} onSelect={(id) => push({ assignee: id, mine: false })} />
    : <MyQueue tasks={tasks} userId={currentUserId} onOpen={open} />

  const modais = (
    <>
      {showNew && isAdmin && (
        <NewTaskModal
          clients={clients}
          users={users}
          processes={processes}
          defaultAssignee={filters.assignee && filters.assignee !== 'none' ? filters.assignee : ''}
          onClose={() => setShowNew(false)}
          onCreated={(t) => { setTasks((prev) => [t, ...prev]); setShowNew(false); reloadTasks() }}
        />
      )}
      {showAiImport && isAdmin && (
        <AiImportModal clients={clients} users={users} onClose={() => setShowAiImport(false)} onCreated={reloadTasks} />
      )}
    </>
  )

  // Cabeçalho da página (modelo Vireo): a frase traz o tamanho da fila e as
  // ações principais ficam à direita do título
  const abertas = tasks.filter((t) => t.status !== 'CONCLUIDO')
  const atrasadas = abertas.filter((t) => isLate(t)).length
  const cabecalho = (
    <Header
      title="Demandas"
      subtitle={`Tarefas por processo, quadro e calendário — ${abertas.length} aberta${abertas.length === 1 ? '' : 's'}${atrasadas ? `, ${atrasadas} atrasada${atrasadas === 1 ? '' : 's'}` : ''}`}
      acoes={isAdmin ? (
        <>
          <Button type="button" variant="outline" onClick={() => setShowAiImport(true)} title="Importar calendário com IA" className="hover:border-ia/40 hover:text-ia">
            <EstrelaIa /> <span className="hidden md:inline">Importar com IA</span>
          </Button>
          <Button type="button" onClick={() => setShowNew(true)}>
            <Plus /> <span className="hidden sm:inline">Nova demanda</span>
          </Button>
        </>
      ) : undefined}
    />
  )

  // Visão padrão: lista de tarefas + resumo lateral, sem painel nem abas
  if (view === 'tarefas') {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {cabecalho}
        <div className="px-4 sm:px-8 pb-4 shrink-0">
          <BarraDaVisao view={view} onView={(v) => push({ view: v })} />
        </div>
        <TarefasView
          tasks={allTasks}
          processes={processes}
          myTeamIds={myTeamIds}
          clients={clients}
          users={users}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onReload={reloadTasks}
        />
        {modais}
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {cabecalho}
      <div className="flex-1 min-h-0 flex gap-4 px-4 sm:px-8 pb-6">
        {/* Painel lateral: fila pessoal (colaborador) ou equipe/fila (admin) */}
        <aside className="hidden lg:flex w-[300px] xl:w-[320px] shrink-0 flex-col rounded-[24px] border border-border bg-card overflow-hidden min-h-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          {isAdmin && (
            <div className="flex m-2 p-1 gap-1 rounded-xl border border-border bg-secondary/60 shrink-0" role="tablist">
              {([['equipe', 'Equipe', Users], ['fila', 'Minha fila', ListChecks]] as const).map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={asideTab === k}
                  onClick={() => setAsideTab(k)}
                  className={`flex-1 h-8 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${asideTab === k ? 'bg-card text-marca-texto shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0">{aside}</div>
        </aside>

        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="pb-3 space-y-3 shrink-0">
            <DemandasTopBar
              mine={filters.mine}
              onScope={(mine) => push({ mine, assignee: mine ? '' : filters.assignee })}
              view={view}
              onView={(v) => push({ view: v })}
              isAdmin={isAdmin}
            />
            <DemandasTabs active={tab} counts={counts} isAdmin={isAdmin} onChange={(t) => push(filtersForTab(filters, t))} />
            <DemandasFilterRow
              filters={filters}
              onChange={push}
              users={users}
              clients={clients}
              isAdmin={isAdmin}
              sort={sort}
              onSort={(s) => push({ sort: s })}
            />
            <DemandasChips
              filters={filters}
              users={users}
              clients={clients}
              onRemove={(k) => push({ [k]: k === 'action' ? false : '' } as Partial<DemandasFilters>)}
              onClear={() => push({ ...EMPTY_DEMANDAS_FILTERS, mine: filters.mine })}
            />
          </div>

          {view === 'fila' && (
            <>
              <div className="lg:hidden flex-1 min-h-0 rounded-[24px] border border-border bg-card overflow-hidden"><MyQueue tasks={tasks} userId={currentUserId} onOpen={open} /></div>
              <div className="hidden lg:flex flex-1 min-h-0 flex-col">
                <ListView tasks={sorted} userId={currentUserId} isAdmin={isAdmin} onOpen={open} onAction={rowAction} onMove={(t, s) => updateTaskStatus(t.id, s)} />
              </div>
            </>
          )}
          {view === 'lista' && <ListView tasks={sorted} userId={currentUserId} isAdmin={isAdmin} onOpen={open} onAction={rowAction} onMove={(t, s) => updateTaskStatus(t.id, s)} />}
          {view === 'quadro' && <BoardView tasks={sorted} canDrag onOpen={open} onDrop={updateTaskStatus} forceBacklog={filters.status === 'BACKLOG'} />}
          {view === 'calendario' && <CalendarTab tasks={sorted} onOpen={open} />}
        </main>
      </div>
      {modais}
    </div>
  )
}
