'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { isLate, isoDay } from '@/lib/demandas-core'
import { classeDoStatus, pontoDoStatus } from './visual'
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
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-foreground">{MESES[cursor.m]} {cursor.y}</h3>
          <span className="text-xs text-muted-foreground">{noMes} demanda{noMes === 1 ? '' : 's'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => move(-1)} aria-label="Mês anterior" className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-border bg-card hover:border-subtle"><ChevronLeft className="w-4 h-4 text-muted-foreground" /></button>
          <button type="button" onClick={() => setCursor({ y: hoje.getFullYear(), m: hoje.getMonth() })} className="h-8 px-3 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:border-subtle">Hoje</button>
          <button type="button" onClick={() => move(1)} aria-label="Próximo mês" className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-border bg-card hover:border-subtle"><ChevronRight className="w-4 h-4 text-muted-foreground" /></button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-card border border-border rounded-[24px] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="grid grid-cols-7 border-b border-border sticky top-0 bg-card z-10">
          {DIAS.map((d) => <div key={d} className="px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 auto-rows-[minmax(96px,1fr)]">
          {cells.map((c) => {
            const list = porDia.get(c.iso) ?? []
            const isHoje = c.iso === hojeISO
            const fimDeSemana = [5, 6].includes(cells.indexOf(c) % 7)
            return (
              <div key={c.iso} className={`border-b border-r border-border p-1.5 min-w-0 ${!c.cur ? 'bg-secondary/60' : fimDeSemana ? 'bg-secondary/30' : 'bg-card'}`}>
                <div className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-[11px] font-semibold mb-1 ${isHoje ? 'bg-marca text-white' : c.cur ? 'text-foreground' : 'text-subtle'}`}>{c.d}</div>
                <div className="space-y-1">
                  {list.slice(0, 4).map((t) => {
                    const late = isLate(t)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onOpen(t)}
                        title={`${t.title}${t.client ? ` · ${t.client.name}` : ''}`}
                        className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded-md border truncate transition-colors ${
                          late ? 'bg-destructive-suave border-destructive/30 text-destructive-texto' : `${classeDoStatus(t.status)} border-transparent`
                        } hover:border-marca`}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${late ? 'bg-destructive' : pontoDoStatus(t.status)}`} />
                        {t.client?.name ? `${t.client.name.split(' /')[0].split(' ')[0]} · ` : ''}{t.title.replace(/^[^·]+· /, '')}
                      </button>
                    )
                  })}
                  {list.length > 4 && <p className="text-[10px] text-muted-foreground px-1">+{list.length - 4}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
