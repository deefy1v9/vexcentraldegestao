'use client'

import {
  TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle, Wallet, PiggyBank, Repeat,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

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
 * Sete indicadores da competência, todos vindos do resumo do backend
 * (lib/finance-summary) — mesma regra do Dashboard e do perfil do cliente.
 * A comparação é sempre com o mês anterior real; nunca projetada.
 */
export default function FinanceKpis({ s, loading }: { s: MonthSummary | null; loading: boolean }) {
  if (loading || !s) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(7)].map((_, i) => <div key={i} className="h-[104px] bg-white border border-gray-200 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  const p = s.previous
  const cards = [
    {
      key: 'prevista',
      label: 'Receita prevista',
      value: brl(s.previstaCents),
      sub: `${brl(s.previstaRecorrenteCents)} recorrente · ${brl(s.previstaAvulsaCents)} avulso`,
      trend: <Trend current={s.previstaCents} previous={p?.previstaCents} />,
      icon: Users, color: 'text-[#030A8C] bg-blue-50',
    },
    {
      key: 'recebida',
      label: 'Receita recebida',
      value: brl(s.recebidaCents),
      sub: `${s.previstaCents > 0 ? Math.round((s.recebidaCents / s.previstaCents) * 100) : 0}% do previsto`,
      trend: <Trend current={s.recebidaCents} previous={p?.recebidaCents} />,
      icon: TrendingUp, color: 'text-green-600 bg-green-50',
    },
    {
      key: 'pendente',
      label: 'Receita pendente',
      value: brl(s.pendenteCents),
      sub: 'em aberto dentro do prazo',
      trend: <Trend current={s.pendenteCents} previous={p?.pendenteCents} invert />,
      icon: Wallet, color: 'text-orange-600 bg-orange-50',
    },
    {
      key: 'atrasada',
      label: 'Receita atrasada',
      value: brl(s.atrasadaCents),
      sub: s.previstaCents > 0 ? `${((s.atrasadaCents / s.previstaCents) * 100).toFixed(1)}% de inadimplência` : 'sem previsão no mês',
      trend: <Trend current={s.atrasadaCents} previous={p?.atrasadaCents} invert />,
      icon: AlertTriangle, color: 'text-red-600 bg-red-50',
    },
    {
      key: 'custos',
      label: 'Custos totais',
      value: brl(s.custosPrevistosCents),
      sub: `${brl(s.custosPagosCents)} pago · ${brl(Math.max(0, s.custosPrevistosCents - s.custosPagosCents))} pendente`,
      trend: <Trend current={s.custosPrevistosCents} previous={p?.custosPrevistosCents} invert />,
      icon: TrendingDown, color: 'text-red-600 bg-red-50',
    },
    {
      key: 'resultado',
      label: 'Resultado previsto',
      value: brl(s.resultadoPrevistoCents),
      sub: 'receita prevista − custos previstos',
      trend: <Trend current={s.resultadoPrevistoCents} previous={p?.resultadoPrevistoCents} />,
      icon: DollarSign, color: s.resultadoPrevistoCents >= 0 ? 'text-[#030A8C] bg-blue-50' : 'text-red-600 bg-red-50',
      negative: s.resultadoPrevistoCents < 0,
    },
    {
      key: 'lucro',
      label: 'Lucro realizado',
      value: brl(s.lucroRealizadoCents),
      sub: 'recebido − custos pagos',
      trend: <Trend current={s.lucroRealizadoCents} previous={p?.lucroRealizadoCents} />,
      icon: PiggyBank, color: s.lucroRealizadoCents >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50',
      negative: s.lucroRealizadoCents < 0,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.key} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-500">{c.label}</p>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.color}`}>
              <c.icon className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-xl font-bold ${c.negative ? 'text-red-600' : 'text-gray-900'}`}>{c.value}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate" title={c.sub}>{c.sub}</p>
          <div className="mt-1">{c.trend}</div>
        </div>
      ))}

      {/* MRR fecha a grade: recorrente ativo hoje, independente da competência */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500">Receita recorrente (MRR)</p>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[#030A8C] bg-blue-50">
            <Repeat className="w-4 h-4" />
          </div>
        </div>
        <p className="text-xl font-bold text-gray-900">{brl(s.mrrCents)}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{s.activeClients} cliente(s) ativo(s)</p>
        <div className="mt-1"><Trend current={s.mrrCents} previous={p?.mrrCents} /></div>
      </div>
    </div>
  )
}
