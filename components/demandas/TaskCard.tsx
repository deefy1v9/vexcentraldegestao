'use client'

import { AlertTriangle, Link2, MessageSquare } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { isLate, stageDeadline, daysLeft } from '@/lib/demandas-core'
import type { Task } from './types'

/** Card leve do quadro: título, cliente, quem, quando. O resto fica no popup. */
export default function TaskCard({ task, onOpen, onDragStart }: { task: Task; onOpen: (t: Task) => void; onDragStart?: (id: string) => void }) {
  const late = isLate(task)
  const prazo = stageDeadline(task)
  const left = daysLeft(prazo)
  const urgente = task.priority === 'URGENTE'
  const alta = task.priority === 'ALTA'
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={() => onDragStart?.(task.id)}
      onClick={() => onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task) }}
      className={`bg-white rounded-xl border p-3 cursor-pointer transition-colors ${
        late ? 'border-red-300 hover:border-red-500' : urgente ? 'border-red-200 hover:border-red-400' : 'border-gray-200 hover:border-[#030A8C]'
      }`}
    >
      <p className="text-[13px] font-semibold text-gray-900 leading-snug line-clamp-2">{task.title}</p>
      {task.client && <p className="text-[11px] text-gray-500 truncate mt-0.5">{task.client.name.split(' /')[0]}</p>}

      <div className="flex items-center justify-between gap-2 mt-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.assignee ? (
            <span className="w-5 h-5 rounded-full bg-[#030A8C] text-white text-[9px] font-bold inline-flex items-center justify-center shrink-0" title={task.assignee.name}>
              {task.assignee.name.charAt(0)}
            </span>
          ) : (
            <span className="w-5 h-5 rounded-full border border-dashed border-gray-300 shrink-0" title="Sem responsável" />
          )}
          {late && (
            <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">
              <AlertTriangle className="w-2.5 h-2.5" /> Atrasada
            </span>
          )}
          {!late && urgente && <span className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full font-semibold">Urgente</span>}
          {!late && alta && <span className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">Alta</span>}
          {task.driveLink && <Link2 className="w-3 h-3 text-[#030A8C] shrink-0" />}
          {(task._count?.comments ?? 0) > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400"><MessageSquare className="w-3 h-3" />{task._count.comments}</span>
          )}
        </div>
        {prazo && task.status !== 'CONCLUIDO' && (
          <span className={`text-[11px] shrink-0 ${late || (left != null && left < 0) ? 'text-red-600 font-semibold' : left === 0 ? 'text-[#030A8C] font-semibold' : 'text-gray-400'}`} title={`Prazo desta etapa · final ${task.dueDate ? formatDate(task.dueDate) : '—'}`}>
            {left === 0 ? 'hoje' : formatDate(prazo)}
          </span>
        )}
      </div>
    </div>
  )
}
