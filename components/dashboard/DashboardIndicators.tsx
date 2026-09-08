'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3, AlertTriangle, ChevronDown,
  Repeat, Building2, PiggyBank, Wallet,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { PeriodSummary } from '@/lib/finance-summary'

const brl = (cents: number) => formatCurrency(cents / 100)

/** Variação contra o período anterior; sem base, diz que não há base. */
function Trend({ current, previous, invert, parcial }: { current: number; previous: number | null; invert?: boolean; parcial?: boolean }) {
  if (previous == null || previous === 0) {
    return <span className="text-[11px] text-gray-400">Sem base de comparação</span>
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const up = pct >= 0
  const bom = invert ? !up : up
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`text-[11px] font-semibold inline-flex items-center gap-1 ${pct === 0 ? 'text-gray-400' : bom ? 'text-green-600' : 'text-red-600'}`}>
      <Icon className="w-3 h-3" />
      {pct > 0 ? '+' : ''}{pct.toFixed(0)}%{parcial ? ' parcial' : ''}
    </span>
  )
}

/**
 * Indicadores do período: quatro cards principais, uma linha compacta de
 * posição (MRR e carteira) e o resto atrás de "Mais indicadores".
 * Competência soma ao longo do período; MRR, ARR e clientes ativos são
 * posição numa data e nunca se somam entre meses.
 */
