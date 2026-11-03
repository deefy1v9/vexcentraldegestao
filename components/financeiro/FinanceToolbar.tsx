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
    <div className="inline-flex items-center rounded-xl border border-border bg-card h-10 overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <button type="button" onClick={() => shift(-1)} aria-label="Mês anterior" className="w-9 h-full inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <label className="relative cursor-pointer h-full">
        <span className="px-3 h-full inline-flex items-center text-[13px] font-semibold text-foreground border-x border-border min-w-[170px] justify-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
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
      <button type="button" onClick={() => shift(1)} aria-label="Próximo mês" className="w-9 h-full inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground">
        <ChevronRight className="w-4 h-4" />
      </button>
      {!isCurrent && (
        <button type="button" onClick={onToday} className="h-full px-3 text-[12px] font-semibold text-marca-texto border-l border-border hover:bg-marca-suave">
          Hoje
        </button>
      )}
    </div>
  )
}

/* ----------------------------------- abas ----------------------------------- */

export function FinanceTabs({ active, counts, onChange }: { active: FinTab; counts: Record<FinTab, number>; onChange: (t: FinTab) => void }) {
  const tabs: FinTab[] = ['bpo', 'conciliacao', 'recebiveis', 'atrasados', 'custos', 'salarios', 'caixa']
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-flex items-center gap-1 rounded-2xl border border-border bg-card p-1 shadow-[0_1px_2px_rgba(16,24,40,0.04)]" role="tablist" aria-label="Seções do financeiro">
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
              className={`h-9 px-3.5 rounded-xl text-[13px] whitespace-nowrap inline-flex items-center gap-2 font-semibold transition-colors ${on ? 'bg-marca-suave text-marca-texto' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'}`}
            >
              {FIN_TAB_LABEL[t]}
              {t !== 'bpo' && t !== 'conciliacao' && t !== 'caixa' && (
                <span className={`min-w-[22px] h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                  on ? 'bg-card text-marca-texto' : t === 'atrasados' && n > 0 ? 'bg-destructive-suave text-destructive-texto' : 'bg-secondary text-muted-foreground'
                }`}>{n}</span>
              )}
            </button>
          )
        })}
      </div>
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
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1 block">Situação</label>
          <select value={draft.situation} onChange={(e) => setDraft((p) => ({ ...p, situation: e.target.value as '' | RowSituation }))} className="w-full h-9 px-2 text-xs text-foreground border border-border rounded-lg bg-card outline-none focus:border-marca">
            <option value="">Todas</option>
            {(Object.keys(SITUATION_LABEL) as RowSituation[]).map((k) => <option key={k} value={k}>{SITUATION_LABEL[k]}</option>)}
          </select>
        </div>
        {showKind && (
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1 block">Tipo</label>
            <select value={draft.kind} onChange={(e) => setDraft((p) => ({ ...p, kind: e.target.value as FinFilters['kind'] }))} className="w-full h-9 px-2 text-xs text-foreground border border-border rounded-lg bg-card outline-none focus:border-marca">
              <option value="">Todos</option>
              <option value="RECORRENTE">Recorrente</option>
              <option value="AVULSO">Avulso / único</option>
            </select>
          </div>
        )}
        {categories.length > 0 && (
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1 block">Categoria</label>
            <select value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))} className="w-full h-9 px-2 text-xs text-foreground border border-border rounded-lg bg-card outline-none focus:border-marca">
              <option value="">Todas</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
        <button type="button" onClick={() => { const limpo = { ...filters, situation: '' as const, kind: '' as const, category: '' }; setDraft(limpo); onApply(limpo); setOpen(false) }} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">
          Limpar filtros
        </button>
        <button type="button" onClick={() => { onApply(draft); setOpen(false) }} className="px-4 h-9 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary-hover">Aplicar</button>
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
        className={`h-10 px-3.5 inline-flex items-center gap-1.5 rounded-xl border text-[13px] font-medium transition-colors ${
          count > 0 ? 'border-marca/40 text-marca-texto bg-marca-suave' : 'border-border text-foreground bg-card hover:border-marca/40 hover:text-marca-texto'
        }`}
      >
        <Filter className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Filtros</span>
        {count > 0 && <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-marca text-white text-[10px] font-bold">{count}</span>}
      </button>
      {open && (
        <>
          <div className="hidden sm:block absolute left-0 z-40 mt-1.5 w-[400px] bg-card border border-border rounded-2xl shadow-lg" role="dialog" aria-label="Filtros">{painel}</div>
          <div className="sm:hidden fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setOpen(false)}>
            <div className="bg-card w-full rounded-t-[24px] max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filtros">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="font-display font-semibold text-foreground text-[15px]">Filtros</p>
                <button onClick={() => setOpen(false)} aria-label="Fechar" className="p-1.5 hover:bg-secondary rounded-lg"><X className="w-4 h-4 text-muted-foreground" /></button>
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
        <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="w-full h-10 pl-10 pr-8 text-[13px] text-foreground placeholder:text-muted-foreground border border-border rounded-xl bg-card focus:outline-none focus:border-marca"
        />
        {draft && (
          <button type="button" onClick={() => setDraft('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-secondary">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
      <FiltersButton filters={filters} categories={categories} showKind={showKind} onApply={(f) => onChange(f)} />
      {onAdd && addLabel && (
        <button type="button" onClick={onAdd} className="h-10 px-3.5 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card text-[13px] font-semibold text-foreground hover:border-marca/40 hover:text-marca-texto transition-colors">
          <Plus className="w-3.5 h-3.5" /> {addLabel}
        </button>
      )}
      <label className="ml-auto inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-border bg-card text-[13px] font-medium text-muted-foreground">
        <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="sr-only">Ordenar por</span>
        <select value={sort} onChange={(e) => onSort(e.target.value as FinSort)} className="bg-transparent outline-none text-foreground font-semibold">
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
        <span key={c.key} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-marca-suave border border-marca/20 text-[11.5px] font-semibold text-marca-texto">
          {c.label}
          <button type="button" onClick={() => onRemove(c.key)} aria-label={`Remover filtro ${c.label}`} className="p-0.5 rounded-full hover:bg-marca/10"><X className="w-3 h-3" /></button>
        </span>
      ))}
      <button type="button" onClick={onClear} className="text-[11.5px] font-semibold text-muted-foreground hover:text-foreground px-1">Limpar tudo</button>
    </div>
  )
}

/* -------------------------------- paginação -------------------------------- */

export function Pagination({ page, pages, total, shown, onPage }: { page: number; pages: number; total: number; shown: number; onPage: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-[12.5px] text-muted-foreground shrink-0">
      <p>Exibindo {shown} de {total} lançamento{total === 1 ? '' : 's'}</p>
      {pages > 1 && (
        <div className="inline-flex items-center gap-1">
          <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="Página anterior" className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground disabled:opacity-40 hover:text-foreground"><ChevronLeft className="w-3.5 h-3.5" /></button>
          {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2).map((n, i, arr) => (
            <span key={n} className="inline-flex items-center">
              {i > 0 && arr[i - 1] !== n - 1 && <span className="px-1 text-subtle">…</span>}
              <button type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} className={`w-8 h-8 rounded-lg text-[12.5px] font-semibold ${n === page ? 'bg-marca-suave text-marca-texto' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>{n}</button>
            </span>
          ))}
          <button type="button" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page === pages} aria-label="Próxima página" className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground disabled:opacity-40 hover:text-foreground"><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  )
}

/** Selo de situação, mesmo visual da lista de demandas. */
export function SituationBadge({ situation }: { situation: RowSituation }) {
  const cls = situation === 'pago' ? 'bg-success-suave text-success'
    : situation === 'atrasado' ? 'bg-destructive-suave text-destructive-texto'
    : situation === 'cancelado' ? 'bg-secondary text-muted-foreground'
    : 'bg-warning-suave text-warning'
  const dot = situation === 'pago' ? 'bg-success' : situation === 'atrasado' ? 'bg-destructive' : situation === 'cancelado' ? 'bg-subtle' : 'bg-warning'
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{SITUATION_LABEL[situation]}
    </span>
  )
}
