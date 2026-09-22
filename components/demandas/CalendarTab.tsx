'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { STAGE_BY_KEY, isLate, isoDay } from '@/lib/demandas-core'
import type { Task } from './types'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Mês com as demandas na data final. Mesmos filtros do quadro. */
export default function CalendarTab({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const hoje = new Date()
  const hojeISO = isoDay(hoje)
  const [cursor, setCursor] = useState({ y: hoje.getFullYear(), m: hoje.getMonth() })

  const porDia = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.dueDate) continue
      const k = isoDay(t.dueDate)
      map.set(k, [...(map.get(k) ?? []), t])
    }
    return map
  }, [tasks])

  const first = new Date(cursor.y, cursor.m, 1)
  const offset = (first.getDay() + 6) % 7
  const diasNoMes = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: Array<{ iso: string; d: number; cur: boolean }> = []
  const prevDias = new Date(cursor.y, cursor.m, 0).getDate()
  for (let i = offset - 1; i >= 0; i--) cells.push({ iso: iso(cursor.y, cursor.m - 1, prevDias - i), d: prevDias - i, cur: false })
  for (let d = 1; d <= diasNoMes; d++) cells.push({ iso: iso(cursor.y, cursor.m, d), d, cur: true })
  while (cells.length % 7 !== 0) { const d = cells.length - offset - diasNoMes + 1; cells.push({ iso: iso(cursor.y, cursor.m + 1, d), d, cur: false }) }

  const move = (n: number) => setCursor((c) => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const noMes = tasks.filter((t) => t.dueDate && isoDay(t.dueDate).startsWith(`${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`)).length

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-gray-900">{MESES[cursor.m]} {cursor.y}</h3>
          <span className="text-xs text-gray-400">{noMes} demanda{noMes === 1 ? '' : 's'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => move(-1)} aria-label="Mês anterior" className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:border-gray-300"><ChevronLeft className="w-4 h-4 text-gray-500" /></button>
          <button type="button" onClick={() => setCursor({ y: hoje.getFullYear(), m: hoje.getMonth() })} className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:border-gray-300">Hoje</button>
          <button type="button" onClick={() => move(1)} aria-label="Próximo mês" className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:border-gray-300"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-200 rounded-2xl">
        <div className="grid grid-cols-7 border-b border-gray-100 sticky top-0 bg-white z-10">
          {DIAS.map((d) => <div key={d} className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 auto-rows-[minmax(96px,1fr)]">
          {cells.map((c) => {
            const list = porDia.get(c.iso) ?? []
            const isHoje = c.iso === hojeISO
            const fimDeSemana = [5, 6].includes(cells.indexOf(c) % 7)
            return (
              <div key={c.iso} className={`border-b border-r border-gray-100 p-1.5 min-w-0 ${!c.cur ? 'bg-gray-50' : fimDeSemana ? 'bg-gray-50/50' : 'bg-white'}`}>
                <div className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-[11px] font-semibold mb-1 ${isHoje ? 'bg-[#030A8C] text-white' : c.cur ? 'text-gray-700' : 'text-gray-300'}`}>{c.d}</div>
                <div className="space-y-1">
                  {list.slice(0, 4).map((t) => {
                    const s = STAGE_BY_KEY[t.status]
                    const late = isLate(t)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onOpen(t)}
                        title={`${t.title}${t.client ? ` · ${t.client.name}` : ''}`}
                        className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded-md border truncate transition-colors ${
                          late ? 'bg-red-50 border-red-200 text-red-700' : `${s.bg} border-transparent ${s.color}`
                        } hover:border-[#030A8C]`}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${late ? 'bg-red-500' : s.dot}`} />
                        {t.client?.name ? `${t.client.name.split(' /')[0].split(' ')[0]} · ` : ''}{t.title.replace(/^[^·]+· /, '')}
                      </button>
                    )
                  })}
                  {list.length > 4 && <p className="text-[10px] text-gray-400 px-1">+{list.length - 4}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
