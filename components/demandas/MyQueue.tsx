'use client'

import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { buildQueue, STAGE_BY_KEY, isLate } from '@/lib/demandas-core'
import { textoDoStatus } from './visual'
import type { Task } from './types'

/**
 * Fila pessoal: só o que é a vez do usuário, agrupado por quando o prazo
 * dele vence e na ordem de prioridade do quadro. Primeiro item = próxima
 * coisa a fazer.
 */
export default function MyQueue({ tasks, userId, onOpen, title = 'Minha fila' }: { tasks: Task[]; userId: string; onOpen: (t: Task) => void; title?: string }) {
  const groups = buildQueue(tasks, userId)
  const total = groups.reduce((s, g) => s + g.items.length, 0)
  let ordem = 0

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <span className="text-[11px] font-semibold text-muted-foreground bg-secondary rounded-full px-2 py-0.5">{total}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {total === 0 ? (
          <div className="px-4 py-10 text-center">
            <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">Nada esperando você</p>
            <p className="text-xs text-muted-foreground mt-1">Quando uma demanda chegar na sua etapa, ela aparece aqui.</p>
          </div>
        ) : groups.map((g) => (
          <div key={g.key}>
            <p className={`px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide ${g.key === 'atrasadas' ? 'text-destructive-texto' : g.key === 'hoje' ? 'text-marca-texto' : 'text-muted-foreground'}`}>
              {g.label} · {g.items.length}
            </p>
            <ul>
              {g.items.map((it) => {
                ordem++
                const t = it.task
                const late = isLate(t)
                const stage = STAGE_BY_KEY[t.status]
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(t)}
                      className={`w-full text-left px-4 py-2.5 flex items-start gap-3 hover:bg-secondary/60 transition-colors border-l-2 ${late ? 'border-destructive' : ordem === 1 ? 'border-marca' : 'border-transparent'}`}
                    >
                      <span className={`mt-0.5 w-5 h-5 rounded-full text-[10px] font-bold inline-flex items-center justify-center shrink-0 ${ordem === 1 ? 'bg-marca text-white' : 'bg-secondary text-muted-foreground'}`}>{ordem}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-foreground leading-snug line-clamp-2">{t.title}</span>
                        <span className="block text-[11px] text-muted-foreground truncate mt-0.5">
                          {t.client?.name ? `${t.client.name.split(' /')[0]} · ` : ''}
                          <span className={textoDoStatus(t.status)}>{stage.label}</span>
                          {t.priority === 'URGENTE' && <span className="ml-1.5 text-destructive-texto font-semibold">Urgente</span>}
                        </span>
                        <span className={`block text-[11px] mt-0.5 ${late ? 'text-destructive-texto font-semibold' : 'text-muted-foreground'}`}>
                          {it.deadline ? `${it.role} até ${formatDate(it.deadline)}` : it.role}
                          {it.daysLeft != null && it.daysLeft < 0 && ` · ${Math.abs(it.daysLeft)} dia(s) de atraso`}
                        </span>
                      </span>
                      <span className="shrink-0 mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-marca-texto">
                        {it.cta} <ArrowRight className="w-3 h-3" />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
