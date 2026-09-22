'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, Filter, Plus, Search, X } from 'lucide-react'
import {
  FIN_TAB_LABEL, FIN_SORT_LABEL, SITUATION_LABEL,
  type FinFilters, type FinSort, type FinTab, type RowSituation,
} from '@/lib/financeiro-core'

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/* --------------------------------- período --------------------------------- */

export function MonthPicker({
  period, isCurrent, onChange, onToday,
}: {
  period: { year: number; month: number }
  isCurrent: boolean
  onChange: (p: { year: number; month: number }) => void
  onToday: () => void
}) {
  function shift(delta: number) {
    const d = new Date(period.year, period.month - 1 + delta, 1)
    onChange({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return (
    <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white h-9 overflow-hidden">
      <button type="button" onClick={() => shift(-1)} aria-label="Mês anterior" className="w-8 h-full inline-flex items-center justify-center text-gray-500 hover:bg-gray-50">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <label className="relative cursor-pointer h-full">
        <span className="px-3 h-full inline-flex items-center text-xs font-semibold text-gray-900 border-x border-gray-200 min-w-[150px] justify-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
          {MONTHS[period.month - 1]} de {period.year}
        </span>
        <input
          type="month"
          aria-label="Selecionar mês e ano"
          value={`${period.year}-${String(period.month).padStart(2, '0')}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split('-').map(Number)
            if (y && m) onChange({ year: y, month: m })
          }}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>
      <button type="button" onClick={() => shift(1)} aria-label="Próximo mês" className="w-8 h-full inline-flex items-center justify-center text-gray-500 hover:bg-gray-50">
        <ChevronRight className="w-4 h-4" />
      </button>
      {!isCurrent && (
        <button type="button" onClick={onToday} className="h-full px-2.5 text-[11px] font-semibold text-[#030A8C] border-l border-gray-200 hover:bg-gray-50">
          Hoje
        </button>
      )}
    </div>
  )
}

/* ----------------------------------- abas ----------------------------------- */

export function FinanceTabs({ active, counts, onChange }: { active: FinTab; counts: Record<FinTab, number>; onChange: (t: FinTab) => void }) {
  const tabs: FinTab[] = ['visao', 'recebiveis', 'atrasados', 'custos', 'salarios']
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
            {FIN_TAB_LABEL[t]}
            {t !== 'visao' && (
              <span className={`min-w-[22px] h-5 px-1.5 inline-flex items-center justify-center rounded-md text-[11px] font-bold ${
                on ? 'bg-[#030A8C] text-white' : t === 'atrasados' && n > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
              }`}>{n}</span>
            )}
            {on && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-[#030A8C]" />}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ painel de filtros ------------------------------ */

function FiltersButton({
  filters, categories, showKind, onApply,
}: {
  filters: FinFilters
  categories: string[]
  showKind: boolean
  onApply: (f: FinFilters) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(filters)
  const ref = useRef<HTMLDivElement>(null)
  const count = [filters.situation, filters.kind, filters.category].filter(Boolean).length

  useEffect(() => {
    if (!open) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [open])

  const painel = (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-gray-600 mb-1 block">Situação</label>
          <select value={draft.situation} onChange={(e) => setDraft((p) => ({ ...p, situation: e.target.value as '' | RowSituation }))} className="w-full h-9 px-2 text-xs border border-gray-200 rounded-lg bg-white">
            <option value="">Todas</option>
            {(Object.keys(SITUATION_LABEL) as RowSituation[]).map((k) => <option key={k} value={k}>{SITUATION_LABEL[k]}</option>)}
          </select>
        </div>
        {showKind && (
          <div>
            <label className="text-[11px] font-medium text-gray-600 mb-1 block">Tipo</label>
            <select value={draft.kind} onChange={(e) => setDraft((p) => ({ ...p, kind: e.target.value as FinFilters['kind'] }))} className="w-full h-9 px-2 text-xs border border-gray-200 rounded-lg bg-white">
              <option value="">Todos</option>
              <option value="RECORRENTE">Recorrente</option>
              <option value="AVULSO">Avulso / único</option>
            </select>
          </div>
        )}
        {categories.length > 0 && (
          <div>
            <label className="text-[11px] font-medium text-gray-600 mb-1 block">Categoria</label>
            <select value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))} className="w-full h-9 px-2 text-xs border border-gray-200 rounded-lg bg-white">
              <option value="">Todas</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={() => { const limpo = { ...filters, situation: '' as const, kind: '' as const, category: '' }; setDraft(limpo); onApply(limpo); setOpen(false) }} className="text-[11px] font-semibold text-gray-500 hover:text-gray-900">
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

export function FinanceFilterRow({
  filters, onChange, sort, onSort, categories, showKind, addLabel, onAdd, placeholder,
}: {
  filters: FinFilters
  onChange: (next: Partial<FinFilters>) => void
  sort: FinSort
  onSort: (s: FinSort) => void
  categories: string[]
  showKind: boolean
  addLabel?: string
  onAdd?: () => void
  placeholder: string
}) {
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
          placeholder={placeholder}
          className="w-full h-9 pl-9 pr-8 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#030A8C]"
        />
        {draft && (
          <button type="button" onClick={() => setDraft('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>
      <FiltersButton filters={filters} categories={categories} showKind={showKind} onApply={(f) => onChange(f)} />
      {onAdd && addLabel && (
        <button type="button" onClick={onAdd} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors">
          <Plus className="w-3.5 h-3.5" /> {addLabel}
        </button>
      )}
      <label className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600">
        <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
        <span className="sr-only">Ordenar por</span>
        <select value={sort} onChange={(e) => onSort(e.target.value as FinSort)} className="bg-transparent outline-none text-gray-700 font-semibold">
          {(Object.keys(FIN_SORT_LABEL) as FinSort[]).map((k) => <option key={k} value={k}>{FIN_SORT_LABEL[k]}</option>)}
        </select>
      </label>
    </div>
  )
}

/* ---------------------------------- chips ---------------------------------- */

export function FinanceChips({ filters, onRemove, onClear }: { filters: FinFilters; onRemove: (k: keyof FinFilters) => void; onClear: () => void }) {
  const chips: Array<{ key: keyof FinFilters; label: string }> = []
  if (filters.situation) chips.push({ key: 'situation', label: SITUATION_LABEL[filters.situation] })
  if (filters.kind) chips.push({ key: 'kind', label: filters.kind === 'RECORRENTE' ? 'Recorrente' : filters.kind === 'AVULSO' ? 'Avulso / único' : 'Asaas' })
  if (filters.category) chips.push({ key: 'category', label: filters.category })
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

/* -------------------------------- paginação -------------------------------- */

export function Pagination({ page, pages, total, shown, onPage }: { page: number; pages: number; total: number; shown: number; onPage: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between pt-3 text-xs text-gray-500 shrink-0">
      <p>Exibindo {shown} de {total} lançamento{total === 1 ? '' : 's'}</p>
      {pages > 1 && (
        <div className="inline-flex items-center gap-1">
          <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="Página anterior" className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white disabled:opacity-40 hover:border-gray-300"><ChevronLeft className="w-3.5 h-3.5" /></button>
          {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2).map((n, i, arr) => (
            <span key={n} className="inline-flex items-center">
              {i > 0 && arr[i - 1] !== n - 1 && <span className="px-1 text-gray-300">…</span>}
              <button type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} className={`w-7 h-7 rounded-md text-xs font-semibold ${n === page ? 'bg-[#030A8C] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{n}</button>
            </span>
          ))}
          <button type="button" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page === pages} aria-label="Próxima página" className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white disabled:opacity-40 hover:border-gray-300"><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  )
}

/** Selo de situação, mesmo visual da lista de demandas. */
export function SituationBadge({ situation }: { situation: RowSituation }) {
  const cls = situation === 'pago' ? 'bg-green-50 text-green-700'
    : situation === 'atrasado' ? 'bg-red-50 text-red-700'
    : situation === 'cancelado' ? 'bg-gray-100 text-gray-500'
    : 'bg-orange-50 text-orange-700'
  const dot = situation === 'pago' ? 'bg-green-500' : situation === 'atrasado' ? 'bg-red-500' : situation === 'cancelado' ? 'bg-gray-400' : 'bg-orange-500'
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{SITUATION_LABEL[situation]}
    </span>
  )
}
