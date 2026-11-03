'use client'

import { useRef, useState } from 'react'
import { STAGES, compareTasks, isRecentlyDone, type TaskStatus } from '@/lib/demandas-core'
import { cn } from '@/lib/utils'
import TaskCard from './TaskCard'
import { pontoDoStatus } from './visual'
import type { Task } from './types'

/**
 * Quadro por etapa, no padrão Vireo: coluna com nome, contador em pílula e
 * quem age; cards brancos. Backlog só aparece se existir demanda nele (ou se
 * o filtro pedir); Concluído mostra a última semana e esconde o resto.
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
  // Só realce visual da coluna sob o card arrastado
  const [sobre, setSobre] = useState<TaskStatus | null>(null)
  const hasBacklog = forceBacklog || tasks.some((t) => t.status === 'BACKLOG')
  const cols = STAGES.filter((s) => s.key !== 'BACKLOG' || hasBacklog)

  return (
    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden pb-1">
      <div className="flex gap-4 h-full min-w-max">
        {cols.map((col) => {
          const all = tasks.filter((t) => t.status === col.key).sort((a, b) => compareTasks(a, b))
          const doneHidden = col.key === 'CONCLUIDO' && !allDone ? all.filter((t) => !isRecentlyDone(t)).length : 0
          const list = col.key === 'CONCLUIDO' && !allDone ? all.filter((t) => isRecentlyDone(t)) : all
          return (
            <div
              key={col.key}
              className={cn(
                'flex flex-col w-[288px] shrink-0 h-full min-h-0 rounded-[20px] border bg-secondary/40 transition-colors',
                sobre === col.key ? 'border-marca/50 bg-marca-suave/60' : 'border-border',
              )}
              onDragOver={(e) => { if (canDrag) { e.preventDefault(); if (sobre !== col.key) setSobre(col.key) } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(null) }}
              onDragEnd={() => setSobre(null)}
              onDrop={() => { setSobre(null); if (canDrag && dragRef.current) { onDrop(dragRef.current, col.key); dragRef.current = null } }}
            >
              <div className="px-4 pt-4 pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', pontoDoStatus(col.key))} aria-hidden />
                  <span className="text-[13.5px] font-semibold text-foreground">{col.label}</span>
                  <span className="min-w-[22px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-card border border-border text-[11px] font-semibold text-muted-foreground tabular">{all.length}</span>
                </div>
                <p className="t-legenda mt-0.5 pl-4">{col.hint}</p>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2.5">
                {list.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-border py-6 text-center text-[12px] text-muted-foreground">Nenhuma demanda</p>
                )}
                {list.map((t) => (
                  <TaskCard key={t.id} task={t} onOpen={onOpen} onDragStart={canDrag ? (id) => { dragRef.current = id } : undefined} />
                ))}
                {doneHidden > 0 && (
                  <button type="button" onClick={() => setAllDone(true)} className="w-full rounded-2xl border border-dashed border-border py-2.5 text-[12px] font-semibold text-muted-foreground hover:text-marca-texto hover:border-marca/40 transition-colors">
                    Ver mais {doneHidden} concluída{doneHidden === 1 ? '' : 's'}
                  </button>
                )}
                {col.key === 'CONCLUIDO' && allDone && all.length > 0 && (
                  <button type="button" onClick={() => setAllDone(false)} className="w-full rounded-2xl border border-dashed border-border py-2.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
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
