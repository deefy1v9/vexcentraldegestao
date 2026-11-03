'use client'

import { CalendarDays, Inbox, Kanban, List, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { View } from '../types'

const VISOES: Array<{ key: View; label: string; icon: React.ElementType; soCelular?: boolean }> = [
  { key: 'tarefas', label: 'Tarefas', icon: Inbox },
  { key: 'fila', label: 'Fila', icon: ListChecks, soCelular: true },
  { key: 'lista', label: 'Lista', icon: List },
  { key: 'quadro', label: 'Quadro', icon: Kanban },
  { key: 'calendario', label: 'Calendário', icon: CalendarDays },
]

/**
 * Troca de visão em pílula, como o "Board · List" do modelo. A ação
 * principal (nova demanda, importar com IA) fica no cabeçalho da página.
 */
export default function BarraDaVisao({ view, onView, children }: { view: View; onView: (v: View) => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex rounded-xl border border-border bg-secondary/60 p-1" role="tablist" aria-label="Visualização">
        {VISOES.map((v) => {
          const Icon = v.icon
          const ativo = view === v.key
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => onView(v.key)}
              className={cn(
                'h-8 px-3 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                v.soCelular && 'lg:hidden',
                ativo ? 'bg-card text-marca-texto shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          )
        })}
      </div>
      {children}
    </div>
  )
}
