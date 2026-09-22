'use client'

import { useState } from 'react'
import { Search, Users } from 'lucide-react'
import { teamSummary } from '@/lib/demandas-core'
import type { Option, Task } from './types'

function TeamRow({
  id, name, count, late, today, muted, selected, onSelect,
}: {
  id: string; name: string; count: number; late?: number; today?: number; muted?: boolean
  selected: string; onSelect: (id: string) => void
}) {
  const on = selected === id
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(on ? '' : id)}
        aria-pressed={on}
        className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors border-l-2 ${on ? 'bg-[#030A8C]/5 border-[#030A8C]' : 'border-transparent hover:bg-gray-50'}`}
      >
        <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-[11px] font-bold shrink-0 ${muted ? 'bg-gray-100 text-gray-400' : on ? 'bg-[#030A8C] text-white' : 'bg-[#030A8C]/10 text-[#030A8C]'}`}>
          {id === '' ? <Users className="w-3.5 h-3.5" /> : name.charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-xs font-semibold truncate ${muted ? 'text-gray-500' : 'text-gray-900'}`}>{name}</span>
          <span className="block text-[10px] text-gray-400">
            {count} aberta{count === 1 ? '' : 's'}
            {today ? ` · ${today} hoje` : ''}
          </span>
        </span>
        {!!late && <span className="text-[10px] font-bold text-red-700 bg-red-100 rounded-full px-1.5 py-0.5 shrink-0">{late} atras.</span>}
      </button>
    </li>
  )
}

/**
 * Carga da equipe para o admin: quem tem o quê, ordenado por atrasadas.
 * Clicar numa pessoa filtra o quadro; escala para muita gente com busca.
 */
export default function TeamPanel({ tasks, users, selected, onSelect }: { tasks: Task[]; users: Option[]; selected: string; onSelect: (id: string) => void }) {
  const [q, setQ] = useState('')
  const { rows, unassigned } = teamSummary(tasks, users)
  const open = tasks.filter((t) => t.status !== 'CONCLUIDO').length
  const lista = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar colaborador" className="w-full h-8 pl-8 pr-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#030A8C]" />
        </div>
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto py-1">
        {!q && <TeamRow id="" name="Toda a equipe" count={open} selected={selected} onSelect={onSelect} />}
        {lista.map((r) => <TeamRow key={r.id} id={r.id} name={r.name} count={r.open} late={r.late} today={r.today} selected={selected} onSelect={onSelect} />)}
        {!q && unassigned > 0 && <TeamRow id="none" name="Sem responsável" count={unassigned} muted selected={selected} onSelect={onSelect} />}
        {lista.length === 0 && <p className="px-4 py-4 text-[11px] text-gray-400">Ninguém com esse nome.</p>}
      </ul>
    </div>
  )
}
