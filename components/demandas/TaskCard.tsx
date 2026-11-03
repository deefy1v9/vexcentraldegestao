'use client'

import { AlertTriangle, CalendarDays, Hourglass, Link2, MessageSquare } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { isLate, stageDeadline, daysLeft, shortDate } from '@/lib/demandas-core'
import { TOM } from '@/components/vex/vireo'
import { AvatarPessoa, aguardandoAprovacao } from './visual'
import type { Task } from './types'

const CHIP = 'inline-flex items-center gap-1 h-5 max-w-full rounded-md px-1.5 text-[10.5px] font-semibold leading-none whitespace-nowrap'

/**
 * Card do quadro no padrão Vireo: etiquetas no topo, título, cliente e, no
 * rodapé, prazo da etapa, comentários e o responsável. O resto fica no detalhe.
 */
export default function TaskCard({ task, onOpen, onDragStart }: { task: Task; onOpen: (t: Task) => void; onDragStart?: (id: string) => void }) {
  const late = isLate(task)
  const prazo = stageDeadline(task)
  const left = daysLeft(prazo)
  const atrasouEtapa = late || (left != null && left < 0)
  const urgente = task.priority === 'URGENTE'
  const alta = task.priority === 'ALTA'
  const aguardando = aguardandoAprovacao(task)
  const comentarios = task._count?.comments ?? 0
  const etiquetas = (task.tags ?? []).slice(0, 2)
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={() => onDragStart?.(task.id)}
      onClick={() => onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task) }}
      className={cn(
        'group bg-card rounded-2xl border p-3.5 cursor-pointer transition-[border-color,box-shadow] shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        late ? 'border-destructive/40 hover:border-destructive/70' : 'border-border hover:border-marca/40',
        task.status === 'CONCLUIDO' && 'opacity-75',
      )}
    >
      <div className="flex flex-wrap items-center gap-1">
        {task.process && (
          <span className={cn(CHIP, 'bg-secondary text-muted-foreground')} title={task.process.name}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: task.process.color }} aria-hidden />
            <span className="truncate max-w-[120px]">{task.process.name}</span>
          </span>
        )}
        {urgente && <span className={cn(CHIP, TOM.perigo)}>Urgente</span>}
        {alta && <span className={cn(CHIP, TOM.atencao)}>Alta</span>}
        {aguardando && task.stage?.kind === 'APROVACAO' && <span className={cn(CHIP, TOM.atencao)} title={task.stage.name}><Hourglass className="w-2.5 h-2.5" /> Aprovação</span>}
        {etiquetas.map((tag) => <span key={tag} className={cn(CHIP, TOM.info)}>{tag}</span>)}
      </div>

      <p className="mt-2 text-[13.5px] font-medium text-foreground leading-snug line-clamp-2 group-hover:text-marca-texto">{task.title}</p>
      {task.client && <p className="t-legenda truncate mt-0.5">{task.client.name.split(' /')[0]}</p>}

      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-3 min-w-0 text-[12px] text-muted-foreground">
          {prazo && task.status !== 'CONCLUIDO' && (
            <span
              className={cn('inline-flex items-center gap-1 shrink-0 tabular', atrasouEtapa ? 'text-destructive-texto font-semibold' : left === 0 ? 'text-success font-semibold' : '')}
              title={`${atrasouEtapa ? 'Atrasada · ' : ''}Prazo desta etapa · final ${task.dueDate ? formatDate(task.dueDate) : '—'}`}
            >
              {atrasouEtapa ? <AlertTriangle className="w-3.5 h-3.5" aria-label="Atrasada" /> : <CalendarDays className="w-3.5 h-3.5" />}
              {left === 0 ? 'Hoje' : shortDate(prazo)}
            </span>
          )}
          {comentarios > 0 && (
            <span className="inline-flex items-center gap-1 shrink-0" title={`${comentarios} comentário${comentarios === 1 ? '' : 's'}`}>
              <MessageSquare className="w-3.5 h-3.5" />{comentarios}
            </span>
          )}
          {task.driveLink && <Link2 className="w-3.5 h-3.5 shrink-0" aria-label="Tem link do Drive" />}
        </div>
        <AvatarPessoa nome={task.assignee?.name} tamanho="xs" />
      </div>
    </div>
  )
}
