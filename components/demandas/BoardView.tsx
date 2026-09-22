'use client'

import { useRef, useState } from 'react'
import { STAGES, compareTasks, isRecentlyDone, type TaskStatus } from '@/lib/demandas-core'
import TaskCard from './TaskCard'
import type { Task } from './types'

/**
 * Quadro por etapa. Backlog só aparece se existir demanda nele (ou se o
 * filtro pedir); Concluído mostra a última semana e esconde o resto.
 */
export default function BoardView({
  tasks, canDrag, onOpen, onDrop, forceBacklog,
}: {
  tasks: Task[]
  canDrag: boolean
  onOpen: (t: Task) => void
  onDrop: (taskId: string, status: TaskStatus) => void
  forceBacklog: boolean
}) {
  const dragRef = useRef<string | null>(null)
  const [allDone, setAllDone] = useState(false)
  const hasBacklog = forceBacklog || tasks.some((t) => t.status === 'BACKLOG')
  const cols = STAGES.filter((s) => s.key !== 'BACKLOG' || hasBacklog)

  return (
    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-4 sm:px-6 py-4">
      <div className="flex gap-3 h-full min-w-max">
        {cols.map((col) => {
          const all = tasks.filter((t) => t.status === col.key).sort((a, b) => compareTasks(a, b))
          const doneHidden = col.key === 'CONCLUIDO' && !allDone ? all.filter((t) => !isRecentlyDone(t)).length : 0
          const list = col.key === 'CONCLUIDO' && !allDone ? all.filter((t) => isRecentlyDone(t)) : all
          return (
            <div
              key={col.key}
              className="flex flex-col w-[272px] shrink-0 h-full min-h-0 rounded-2xl bg-gray-50/80 border border-gray-100"
              onDragOver={(e) => { if (canDrag) e.preventDefault() }}
              onDrop={() => { if (canDrag && dragRef.current) { onDrop(dragRef.current, col.key); dragRef.current = null } }}
            >
              <div className="px-3 pt-3 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <span className={`text-sm font-bold ${col.color}`}>{col.label}</span>
                  <span className="text-xs text-gray-400 font-medium">{all.length}</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 pl-4">{col.hint}</p>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-2">
                {list.length === 0 && <p className="text-[11px] text-gray-300 text-center py-6">Nenhuma demanda</p>}
                {list.map((t) => (
                  <TaskCard key={t.id} task={t} onOpen={onOpen} onDragStart={canDrag ? (id) => { dragRef.current = id } : undefined} />
                ))}
                {doneHidden > 0 && (
                  <button type="button" onClick={() => setAllDone(true)} className="w-full text-[11px] font-semibold text-gray-500 hover:text-[#030A8C] py-2">
                    Ver mais {doneHidden} concluída{doneHidden === 1 ? '' : 's'}
                  </button>
                )}
                {col.key === 'CONCLUIDO' && allDone && all.length > 0 && (
                  <button type="button" onClick={() => setAllDone(false)} className="w-full text-[11px] font-semibold text-gray-400 hover:text-gray-700 py-2">
                    Mostrar só a última semana
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
