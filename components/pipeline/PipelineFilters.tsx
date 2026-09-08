'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Filter, Search, X } from 'lucide-react'
import { STAGES, STAGE_LABEL, type Stage } from '@/lib/pipeline-core'

export interface PipelineFilterState {
  q: string
  owner: string
  source: string
  service: string
  stage: string
  dueUntil: string
  lateOnly: boolean
  noActionOnly: boolean
  noForecastOnly: boolean
}

export const EMPTY_FILTERS: PipelineFilterState = {
  q: '', owner: '', source: '', service: '', stage: '', dueUntil: '',
  lateOnly: false, noActionOnly: false, noForecastOnly: false,
}

/** Quantos filtros do painel estão ativos (busca e responsável ficam fora). */
export function extraFilterCount(f: PipelineFilterState): number {
  return [f.source, f.service, f.stage, f.dueUntil].filter(Boolean).length
    + [f.lateOnly, f.noActionOnly, f.noForecastOnly].filter(Boolean).length
}

/* --------------------------- seletor de responsável --------------------------- */

export function OwnerSelect({
  owners, value, onChange,
}: {
  owners: Array<{ id: string; name: string }>
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [open])

  const selecionado = owners.find((o) => o.id === value)
  const lista = owners.filter((o) => o.name.toLowerCase().includes(busca.trim().toLowerCase()))

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`h-10 px-3 inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors ${
          selecionado ? 'border-[#030A8C] text-[#030A8C] bg-[#030A8C]/5' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'
        }`}
      >
        {selecionado ? selecionado.name.split(' ')[0] : 'Responsável'}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden" role="listbox">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar responsável"
                autoFocus
                className="w-full h-8 pl-8 pr-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#030A8C]"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
            >
              Todos os responsáveis
              {!value && <Check className="w-3.5 h-3.5 text-[#030A8C]" />}
            </button>
            {lista.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false) }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
              >
                <span className="truncate">{o.name}</span>
                {value === o.id && <Check className="w-3.5 h-3.5 text-[#030A8C] shrink-0" />}
              </button>
            ))}
            {lista.length === 0 && <p className="px-3 py-3 text-[11px] text-gray-400">Ninguém com esse nome.</p>}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className="w-full px-3 py-2 text-[11px] font-semibold text-gray-500 border-t border-gray-100 hover:bg-gray-50"
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------ painel de filtros ------------------------------ */

