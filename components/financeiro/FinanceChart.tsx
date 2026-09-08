'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Point {
  year: number
  month: number
  recebidaCents: number
  previstaRecorrenteCents: number
  previstaAvulsaCents: number
  custosCents: number
}

type RangeKey = '6m' | '12m' | 'ano'

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const SERIES = [
  { key: 'previstaRecorrenteCents', label: 'Recorrente', color: '#030A8C' },
  { key: 'previstaAvulsaCents', label: 'Avulso', color: '#7c3aed' },
  { key: 'recebidaCents', label: 'Recebido', color: '#10b981' },
  { key: 'custosCents', label: 'Custos', color: '#ef4444' },
] as const

/**
 * Evolução mensal: receita recorrente prevista, avulsa, recebida e custos.
 * Dados reais de /api/financeiro/evolucao (mesma fonte do resumo do mês);
 * nada é projetado nem simulado.
 */
export default function FinanceChart() {
  const [series, setSeries] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [range, setRange] = useState<RangeKey>('12m')
  const [hidden, setHidden] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    fetch('/api/financeiro/evolucao')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: { series: Point[] }) => { if (alive) { setSeries(b.series ?? []); setLoading(false) } })
      .catch(() => { if (alive) { setError(true); setLoading(false) } })
    return () => { alive = false }
  }, [])

  const currentYear = new Date().getFullYear()
  const points = useMemo(() => (
    range === '6m' ? series.slice(-6)
      : range === '12m' ? series.slice(-12)
        : series.filter((p) => p.year === currentYear)
  ), [series, range, currentYear])

  const visible = SERIES.filter((s) => !hidden.includes(s.key))
  const max = Math.max(1, ...points.flatMap((p) => visible.map((s) => p[s.key])))
  const empty = !loading && !error && points.every((p) => SERIES.every((s) => p[s.key] === 0))

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <p className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#030A8C]" /> Evolução mensal
        </p>
        <div className="flex items-center gap-1" role="group" aria-label="Período do gráfico">
          {([['6m', '6 meses'], ['12m', '12 meses'], ['ano', 'Ano atual']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${range === k ? 'bg-[#030A8C] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="h-44 bg-gray-50 rounded-lg animate-pulse" />
        ) : error ? (
          <p className="text-xs text-red-600 text-center py-10">Não foi possível carregar a evolução.</p>
        ) : empty ? (
          <p className="text-xs text-gray-400 text-center py-10">Sem movimentação registrada no período.</p>
        ) : (
          <>
            <div className="flex items-end gap-2 h-44 overflow-x-auto pb-1">
              {points.map((p) => (
                <div key={`${p.year}-${p.month}`} className="flex flex-col items-center gap-1 flex-1 min-w-[38px] h-full justify-end">
                  <div className="flex items-end gap-[2px] h-full w-full justify-center" title={visible.map((s) => `${s.label}: ${formatCurrency(p[s.key] / 100)}`).join('\n')}>
                    {visible.map((s) => (
                      <div key={s.key} className="w-2 rounded-t transition-all" style={{ height: `${Math.max(2, (p[s.key] / max) * 100)}%`, background: s.color }} />
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{MONTH_SHORT[p.month - 1]}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
              {SERIES.map((s) => {
                const off = hidden.includes(s.key)
                return (
                  <button key={s.key} onClick={() => setHidden((h) => (off ? h.filter((k) => k !== s.key) : [...h, s.key]))}
                    className={`flex items-center gap-1.5 text-[11px] font-medium ${off ? 'text-gray-300' : 'text-gray-600'}`}>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: off ? '#d1d5db' : s.color }} />
                    {s.label}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
