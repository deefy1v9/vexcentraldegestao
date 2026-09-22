'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

/**
 * Seletor com busca para listas que crescem (responsáveis, clientes).
 * Botão compacto; abre lista filtrável; "todos" limpa. Mesmo visual do
 * seletor de responsável do Pipeline.
 */
export default function SearchSelect({
  options, value, onChange, placeholder, allLabel, searchPlaceholder, extra, shortLabel = true,
}: {
  options: Array<{ id: string; name: string }>
  value: string
  onChange: (id: string) => void
  placeholder: string
  allLabel: string
  searchPlaceholder: string
  /** Opções fixas antes da lista (ex.: "Sem responsável"). */
  extra?: Array<{ id: string; name: string }>
  shortLabel?: boolean
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

  const todas = [...(extra ?? []), ...options]
  const selecionado = todas.find((o) => o.id === value)
  const q = busca.trim().toLowerCase()
  const lista = options.filter((o) => o.name.toLowerCase().includes(q))
  const extras = (extra ?? []).filter((o) => o.name.toLowerCase().includes(q))

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors max-w-[180px] ${
          selecionado ? 'border-[#030A8C] text-[#030A8C] bg-[#030A8C]/5' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'
        }`}
      >
        <span className="truncate">{selecionado ? (shortLabel ? selecionado.name.split(' ')[0] : selecionado.name) : placeholder}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden" role="listbox">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={searchPlaceholder}
                autoFocus
                className="w-full h-8 pl-8 pr-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#030A8C]"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button type="button" onClick={() => { onChange(''); setOpen(false) }} className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
              {allLabel}
              {!value && <Check className="w-3.5 h-3.5 text-[#030A8C]" />}
            </button>
            {extras.map((o) => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false) }} className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 italic hover:bg-gray-50">
                <span className="truncate">{o.name}</span>
                {value === o.id && <Check className="w-3.5 h-3.5 text-[#030A8C] shrink-0" />}
              </button>
            ))}
            {lista.map((o) => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false) }} className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                <span className="truncate">{o.name}</span>
                {value === o.id && <Check className="w-3.5 h-3.5 text-[#030A8C] shrink-0" />}
              </button>
            ))}
            {lista.length === 0 && extras.length === 0 && <p className="px-3 py-3 text-[11px] text-gray-400">Nada com esse nome.</p>}
          </div>
          {value && (
            <button type="button" onClick={() => { onChange(''); setOpen(false) }} className="w-full px-3 py-2 text-[11px] font-semibold text-gray-500 border-t border-gray-100 hover:bg-gray-50">
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  )
}