export default function DashboardIndicators({
  s, inProgressTasks, pendingTasks, financeiroHref,
}: {
  s: PeriodSummary
  inProgressTasks: number
  pendingTasks: number
  financeiroHref: string
}) {
  const [expanded, setExpanded] = useState(false)
  const p = s.previous
  const parcial = s.isCurrentPeriod
  const refFmt = s.referenceDate.split('-').reverse().join('/')
  const custosPendentes = Math.max(0, s.custosPrevistosCents - s.custosPagosCents)
  const clientesComTicket = s.segments.filter((x) => x.tier).reduce((sum, x) => sum + x.count, 0)
  const ticketMedio = clientesComTicket > 0 ? Math.round(s.mrrCents / clientesComTicket) : 0
  const inadimplencia = s.previstaCents > 0 ? (s.atrasadaCents / s.previstaCents) * 100 : 0

  const principais = [
    {
      label: 'Receita prevista',
      value: brl(s.previstaCents),
      icon: BarChart3,
      color: '#6366f1',
      detalhe: (
        <span className="text-[11px] text-gray-400">
          {brl(s.previstaRecorrenteCents)} recorrente · {brl(s.previstaAvulsaCents)} avulso
        </span>
      ),
      trend: p ? { current: s.previstaCents, previous: p.previstaCents } : undefined,
    },
    {
      label: 'Receita recebida',
      value: brl(s.recebidaCents),
      icon: TrendingUp,
      color: '#10b981',
      detalhe: (
        <span className="text-[11px] text-gray-400">
          {s.previstaCents > 0 ? `${Math.round((s.recebidaCents / s.previstaCents) * 100)}% do previsto` : 'sem previsão no período'}
        </span>
      ),
      trend: p ? { current: s.recebidaCents, previous: p.recebidaCents, parcial } : undefined,
    },
    {
      label: 'Custos do período',
      value: brl(s.custosPrevistosCents),
      icon: TrendingDown,
      color: '#ef4444',
      detalhe: (
        <span className="text-[11px] text-gray-400">
          {brl(s.custosPagosCents)} pago · {brl(custosPendentes)} pendente
        </span>
      ),
      trend: p ? { current: s.custosPrevistosCents, previous: p.custosPrevistosCents, invert: true } : undefined,
    },
    {
      label: 'Resultado previsto',
      value: brl(s.resultadoPrevistoCents),
      icon: DollarSign,
      color: s.resultadoPrevistoCents >= 0 ? '#030A8C' : '#ef4444',
      negativo: s.resultadoPrevistoCents < 0,
      detalhe: <span className="text-[11px] text-gray-400">previsto − custos previstos</span>,
      trend: p ? { current: s.resultadoPrevistoCents, previous: p.resultadoPrevistoCents } : undefined,
    },
  ]

  const extras = [
    { label: 'Resultado realizado', value: brl(s.lucroRealizadoCents), sub: 'recebido − custos pagos', icon: PiggyBank },
    { label: 'ARR projetado', value: brl(s.arrCents), sub: 'MRR de referência × 12, não é receita do ano', icon: BarChart3 },
    { label: 'Ticket médio', value: brl(ticketMedio), sub: `${clientesComTicket} cliente(s) com recorrência`, icon: DollarSign },
    { label: 'Receita pendente', value: brl(s.pendenteCents), sub: 'em aberto dentro do prazo', icon: Wallet },
    { label: 'Receita atrasada', value: brl(s.atrasadaCents), sub: `${inadimplencia.toFixed(1)}% de inadimplência`, icon: AlertTriangle },
    { label: 'Salários', value: brl(s.salariosPrevistosCents), sub: `${brl(s.salariosPagosCents)} pago`, icon: TrendingDown },
    { label: 'Novos clientes', value: String(s.novosClientes), sub: 'cadastrados no período', icon: Building2 },
    { label: 'Demandas em andamento', value: String(inProgressTasks), sub: `${pendingTasks} a fazer`, icon: BarChart3 },
  ]

  return (
    <div className="space-y-3">
      {/* Quatro cards principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {principais.map((c) => (
          <Link key={c.label} href={financeiroHref} className="group bg-white border border-gray-100 rounded-xl p-4 sm:p-5 hover:border-gray-200 transition-all">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs font-medium text-gray-500">{c.label}</p>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: c.color + '22' }}>
                <c.icon className="w-3.5 h-3.5" style={{ color: c.color }} />
              </div>
            </div>
            <p className={`text-2xl font-bold leading-none ${c.negativo ? 'text-red-600' : 'text-gray-900'}`}>{c.value}</p>
            <div className="mt-1.5">{c.detalhe}</div>
            {c.trend && <div className="mt-1"><Trend {...c.trend} /></div>}
          </Link>
        ))}
      </div>

      {/* Linha compacta de posição */}
      <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2">
          <Repeat className="w-3.5 h-3.5 text-[#030A8C]" />
          <span className="text-xs text-gray-500">MRR</span>
          <span className="text-sm font-bold text-gray-900">{brl(s.mrrCents)}<span className="text-[10px] font-normal text-gray-400">/mês</span></span>
        </span>
        <span className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-[#030A8C]" />
          <span className="text-xs text-gray-500">Clientes ativos</span>
          <Link href="/clientes" className="text-sm font-bold text-gray-900 hover:text-[#030A8C]">{s.activeClients}</Link>
        </span>
        <span className="text-[11px] text-gray-400">
          Posição em {refFmt}{parcial ? ', período em andamento' : ''}
        </span>
        {p && <Trend current={s.mrrCents} previous={p.mrrCents} />}
      </div>

      {/* Alerta de atraso */}
      {s.atrasadaCents > 0 && (
        <Link
          href={financeiroHref}
          className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 hover:border-red-200 transition-colors"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="text-xs text-red-700">
            <span className="font-bold">{brl(s.atrasadaCents)}</span> em cobranças atrasadas neste período.
          </span>
          <span className="text-[11px] font-semibold text-red-700 ml-auto">Ver no financeiro</span>
        </Link>
      )}

      {/* Indicadores secundários, recolhidos por padrão */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        aria-hidden={!expanded}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pb-1">
            {extras.map((c) => (
              <div key={c.label} className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-[11px] font-medium text-gray-500">{c.label}</p>
                  <c.icon className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                </div>
                <p className="text-lg font-bold text-gray-900 leading-none">{c.value}</p>
                <p className="text-[11px] text-gray-400 mt-1">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#030A8C] bg-[#030A8C]/5 hover:bg-[#030A8C]/10 rounded-lg transition-colors"
        >
          {expanded ? 'Menos indicadores' : 'Mais indicadores'}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {p && (
        <p className="text-center text-[11px] text-gray-400">
          Comparações contra {p.label}{parcial ? ', com o período atual ainda em andamento' : ''}.
        </p>
      )}
    </div>
  )
}
