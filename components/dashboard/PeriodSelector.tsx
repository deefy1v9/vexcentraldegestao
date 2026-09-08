'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/**
 * Seleção do período do Dashboard: mensal ou anual, com navegação e atalho
 * para o período atual. Fica na URL, então recarregar ou compartilhar o
 * endereço mantém o que estava sendo visto.
 */
export default function PeriodSelector({
  view, year, month, isCurrent, referenceDate,
}: {
  view: 'mensal' | 'anual'
  year: number
  month: number | null
  isCurrent: boolean
  referenceDate: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = useCallback((next: { view?: string; year?: number; month?: number | null }) => {
    const q = new URLSearchParams(params.toString())
    q.set('visao', next.view ?? view)
    q.set('ano', String(next.year ?? year))
    if ((next.view ?? view) === 'mensal') q.set('mes', String(next.month ?? month ?? 1))
    else q.delete('mes')
    router.replace(`${pathname}?${q.toString()}`, { scroll: false })
  }, [params, router, pathname, view, year, month])

  function shift(delta: number) {
    if (view === 'anual') { push({ year: year + delta }); return }
    const d = new Date(Date.UTC(year, (month ?? 1) - 1 + delta, 1))
    push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 })
  }

  function agora() {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const [y, m] = hoje.split('-').map(Number)
    push({ year: y, month: view === 'mensal' ? m : null })
  }

  const rotulo = view === 'anual' ? `Ano de ${year}` : `${MESES[(month ?? 1) - 1]} de ${year}`
  const refFmt = referenceDate.split('-').reverse().join('/')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
        {(['mensal', 'anual'] as const).map((v) => (
          <button
            key={v}
            onClick={() => push({ view: v })}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${view === v ? 'bg-white text-[#030A8C] shadow-sm' : 'text-gray-500'}`}
          >
            {v}
          </button>
        ))}
      </div>

      <button onClick={() => shift(-1)} aria-label="Período anterior" className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors">
        <ChevronLeft className="w-4 h-4" />
      </button>

      {view === 'mensal' ? (
        <label className="relative cursor-pointer">
          <span className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-900 inline-block min-w-[170px] text-center">{rotulo}</span>
          <input
            type="month"
            aria-label="Selecionar mês e ano"
            value={`${year}-${String(month ?? 1).padStart(2, '0')}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number)
              if (y && m) push({ year: y, month: m })
            }}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      ) : (
        <select
          value={year}
          onChange={(e) => push({ year: Number(e.target.value) })}
          aria-label="Selecionar ano"
          className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-900 min-w-[170px] text-center"
        >
          {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => (
            <option key={y} value={y}>Ano de {y}</option>
          ))}
        </select>
      )}

      <button onClick={() => shift(1)} aria-label="Próximo período" className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors">
        <ChevronRight className="w-4 h-4" />
      </button>

      {!isCurrent && (
        <button onClick={agora} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors">
          <CalendarDays className="w-3.5 h-3.5" /> {view === 'anual' ? 'Ano atual' : 'Mês atual'}
        </button>
      )}

      <span className="text-[11px] text-gray-400">
        Posição em {refFmt}{isCurrent ? ' (período em andamento)' : ''}
      </span>
    </div>
  )
}
