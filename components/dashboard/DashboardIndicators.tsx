'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2, DollarSign, Kanban, Users, TrendingUp, TrendingDown,
  BarChart3, AlertTriangle, ArrowUpRight, ChevronDown,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Indicators {
  activeClients: number
  totalClients: number
  recebidaPrev?: number
  newClientsNow?: number
  newClientsPrev?: number
  mrr: number
  arr: number
  recebida: number
  atrasada: number
  prevista: number
  pendente: number
  ticketMedio: number
  inadimplencia: number
  clientsWithServices: number
  inProgressTasks: number
  pendingTasks: number
  totalUsers: number
}

interface CardDef {
  label: string
  value: string
  sub: string
  icon: React.ElementType
  color: string
  href?: string
}

function Card({ card }: { card: CardDef }) {
  const inner = (
    <>
      <div className="flex items-start justify-between mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: card.color + '22' }}>
          <card.icon className="w-4 h-4" style={{ color: card.color }} />
        </div>
        {card.href && (
          <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none">{card.value}</p>
      <p className="text-xs text-gray-500 mt-1">{card.label}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
    </>
  )

  const cls = 'group bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition-all block'
  return card.href
    ? <Link href={card.href} className={cls}>{inner}</Link>
    : <div className={cls}>{inner}</div>
}

/**
 * Indicadores do dashboard (visão de administrador): quatro cards principais
 * sempre visíveis e os demais atrás de "Ver mais indicadores", expandidos na
 * própria página sem recarregamento.
 */
export default function DashboardIndicators({ d }: { d: Indicators }) {
  const [expanded, setExpanded] = useState(false)

  // Tendências só com dados reais dos dois meses — sem base de comparação,
  // o subtítulo padrão permanece
  const recebidaTrend =
    d.recebidaPrev && d.recebidaPrev > 0
      ? `${d.recebida >= d.recebidaPrev ? '+' : ''}${(((d.recebida - d.recebidaPrev) / d.recebidaPrev) * 100).toFixed(0)}% vs mês anterior`
      : 'mês corrente'
  const clientesTrend =
    d.newClientsNow != null && d.newClientsNow > 0
      ? `+${d.newClientsNow} novo(s) no mês`
      : `${d.totalClients} total`

  const primary: CardDef[] = [
    { label: 'Clientes Ativos', value: String(d.activeClients), sub: clientesTrend, icon: Building2, color: '#030A8C', href: '/clientes' },
    { label: 'Faturamento mensal (MRR)', value: formatCurrency(d.mrr), sub: 'soma dos serviços ativos', icon: DollarSign, color: '#10b981', href: '/financeiro' },
    { label: 'Receita Recebida', value: formatCurrency(d.recebida), sub: recebidaTrend, icon: TrendingUp, color: '#6366f1', href: '/financeiro' },
    { label: 'Receita Atrasada', value: formatCurrency(d.atrasada), sub: 'vencida não paga', icon: AlertTriangle, color: '#ef4444', href: '/financeiro' },
  ]

  const secondary: CardDef[] = [
    { label: 'Demandas em Andamento', value: String(d.inProgressTasks), sub: `${d.pendingTasks} a fazer`, icon: Kanban, color: '#f59e0b', href: '/demandas' },
    { label: 'Colaboradores', value: String(d.totalUsers), sub: 'ativos', icon: Users, color: '#8b5cf6', href: '/colaboradores' },
    { label: 'Receita Prevista', value: formatCurrency(d.prevista), sub: 'mês corrente', icon: BarChart3, color: '#6366f1' },
    { label: 'Receita Pendente', value: formatCurrency(d.pendente), sub: 'dentro do prazo', icon: DollarSign, color: '#f59e0b' },
    { label: 'ARR', value: formatCurrency(d.arr), sub: 'receita recorrente anual', icon: BarChart3, color: '#030A8C' },
    { label: 'Ticket Médio', value: formatCurrency(d.ticketMedio), sub: `${d.clientsWithServices} cliente(s) com serviços`, icon: DollarSign, color: '#10b981' },
    { label: 'Inadimplência', value: `${d.inadimplencia.toFixed(1)}%`, sub: 'atrasado / previsto', icon: TrendingDown, color: d.inadimplencia > 10 ? '#ef4444' : '#6b7280' },
  ]

  return (
    <div className="space-y-3">
      {/* Principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {primary.map((c) => <Card key={c.label} card={c} />)}
      </div>

      {/* Secundários — expansão suave via grid-rows */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
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
    </div>
  )
}
