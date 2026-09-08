'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2, TrendingUp, TrendingDown, BarChart3, AlertTriangle,
  ChevronDown, Repeat, Wallet, PiggyBank, Kanban, Users, Target,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { PeriodSummary } from '@/lib/finance-summary'

const brl = (cents: number) => formatCurrency(cents / 100)

interface Comparacao { current: number; previous: number | null; invert?: boolean; parcial?: boolean }

/** Variação contra o período anterior; sem base comparável, não mostra nada. */
function Trend({ current, previous, invert, parcial }: Comparacao) {
  if (previous == null || previous === 0) return null
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

interface CardDef {
  label: string
  value: string
  sub: string
  icon: React.ElementType
  color: string
  href: string
  posicao?: boolean
  negativo?: boolean
  trend?: Comparacao
}

function Card({ c }: { c: CardDef }) {
  return (
    <Link href={c.href} className="group bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-all flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-medium text-gray-500 leading-tight">
          {c.label}
          {c.posicao && <span className="block text-[10px] font-normal text-gray-400">posição</span>}
        </p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: c.color + '1f' }}>
          <c.icon className="w-3.5 h-3.5" style={{ color: c.color }} />
        </div>
      </div>
      <p className={`text-xl font-bold leading-tight break-words ${c.negativo ? 'text-red-600' : 'text-gray-900'}`}>{c.value}</p>
      <p className="text-[11px] text-gray-400 mt-1 leading-snug">{c.sub}</p>
      {c.trend && <div className="mt-1">{<Trend {...c.trend} />}</div>}
    </Link>
  )
}

/**
 * Indicadores do período. Competência (prevista, recebida, custos) soma ao
 * longo do período; MRR, ARR, clientes ativos e ticket médio são posição na
 * data de referência e nunca se somam entre meses. Os números comerciais
 * ficam na seção do pipeline, sem repetição aqui.
 */
