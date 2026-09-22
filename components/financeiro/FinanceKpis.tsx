'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { IconFinanceiro, IconClientes, IconServicos, IconLogs } from '@/components/icons/duotone'

export interface MonthSummary {
  year: number
  month: number
  mrrCents: number
  previstaRecorrenteCents: number
  previstaAvulsaCents: number
  previstaCents: number
  recebidaCents: number
  recebidaRecorrenteCents: number
  recebidaAvulsaCents: number
  pendenteCents: number
  atrasadaCents: number
  custosPrevistosCents: number
  custosPagosCents: number
  salariosPrevistosCents: number
  salariosPagosCents: number
  resultadoPrevistoCents: number
  lucroRealizadoCents: number
  activeClients: number
  segments: Array<{ tier: string | null; count: number; recurringCents: number; share: number }>
  custosPorCategoria: Array<{ category: string; previstoCents: number; pagoCents: number }>
  cobrancasPorStatus: Array<{ status: string; count: number; cents: number }>
  previous: {
    previstaCents: number
    recebidaCents: number
    pendenteCents: number
    atrasadaCents: number
    custosPrevistosCents: number
    custosPagosCents: number
    resultadoPrevistoCents: number
    lucroRealizadoCents: number
    mrrCents: number
  } | null
}

export type TileKey = 'recebido' | 'receber' | 'atrasado' | 'custos'

const brl = (cents: number) => formatCurrency(cents / 100)

/** Variação real contra o mês anterior. Sem base de comparação, não inventa. */
function delta(current: number, previous: number | null | undefined) {
  if (previous == null) return null
  if (previous === 0) return current === 0 ? { pct: 0, up: true } : null
  const pct = ((current - previous) / Math.abs(previous)) * 100
  return { pct, up: pct >= 0 }
}

function Trend({ current, previous, invert = false }: { current: number; previous: number | null | undefined; invert?: boolean }) {
  const d = delta(current, previous)
  if (!d) return <span className="text-[11px] text-gray-400">sem base de comparação</span>
  const good = invert ? !d.up : d.up
  const Icon = d.up ? TrendingUp : TrendingDown
  return (
    <span className={`text-[11px] font-semibold inline-flex items-center gap-1 ${d.pct === 0 ? 'text-gray-400' : good ? 'text-green-600' : 'text-red-600'}`}>
      <Icon className="w-3 h-3" />
      {d.pct > 0 ? '+' : ''}{d.pct.toFixed(0)}% vs mês anterior
    </span>
  )
}

/**
 * Quatro números do mês, clicáveis (cada um filtra a tabela), e os demais
 * indicadores num bloco que abre quando precisa. Tudo vem do resumo do
 * backend (lib/finance-summary) — mesma regra do Dashboard.
 */
export default function FinanceKpis({
  s, loading, active, onToggle,
}: {
  s: MonthSummary | null
  loading: boolean
  active: TileKey | null
  onToggle: (k: TileKey) => void
}) {
  const [aberto, setAberto] = useState(false)

  if (loading || !s) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-[96px] bg-white border border-gray-200 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  const p = s.previous
  const tiles: Array<{ key: TileKey; label: string; value: string; sub: string; trend: React.ReactNode; icon: React.ElementType; tone: string }> = [
    {
      key: 'recebido', label: 'Recebido', value: brl(s.recebidaCents),
      sub: `${s.previstaCents > 0 ? Math.round((s.recebidaCents / s.previstaCents) * 100) : 0}% do previsto`,
      trend: <Trend current={s.recebidaCents} previous={p?.recebidaCents} />,
      icon: IconFinanceiro, tone: 'text-green-600 bg-green-50',
    },
    {
      key: 'receber', label: 'A receber', value: brl(s.pendenteCents),
      sub: 'em aberto dentro do prazo',
      trend: <Trend current={s.pendenteCents} previous={p?.pendenteCents} invert />,
      icon: IconClientes, tone: 'text-orange-600 bg-orange-50',
    },
    {
      key: 'atrasado', label: 'Atrasado', value: brl(s.atrasadaCents),
      sub: s.previstaCents > 0 ? `${((s.atrasadaCents / s.previstaCents) * 100).toFixed(1)}% de inadimplência` : 'sem previsão no mês',
      trend: <Trend current={s.atrasadaCents} previous={p?.atrasadaCents} invert />,
      icon: IconLogs, tone: 'text-red-600 bg-red-50',
    },
    {
      key: 'custos', label: 'Custos e salários', value: brl(s.custosPrevistosCents),
      sub: `${brl(s.custosPagosCents)} pago · ${brl(Math.max(0, s.custosPrevistosCents - s.custosPagosCents))} pendente`,
      trend: <Trend current={s.custosPrevistosCents} previous={p?.custosPrevistosCents} invert />,
      icon: IconServicos, tone: 'text-purple-600 bg-purple-50',
    },
  ]

  const extras = [
    { label: 'Receita prevista', value: brl(s.previstaCents), sub: `${brl(s.previstaRecorrenteCents)} recorrente · ${brl(s.previstaAvulsaCents)} avulso`, trend: <Trend current={s.previstaCents} previous={p?.previstaCents} /> },
    { label: 'Resultado previsto', value: brl(s.resultadoPrevistoCents), sub: 'receita prevista − custos previstos', trend: <Trend current={s.resultadoPrevistoCents} previous={p?.resultadoPrevistoCents} />, negative: s.resultadoPrevistoCents < 0 },
    { label: 'Lucro realizado', value: brl(s.lucroRealizadoCents), sub: 'recebido − custos pagos', trend: <Trend current={s.lucroRealizadoCents} previous={p?.lucroRealizadoCents} />, negative: s.lucroRealizadoCents < 0 },
    { label: 'Receita recorrente (MRR)', value: brl(s.mrrCents), sub: `${s.activeClients} cliente(s) ativo(s)`, trend: <Trend current={s.mrrCents} previous={p?.mrrCents} /> },
  ]

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => {
          const Icon = t.icon
          const on = active === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onToggle(t.key)}
              aria-pressed={on}
              className={`text-left bg-white rounded-xl border p-4 transition-colors ${on ? 'border-[#030A8C] ring-1 ring-[#030A8C]/30' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.label}</p>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.tone}`}><Icon className="w-4 h-4" /></span>
              </div>
              <p className="text-xl font-bold text-gray-900">{t.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate" title={t.sub}>{t.sub}</p>
              <div className="mt-1">{t.trend}</div>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-[#030A8C]"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        {aberto ? 'Ocultar' : 'Ver'} previsto, resultado e MRR
      </button>

      {aberto && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {extras.map((e) => (
            <div key={e.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{e.label}</p>
              <p className={`text-lg font-bold mt-1 ${e.negative ? 'text-red-600' : 'text-gray-900'}`}>{e.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate" title={e.sub}>{e.sub}</p>
              <div className="mt-1">{e.trend}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
