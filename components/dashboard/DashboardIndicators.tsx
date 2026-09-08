'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2, DollarSign, Kanban, Users, TrendingUp, TrendingDown,
  BarChart3, AlertTriangle, ArrowUpRight, ChevronDown, Repeat, Wallet, PiggyBank,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { PeriodSummary } from '@/lib/finance-summary'

const brl = (cents: number) => formatCurrency(cents / 100)

interface CardDef {
  label: string
  value: string
  sub: string
  icon: React.ElementType
  color: string
  href?: string
  /** Comparação com o período anterior; ausente quando não há base. */
  trend?: { current: number; previous: number | null; invert?: boolean; parcial?: boolean }
  /** Indicador de posição: vale numa data, não soma entre meses. */
  posicao?: boolean
}

function Trend({ current, previous, invert, parcial }: NonNullable<CardDef['trend']>) {
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
      {pct > 0 ? '+' : ''}{pct.toFixed(0)}%{parcial ? ' (parcial)' : ''}
    </span>
  )
}

function Card({ card }: { card: CardDef }) {
  const inner = (
    <>
      <div className="flex items-start justify-between mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: card.color + '22' }}>
          <card.icon className="w-4 h-4" style={{ color: card.color }} />
        </div>
        {card.href && <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />}
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none">{card.value}</p>
      <p className="text-xs text-gray-500 mt-1">
        {card.label}
        {card.posicao && <span className="text-[10px] text-gray-400"> · posição</span>}
      </p>
      <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
      {card.trend && <div className="mt-1"><Trend {...card.trend} /></div>}
    </>
  )
  const cls = 'group bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition-all block'
  return card.href ? <Link href={card.href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>
}

/**
 * Indicadores do período selecionado. Valores de competência (previsto,
 * recebido, custos) somam ao longo do período; MRR, ARR, carteira e
 * segmentação são posição na data de referência e nunca são somados.
 */
export default function DashboardIndicators({
  s, totalClients, inProgressTasks, pendingTasks, totalUsers, financeiroHref,
}: {
  s: PeriodSummary
  totalClients: number
  inProgressTasks: number
  pendingTasks: number
  totalUsers: number
  financeiroHref: string
}) {
  const [expanded, setExpanded] = useState(false)
  const p = s.previous
  const parcial = s.isCurrentPeriod
  const clientesComTicket = s.segments.filter((x) => x.tier).reduce((sum, x) => sum + x.count, 0)
  const ticketMedio = clientesComTicket > 0 ? Math.round(s.mrrCents / clientesComTicket) : 0
  const inadimplencia = s.previstaCents > 0 ? (s.atrasadaCents / s.previstaCents) * 100 : 0

  const primary: CardDef[] = [
    {
      label: 'Clientes ativos', value: String(s.activeClients),
      sub: `${totalClients} no total · ${s.novosClientes} novo(s) no período`,
      icon: Building2, color: '#030A8C', href: '/clientes', posicao: true,
      trend: p ? { current: s.novosClientes, previous: p.novosClientes } : undefined,
    },
    {
      label: 'Receita recorrente (MRR)', value: brl(s.mrrCents),
      sub: 'contratos recorrentes ativos', icon: Repeat, color: '#10b981', href: financeiroHref, posicao: true,
      trend: p ? { current: s.mrrCents, previous: p.mrrCents } : undefined,
    },
    {
      label: 'Receita recebida', value: brl(s.recebidaCents),
      sub: `${s.previstaCents > 0 ? Math.round((s.recebidaCents / s.previstaCents) * 100) : 0}% do previsto`,
      icon: TrendingUp, color: '#6366f1', href: financeiroHref,
      trend: p ? { current: s.recebidaCents, previous: p.recebidaCents, parcial } : undefined,
    },
    {
      label: 'Receita atrasada', value: brl(s.atrasadaCents),
      sub: `${inadimplencia.toFixed(1)}% de inadimplência`, icon: AlertTriangle, color: '#ef4444', href: financeiroHref,
    },
  ]

  const secondary: CardDef[] = [
    {
      label: 'Receita prevista', value: brl(s.previstaCents),
      sub: 'competências do período', icon: BarChart3, color: '#6366f1', href: financeiroHref,
      trend: p ? { current: s.previstaCents, previous: p.previstaCents } : undefined,
    },
    { label: 'Recorrente prevista', value: brl(s.previstaRecorrenteCents), sub: 'contratos em vigência', icon: Repeat, color: '#030A8C' },
    { label: 'Avulsa prevista', value: brl(s.previstaAvulsaCents), sub: 'só nas competências contratadas', icon: DollarSign, color: '#7c3aed' },
    { label: 'Receita pendente', value: brl(s.pendenteCents), sub: 'em aberto dentro do prazo', icon: Wallet, color: '#f59e0b' },
    {
      label: 'Custos e salários', value: brl(s.custosPrevistosCents),
      sub: `${brl(s.custosPagosCents)} pago · ${brl(s.salariosPrevistosCents)} de salários`,
      icon: TrendingDown, color: '#ef4444', href: financeiroHref,
      trend: p ? { current: s.custosPrevistosCents, previous: p.custosPrevistosCents, invert: true } : undefined,
    },
    {
      label: 'Resultado previsto', value: brl(s.resultadoPrevistoCents),
      sub: 'previsto − custos previstos', icon: BarChart3, color: s.resultadoPrevistoCents >= 0 ? '#030A8C' : '#ef4444',
      trend: p ? { current: s.resultadoPrevistoCents, previous: p.resultadoPrevistoCents } : undefined,
    },
    {
      label: 'Resultado realizado', value: brl(s.lucroRealizadoCents),
      sub: 'recebido − custos pagos', icon: PiggyBank, color: s.lucroRealizadoCents >= 0 ? '#10b981' : '#ef4444',
      trend: p ? { current: s.lucroRealizadoCents, previous: p.lucroRealizadoCents, parcial } : undefined,
    },
    { label: 'ARR projetado', value: brl(s.arrCents), sub: 'MRR de referência × 12, não é receita do ano', icon: BarChart3, color: '#030A8C', posicao: true },
    { label: 'Ticket médio', value: brl(ticketMedio), sub: `${clientesComTicket} cliente(s) com recorrência`, icon: DollarSign, color: '#10b981', posicao: true },
    { label: 'Demandas em andamento', value: String(inProgressTasks), sub: `${pendingTasks} a fazer`, icon: Kanban, color: '#f59e0b', href: '/demandas' },
    { label: 'Colaboradores', value: String(totalUsers), sub: 'ativos', icon: Users, color: '#8b5cf6', href: '/colaboradores' },
  ]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {primary.map((c) => <Card key={c.label} card={c} />)}
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        aria-hidden={!expanded}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pb-1">
            {secondary.map((c) => <Card key={c.label} card={c} />)}
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
          {expanded ? 'Ver menos indicadores' : 'Ver mais indicadores'}
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
