'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, CalendarDays, Filter, Kanban, List, ListChecks, Plus, Search, Sparkles, User, Users, X } from 'lucide-react'
import SearchSelect from '@/components/ui/SearchSelect'
import {
  STAGES, LIST_TAB_LABEL, SORT_LABEL, type DemandasFilters, type Period, type ListTab, type SortKey,
} from '@/lib/demandas-core'
import type { Option, View } from './types'

const PERIOD_LABEL: Record<Exclude<Period, ''>, string> = { hoje: 'Hoje', semana: 'Esta semana', mes: 'Este mês' }
const TIER_LABEL: Record<string, string> = { SCALE: 'Scale', GROWTH: 'Growth', START: 'Start' }

/* ------------------------------ linha de cima ------------------------------ */

const VIEWS: Array<{ key: View; label: string; icon: React.ElementType; mobileOnly?: boolean }> = [
  { key: 'fila', label: 'Fila', icon: ListChecks, mobileOnly: true },
  { key: 'lista', label: 'Lista', icon: List },
  { key: 'quadro', label: 'Quadro', icon: Kanban },
  { key: 'calendario', label: 'Calendário', icon: CalendarDays },
]

export function DemandasTopBar({
  mine, onScope, view, onView, isAdmin, onNew, onImport,
}: {
  mine: boolean
  onScope: (mine: boolean) => void
  view: View
  onView: (v: View) => void
  isAdmin: boolean
  onNew: () => void
  onImport: () => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="Escopo">
        {([[true, 'Minhas demandas', User], [false, 'Toda a equipe', Users]] as const).map(([m, label, Icon]) => (
          <button
            key={label}
            type="button"
            onClick={() => onScope(m)}
            aria-pressed={mine === m}
            className={`h-9 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${mine === m ? 'bg-[#030A8C] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="tablist" aria-label="Visualização">
          {VIEWS.map((v) => {
            const Icon = v.icon
            return (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={view === v.key}
                onClick={() => onView(v.key)}
                className={`h-8 px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${v.mobileOnly ? 'lg:hidden' : ''} ${
                  view === v.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{v.label}</span>
              </button>
            )
          })}
        </div>
        {isAdmin && (
          <>
            <button type="button" onClick={onImport} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors" title="Importar calendário com IA">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Importar com IA</span>
            </button>
            <button type="button" onClick={onNew} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-[#030A8C] text-white text-xs font-semibold hover:bg-[#02077a] transition-colors">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nova demanda</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ----------------------------------- abas ----------------------------------- */

export function DemandasTabs({ active, counts, onChange }: { active: ListTab; counts: Record<ListTab, number>; onChange: (t: ListTab) => void }) {
  const tabs: ListTab[] = ['todas', 'atrasadas', 'hoje', 'revisao', 'concluidas']
  return (
    <div className="flex items-center gap-1 border-b border-gray-200 -mx-1 overflow-x-auto" role="tablist">
      {tabs.map((t) => {
        const on = active === t
        const n = counts[t]
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t)}
            className={`relative h-10 px-3 text-sm whitespace-nowrap inline-flex items-center gap-2 transition-colors ${on ? 'text-gray-900 font-bold' : 'text-gray-500 font-medium hover:text-gray-900'}`}
          >
            {LIST_TAB_LABEL[t]}
            {t !== 'concluidas' && (
              <span className={`min-w-[22px] h-5 px-1.5 inline-flex items-center justify-center rounded-md text-[11px] font-bold ${
                on ? 'bg-[#030A8C] text-white' : t === 'atrasadas' && n > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
              }`}>{n}</span>
            )}
            {on && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-[#030A8C]" />}
          </button>
        )
      })}
    </div>
  )
}

/* ----------------------------- painel de filtros ----------------------------- */

function FiltersButton({ filters, onApply, isAdmin }: { filters: DemandasFilters; onApply: (f: DemandasFilters) => void; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(filters)
  const ref = useRef<HTMLDivElement>(null)
  const count = [filters.period && filters.period !== 'hoje', filters.tier, filters.status && !['EM_REVISAO', 'CONCLUIDO'].includes(filters.status)].filter(Boolean).length

  useEffect(() => {
    if (!open) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [open])

  const set = <K extends keyof DemandasFilters>(k: K, v: DemandasFilters[K]) => setDraft((p) => ({ ...p, [k]: v }))

  const painel = (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-gray-600 mb-1 block">Período (prazo da etapa)</label>
          <select value={draft.period} onChange={(e) => set('period', e.target.value as Period)} className="w-full h-9 px-2 text-xs border border-gray-200 rounded-lg bg-white">
            <option value="">Sempre</option>
            <option value="semana">Esta semana</option>
            <option value="mes">Este mês</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 mb-1 block">Etapa</label>
          <select value={draft.status} onChange={(e) => set('status', e.target.value)} className="w-full h-9 px-2 text-xs border border-gray-200 rounded-lg bg-white">
            <option value="">Todas</option>
            {STAGES.filter((s) => (isAdmin || s.key !== 'BACKLOG') && s.key !== 'CONCLUIDO').map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 mb-1 block">Grupo do cliente</label>
          <select value={draft.tier} onChange={(e) => set('tier', e.target.value)} className="w-full h-9 px-2 text-xs border border-gray-200 rounded-lg bg-white">
            <option value="">Todos</option>
            <option value="SCALE">Scale</option>
            <option value="GROWTH">Growth</option>
            <option value="START">Start</option>
          </select>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={() => { const limpo = { ...filters, period: '' as Period, status: '', tier: '' }; setDraft(limpo); onApply(limpo); setOpen(false) }} className="text-[11px] font-semibold text-gray-500 hover:text-gray-900">
          Limpar filtros
        </button>
        <button type="button" onClick={() => { onApply(draft); setOpen(false) }} className="px-4 h-9 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a]">Aplicar</button>
      </div>
    </div>
  )

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setDraft(filters); setOpen((v) => !v) }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors ${
          count > 0 ? 'border-[#030A8C] text-[#030A8C] bg-[#030A8C]/5' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'
        }`}
      >
        <Filter className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Filtros</span>
        {count > 0 && <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-[#030A8C] text-white text-[10px] font-bold">{count}</span>}
      </button>
      {open && (
        <>
          <div className="hidden sm:block absolute left-0 z-40 mt-1 w-[400px] bg-white border border-gray-200 rounded-xl shadow-lg" role="dialog" aria-label="Filtros">{painel}</div>
          <div className="sm:hidden fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setOpen(false)}>
            <div className="bg-white w-full rounded-t-2xl max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filtros">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="font-bold text-gray-900 text-sm">Filtros</p>
                <button onClick={() => setOpen(false)} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              {painel}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------ linha de filtros ------------------------------ */

export function DemandasFilterRow({
  filters, onChange, users, clients, isAdmin, sort, onSort,
}: {
  filters: DemandasFilters
  onChange: (next: Partial<DemandasFilters>) => void
  users: Option[]
  clients: Option[]
  isAdmin: boolean
  sort: SortKey
  onSort: (s: SortKey) => void
}) {
  // Busca digitada acompanha a URL sem efeito: ajuste no próprio render
  const [draft, setDraft] = useState(filters.q)
  const [urlQ, setUrlQ] = useState(filters.q)
  if (urlQ !== filters.q) { setUrlQ(filters.q); setDraft(filters.q) }
  useEffect(() => {
    if (draft === filters.q) return
    const t = setTimeout(() => onChange({ q: draft }), 300)
    return () => clearTimeout(t)
  }, [draft, filters.q, onChange])

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[180px] max-w-sm">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Buscar demanda ou cliente"
          className="w-full h-9 pl-9 pr-8 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#030A8C]"
        />
        {draft && (
          <button type="button" onClick={() => setDraft('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>
      {isAdmin && (
        <SearchSelect
          options={users}
          value={filters.assignee}
          onChange={(id) => onChange({ assignee: id })}
          placeholder="Responsável"
          allLabel="Todos os responsáveis"
          searchPlaceholder="Buscar pessoa"
          extra={[{ id: 'none', name: 'Sem responsável' }]}
        />
      )}
      <SearchSelect
        options={clients}
        value={filters.client}
        onChange={(id) => onChange({ client: id })}
        placeholder="Cliente"
        allLabel="Todos os clientes"
        searchPlaceholder="Buscar cliente"
        shortLabel={false}
      />
      <FiltersButton filters={filters} onApply={(f) => onChange(f)} isAdmin={isAdmin} />

      <label className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600">
        <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
        <span className="sr-only">Ordenar por</span>
        <select value={sort} onChange={(e) => onSort(e.target.value as SortKey)} className="bg-transparent outline-none text-gray-700 font-semibold">
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
        </select>
      </label>
    </div>
  )
}

/* ---------------------------------- chips ---------------------------------- */

export function DemandasChips({
  filters, users, clients, onRemove, onClear,
}: {
  filters: DemandasFilters
  users: Option[]
  clients: Option[]
  onRemove: (key: keyof DemandasFilters) => void
  onClear: () => void
}) {
  const chips: Array<{ key: keyof DemandasFilters; label: string }> = []
  if (filters.assignee === 'none') chips.push({ key: 'assignee', label: 'Sem responsável' })
  else if (filters.assignee) chips.push({ key: 'assignee', label: `Responsável: ${users.find((u) => u.id === filters.assignee)?.name.split(' ')[0] ?? '?'}` })
  if (filters.client) chips.push({ key: 'client', label: `Cliente: ${clients.find((c) => c.id === filters.client)?.name ?? '?'}` })
  if (filters.period && filters.period !== 'hoje') chips.push({ key: 'period', label: PERIOD_LABEL[filters.period] })
  if (filters.status && !['EM_REVISAO', 'CONCLUIDO'].includes(filters.status)) chips.push({ key: 'status', label: `Etapa: ${STAGES.find((s) => s.key === filters.status)?.label ?? filters.status}` })
  if (filters.tier) chips.push({ key: 'tier', label: `Grupo: ${TIER_LABEL[filters.tier] ?? filters.tier}` })
  if (filters.action) chips.push({ key: 'action', label: 'Minha vez' })
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-[#030A8C]/5 border border-[#030A8C]/20 text-[11px] font-medium text-[#030A8C]">
          {c.label}
          <button type="button" onClick={() => onRemove(c.key)} aria-label={`Remover filtro ${c.label}`} className="p-0.5 rounded-full hover:bg-[#030A8C]/10"><X className="w-3 h-3" /></button>
        </span>
      ))}
      <button type="button" onClick={onClear} className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 px-1">Limpar tudo</button>
    </div>
  )
}