export default function DashboardIndicators({
  s, inProgressTasks, pendingTasks, lateTasks, totalUsers, financeiroHref,
}: {
  s: PeriodSummary
  inProgressTasks: number
  pendingTasks: number
  lateTasks: number
  totalUsers: number
  financeiroHref: string
}) {
  const [expanded, setExpanded] = useState(false)
  const p = s.previous
  const parcial = s.isCurrentPeriod
  const refFmt = s.referenceDate.split('-').reverse().join('/')
  const custosPendentes = Math.max(0, s.custosPrevistosCents - s.custosPagosCents)
  const ticketMedio = s.clientsWithRecurring > 0 ? Math.round(s.mrrCents / s.clientsWithRecurring) : 0
  const inadimplencia = s.previstaCents > 0 ? (s.atrasadaCents / s.previstaCents) * 100 : 0

  const principais: CardDef[] = [
    {
      label: 'Clientes ativos', value: String(s.activeClients),
      sub: `${s.novosClientes} novo(s) no período`, icon: Building2, color: '#030A8C',
      href: '/clientes', posicao: true,
      trend: p ? { current: s.novosClientes, previous: p.novosClientes } : undefined,
    },
    {
      label: 'Receita recorrente (MRR)', value: brl(s.mrrCents),
      sub: `${s.clientsWithRecurring} cliente(s) com recorrência`, icon: Repeat, color: '#10b981',
      href: financeiroHref, posicao: true,
      trend: p ? { current: s.mrrCents, previous: p.mrrCents } : undefined,
    },
    {
      label: 'Receita recebida', value: brl(s.recebidaCents),
      sub: s.previstaCents > 0 ? `${Math.round((s.recebidaCents / s.previstaCents) * 100)}% do previsto` : 'sem previsão no período',
      icon: TrendingUp, color: '#6366f1', href: financeiroHref,
      trend: p ? { current: s.recebidaCents, previous: p.recebidaCents, parcial } : undefined,
    },
    {
      label: 'Receita atrasada', value: brl(s.atrasadaCents),
      sub: `${inadimplencia.toFixed(1)}% de inadimplência`, icon: AlertTriangle, color: '#ef4444',
      href: financeiroHref,
      trend: p ? { current: s.atrasadaCents, previous: p.atrasadaCents, invert: true } : undefined,
    },
    {
      label: 'Receita prevista', value: brl(s.previstaCents),
      sub: `${brl(s.previstaRecorrenteCents)} recorrente · ${brl(s.previstaAvulsaCents)} avulsa`,
      icon: BarChart3, color: '#6366f1', href: financeiroHref,
      trend: p ? { current: s.previstaCents, previous: p.previstaCents } : undefined,
    },
    {
      label: 'Receita pendente', value: brl(s.pendenteCents),
      sub: 'em aberto dentro do prazo', icon: Wallet, color: '#f59e0b', href: financeiroHref,
    },
    {
      label: 'Custos e salários', value: brl(s.custosPrevistosCents),
      sub: `${brl(s.custosPagosCents)} pago · ${brl(custosPendentes)} pendente · ${brl(s.salariosPrevistosCents)} de salários`,
      icon: TrendingDown, color: '#ef4444', href: financeiroHref,
      trend: p ? { current: s.custosPrevistosCents, previous: p.custosPrevistosCents, invert: true } : undefined,
    },
    {
      label: 'ARR projetado', value: brl(s.arrCents),
      sub: 'MRR de referência × 12, não é receita do ano', icon: BarChart3, color: '#030A8C',
      href: financeiroHref, posicao: true,
    },
  ]

  const compactos = [
    {
      label: 'Ticket médio recorrente', value: brl(ticketMedio),
      sub: `MRR ÷ ${s.clientsWithRecurring} cliente(s)`, icon: Target, href: '/clientes',
    },
    {
      label: 'Demandas em andamento', value: String(inProgressTasks),
      sub: `${pendingTasks} a fazer${lateTasks > 0 ? ` · ${lateTasks} atrasada(s)` : ''}`,
      icon: Kanban, href: '/demandas',
    },
    {
      label: 'Colaboradores ativos', value: String(totalUsers),
      sub: 'na equipe', icon: Users, href: '/colaboradores',
    },
  ]

  const extras = [
    { label: 'Resultado previsto', value: brl(s.resultadoPrevistoCents), sub: 'previsto − custos previstos', negativo: s.resultadoPrevistoCents < 0 },
    { label: 'Resultado realizado', value: brl(s.lucroRealizadoCents), sub: 'recebido − custos pagos', negativo: s.lucroRealizadoCents < 0 },
    { label: 'Salários pagos', value: brl(s.salariosPagosCents), sub: `de ${brl(s.salariosPrevistosCents)} previstos` },
    { label: 'Recebido recorrente', value: brl(s.recebidaRecorrenteCents), sub: `${brl(s.recebidaAvulsaCents)} veio de avulsos` },
  ]

  return (
    <div className="space-y-3">
      {/* Oito principais: duas linhas de quatro no desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {principais.map((c) => <Card key={c.label} c={c} />)}
      </div>

      {/* Carteira e operação, mais compactos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {compactos.map((c) => (
          <Link key={c.label} href={c.href} className="bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 transition-all flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <c.icon className="w-3.5 h-3.5 text-gray-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500 leading-tight">{c.label}</p>
              <p className="text-base font-bold text-gray-900 leading-tight">{c.value}</p>
              <p className="text-[10px] text-gray-400 leading-snug">{c.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      <p className="text-[11px] text-gray-400">
        MRR, ARR, clientes ativos e ticket médio são posição em {refFmt}
        {parcial ? ', com o período ainda em andamento' : ''}. Não se somam entre meses.
      </p>

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
          <span className="text-[11px] font-semibold text-red-700 ml-auto whitespace-nowrap">Ver no financeiro</span>
        </Link>
      )}

      {/* Complementares, recolhidos */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        aria-hidden={!expanded}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pb-1">
            {extras.map((c) => (
              <div key={c.label} className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between mb-1.5">
                  <p className="text-[11px] font-medium text-gray-500">{c.label}</p>
                  <PiggyBank className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                </div>
                <p className={`text-lg font-bold leading-tight ${c.negativo ? 'text-red-600' : 'text-gray-900'}`}>{c.value}</p>
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
