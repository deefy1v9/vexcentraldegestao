'use client'

import { CalendarDays, Inbox, Kanban, List, Plus } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { EstrelaIa } from '@/components/vex/estrela-ia'
import type { View } from '../types'

const VISOES: Array<{ key: View; label: string; icon: React.ElementType }> = [
  { key: 'tarefas', label: 'Tarefas', icon: Inbox },
  { key: 'lista', label: 'Lista', icon: List },
  { key: 'quadro', label: 'Quadro', icon: Kanban },
  { key: 'calendario', label: 'Calendário', icon: CalendarDays },
]

/** Faixa de cima da tela de Demandas: visões à esquerda, ações à direita. */
export default function BarraDaVisao({
  view, onView, isAdmin, onNew, onImport,
}: {
  view: View
  onView: (v: View) => void
  isAdmin: boolean
  onNew: () => void
  onImport: () => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex rounded-lg bg-secondary p-0.5" role="tablist" aria-label="Visualização">
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
              className={`h-8 px-3 rounded-md t-rotulo inline-flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                ativo ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          )
        })}
      </div>
      {isAdmin && (
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onImport}>
            <EstrelaIa /> <span className="hidden md:inline">Importar com IA</span>
          </Button>
          <Button type="button" onClick={onNew}>
            <Plus /> <span className="hidden sm:inline">Nova demanda</span>
          </Button>
        </div>
      )}
    </div>
  )
}
