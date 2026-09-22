'use client'

import { AlertTriangle, CalendarDays, CalendarRange, Eye, Hand } from 'lucide-react'
import type { DemandasSummary } from '@/lib/demandas-core'

export type TileKey = 'late' | 'today' | 'week' | 'action'

/**
 * Quatro números no topo, clicáveis: cada um vira um filtro do quadro.
 * Colaborador vê a própria vez; admin vê a operação inteira.
 */
export default function StatTiles({
  summary, isAdmin, active, onToggle,
}: {
  summary: DemandasSummary
  isAdmin: boolean
  active: TileKey | null
  onToggle: (key: TileKey) => void
}) {
  const tiles: Array<{ key: TileKey; label: string; value: number; hint: string; icon: React.ElementType; tone: 'red' | 'blue' | 'gray' | 'purple' }> = [
    { key: 'late', label: 'Atrasadas', value: summary.late, hint: isAdmin ? 'passaram da data final' : 'na sua vez, fora do prazo', icon: AlertTriangle, tone: summary.late > 0 ? 'red' : 'gray' },
    { key: 'today', label: 'Para hoje', value: summary.today, hint: 'prazo da etapa vence hoje', icon: CalendarDays, tone: 'blue' },
    { key: 'week', label: 'Esta semana', value: summary.week, hint: 'próximos 7 dias', icon: CalendarRange, tone: 'gray' },
    isAdmin
      ? { key: 'action', label: 'Em revisão', value: summary.action, hint: 'esperando aprovação', icon: Eye, tone: 'purple' }
      : { key: 'action', label: 'Minha vez', value: summary.action, hint: 'demandas esperando você', icon: Hand, tone: 'purple' },
  ]
  const TONE = {
    red: 'text-red-600 bg-red-50',
    blue: 'text-[#030A8C] bg-[#030A8C]/5',
    gray: 'text-gray-600 bg-gray-100',
    purple: 'text-purple-700 bg-purple-50',
  }
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {tiles.map((t) => {
        const Icon = t.icon
        const on = active === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onToggle(t.key)}
            aria-pressed={on}
            className={`text-left rounded-xl border px-3.5 py-3 flex items-center gap-3 transition-colors ${
              on ? 'border-[#030A8C] bg-[#030A8C]/5 ring-1 ring-[#030A8C]/30' : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className={`w-9 h-9 rounded-lg inline-flex items-center justify-center shrink-0 ${TONE[t.tone]}`}>
              <Icon className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide truncate">{t.label}</span>
              <span className={`block text-xl font-bold leading-tight ${t.tone === 'red' ? 'text-red-600' : 'text-gray-900'}`}>{t.value}</span>
              <span className="hidden sm:block text-[10px] text-gray-400 truncate">{t.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