export function FiltersButton({
  filters, sources, services, onApply,
}: {
  filters: PipelineFilterState
  sources: string[]
  services: string[]
  onApply: (next: PipelineFilterState) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(filters)
  const ref = useRef<HTMLDivElement>(null)
  const count = extraFilterCount(filters)

  useEffect(() => {
    if (!open) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [open])

  const set = <K extends keyof PipelineFilterState>(k: K, v: PipelineFilterState[K]) => setDraft((p) => ({ ...p, [k]: v }))

  const painel = (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-gray-600 mb-1 block">Origem</label>
          <select value={draft.source} onChange={(e) => set('source', e.target.value)} className="w-full h-9 px-2 text-xs border border-gray-200 rounded-lg bg-white">
            <option value="">Todas</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 mb-1 block">Serviço</label>
          <select value={draft.service} onChange={(e) => set('service', e.target.value)} className="w-full h-9 px-2 text-xs border border-gray-200 rounded-lg bg-white">
            <option value="">Todos</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 mb-1 block">Etapa</label>
          <select value={draft.stage} onChange={(e) => set('stage', e.target.value)} className="w-full h-9 px-2 text-xs border border-gray-200 rounded-lg bg-white">
            <option value="">Todas</option>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s as Stage]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 mb-1 block">Fechamento previsto até</label>
          <input type="date" value={draft.dueUntil} onChange={(e) => set('dueUntil', e.target.value)} className="w-full h-9 px-2 text-xs border border-gray-200 rounded-lg bg-white" />
        </div>
      </div>

      <div className="space-y-1.5 pt-1 border-t border-gray-100">
        <label className="flex items-center gap-2 text-xs text-gray-700 pt-2">
          <input type="checkbox" checked={draft.lateOnly} onChange={(e) => set('lateOnly', e.target.checked)} />
          Próximas ações atrasadas
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={draft.noActionOnly} onChange={(e) => set('noActionOnly', e.target.checked)} />
          Negociações sem próxima ação
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={draft.noForecastOnly} onChange={(e) => set('noForecastOnly', e.target.checked)} />
          Negociações sem previsão de fechamento
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={() => { const limpo = { ...EMPTY_FILTERS, q: filters.q, owner: filters.owner }; setDraft(limpo); onApply(limpo); setOpen(false) }}
          className="text-[11px] font-semibold text-gray-500 hover:text-gray-900"
        >
          Limpar filtros
        </button>
        <button
          type="button"
          onClick={() => { onApply(draft); setOpen(false) }}
          className="px-4 h-9 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a]"
        >
          Aplicar filtros
        </button>
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
        className={`h-10 px-3 inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors ${
          count > 0 ? 'border-[#030A8C] text-[#030A8C] bg-[#030A8C]/5' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'
        }`}
      >
        <Filter className="w-3.5 h-3.5" />
        Filtros
        {count > 0 && (
          <span className="ml-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-[#030A8C] text-white text-[10px] font-bold">
            {count}
          </span>
        )}
      </button>

      {/* Desktop: popover ancorado. Celular: painel de tela inteira. */}
      {open && (
        <>
          <div className="hidden sm:block absolute right-0 z-40 mt-1 w-[420px] bg-white border border-gray-200 rounded-xl shadow-lg" role="dialog" aria-label="Filtros adicionais">
            {painel}
          </div>
          <div className="sm:hidden fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setOpen(false)}>
            <div className="bg-white w-full rounded-t-2xl max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filtros adicionais">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="font-bold text-gray-900 text-sm">Filtros</p>
                <button onClick={() => setOpen(false)} aria-label="Fechar filtros" className="p-1.5 hover:bg-gray-100 rounded-lg">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              {painel}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------------------------- chips ---------------------------------- */

export function FilterChips({
  filters, ownerName, onRemove, onClear,
}: {
  filters: PipelineFilterState
  ownerName: string | null
  onRemove: (key: keyof PipelineFilterState) => void
  onClear: () => void
}) {
  const chips: Array<{ key: keyof PipelineFilterState; label: string }> = []
  if (filters.owner && ownerName) chips.push({ key: 'owner', label: `Responsável: ${ownerName}` })
  if (filters.source) chips.push({ key: 'source', label: `Origem: ${filters.source}` })
  if (filters.service) chips.push({ key: 'service', label: `Serviço: ${filters.service}` })
  if (filters.stage) chips.push({ key: 'stage', label: `Etapa: ${STAGE_LABEL[filters.stage as Stage] ?? filters.stage}` })
  if (filters.dueUntil) chips.push({ key: 'dueUntil', label: `Fecha até ${filters.dueUntil.split('-').reverse().join('/')}` })
  if (filters.lateOnly) chips.push({ key: 'lateOnly', label: 'Ações atrasadas' })
  if (filters.noActionOnly) chips.push({ key: 'noActionOnly', label: 'Sem próxima ação' })
  if (filters.noForecastOnly) chips.push({ key: 'noForecastOnly', label: 'Sem previsão' })

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-[#030A8C]/5 border border-[#030A8C]/20 text-[11px] font-medium text-[#030A8C]">
          {c.label}
          <button
            type="button"
            onClick={() => onRemove(c.key)}
            aria-label={`Remover filtro ${c.label}`}
            className="p-0.5 rounded-full hover:bg-[#030A8C]/10"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClear} className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 px-1">
        Limpar tudo
      </button>
    </div>
  )
}
