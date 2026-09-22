'use client'

import { formatDate } from '@/lib/utils'
import { STAGES, STAGE_BY_KEY, PRIORITY_CONFIG, compareTasks, isLate, stageDeadline, currentActor, daysLeft } from '@/lib/demandas-core'
import type { Task } from './types'

/** Lista densa: uma linha por demanda, ordem de importância, concluídas no fim. */
export default function ListView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const order = Object.fromEntries(STAGES.map((s, i) => [s.key, i]))
  const rows = [...tasks].sort((a, b) => {
    const da = a.status === 'CONCLUIDO' ? 1 : 0, db = b.status === 'CONCLUIDO' ? 1 : 0
    if (da !== db) return da - db
    const c = compareTasks(a, b)
    return c !== 0 ? c : order[a.status] - order[b.status]
  })

  return (
    <div className="flex-1 min-h-0 overflow-auto px-4 sm:px-6 py-4">
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden min-w-[720px]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 sticky top-0">
            <tr>
              <th className="text-left font-semibold px-4 py-2.5">Demanda</th>
              <th className="text-left font-semibold px-3 py-2.5">Etapa</th>
              <th className="text-left font-semibold px-3 py-2.5">Com quem</th>
              <th className="text-left font-semibold px-3 py-2.5">Prazo da etapa</th>
              <th className="text-left font-semibold px-3 py-2.5">Final</th>
              <th className="text-left font-semibold px-3 py-2.5">Prioridade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-400">Nenhuma demanda com esses filtros.</td></tr>
            )}
            {rows.map((t) => {
              const late = isLate(t)
              const stage = STAGE_BY_KEY[t.status]
              const prazo = stageDeadline(t)
              const left = daysLeft(prazo)
              const actor = currentActor(t)
              const pr = PRIORITY_CONFIG[t.priority]
              return (
                <tr key={t.id} onClick={() => onOpen(t)} className={`cursor-pointer hover:bg-gray-50 ${t.status === 'CONCLUIDO' ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-gray-900 text-[13px] leading-snug line-clamp-1">{t.title}</p>
                    <p className="text-[11px] text-gray-500">{t.client?.name?.split(' /')[0] ?? '—'} <span className="text-gray-300">· #{t.number}</span></p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${stage.bg} ${stage.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />{stage.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-700">
                    {actor ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-[#030A8C] text-white text-[9px] font-bold inline-flex items-center justify-center">{actor.name.charAt(0)}</span>
                        {actor.name.split(' ')[0]}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`px-3 py-2.5 text-xs ${late || (left != null && left < 0) ? 'text-red-600 font-semibold' : left === 0 ? 'text-[#030A8C] font-semibold' : 'text-gray-700'}`}>
                    {t.status === 'CONCLUIDO' ? <span className="text-gray-300">—</span> : prazo ? (left === 0 ? 'Hoje' : formatDate(prazo)) : '—'}
                    {late && <span className="block text-[10px] font-normal">{Math.abs(left ?? 0)} dia(s) de atraso</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{t.dueDate ? formatDate(t.dueDate) : '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${pr.bg} ${pr.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${pr.dot}`} />{pr.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
