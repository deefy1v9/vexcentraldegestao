'use client'

import { useEffect, useState } from 'react'
import { TrendingDown, DollarSign, Users, CalendarClock } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import TierBadge from '@/components/ui/TierBadge'
import FinanceChart from '@/components/financeiro/FinanceChart'
import { isOverdue, type EntryLike } from '@/lib/financeiro-core'
import type { MonthSummary } from './FinanceKpis'

interface Movement {
  id: string
  kind: 'custo' | 'salario' | 'recebimento'
  label: string
  detail: string
  amount: number
  at: string
}

const ASAAS_STATUS_PT: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Aguardando pagamento', cls: 'bg-orange-100 text-orange-700' },
  CONFIRMED: { label: 'Confirmado', cls: 'bg-blue-100 text-blue-700' },
  RECEIVED: { label: 'Recebido', cls: 'bg-green-100 text-green-700' },
  OVERDUE: { label: 'Vencido', cls: 'bg-red-100 text-red-700' },
  REFUNDED: { label: 'Estornado', cls: 'bg-purple-100 text-purple-700' },
  PARTIALLY_REFUNDED: { label: 'Estorno parcial', cls: 'bg-purple-100 text-purple-700' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-600' },
  DELETED: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-600' },
  ERROR: { label: 'Erro na cobrança', cls: 'bg-red-100 text-red-700' },
}

interface IntegrationsStatus {
  asaas: { env: string; configured: boolean; connected: boolean }
  focus: { env: string; mode: string; configured: boolean; certStatus: string }
  email: { configured: boolean }
}

const Dot = ({ ok }: { ok: boolean }) => (
  <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-500' : 'bg-orange-400'}`} />
)

/**
 * Integrações com status real (sem tokens). Certificado A1 pendente NÃO é
 * falha da Focus: bloqueia apenas a emissão de NFS-e.
 */
function IntegrationsCard() {
  const [st, setSt] = useState<IntegrationsStatus | null>(null)
  useEffect(() => {
    fetch('/api/integracoes/status').then((r) => (r.ok ? r.json() : null)).then(setSt).catch(() => {})
  }, [])
  if (!st) return null
  const linhas = [
    { label: 'Asaas', ok: st.asaas.connected, detail: `${st.asaas.connected ? 'Conectado' : st.asaas.configured ? 'Configurado' : 'Não configurado'} · ${st.asaas.env === 'production' ? 'produção' : 'sandbox'}` },
    { label: 'Focus NFe', ok: st.focus.configured, detail: `${st.focus.configured ? 'Conectado' : 'Não configurado'} · ${st.focus.env}` },
    { label: 'Certificado digital A1', ok: st.focus.certStatus === 'OK', detail: st.focus.certStatus === 'OK' ? 'Cadastrado' : 'Aguardando certificado' },
    { label: 'E-mail transacional', ok: st.email.configured, detail: st.email.configured ? 'Configurado' : 'SMTP pendente' },
  ]
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="font-semibold text-gray-900 text-sm">Integrações</p>
        <a href="/financeiro/integracoes" className="text-[11px] text-[#030A8C] hover:underline font-medium">Gerenciar</a>
      </div>
      <div className="divide-y divide-gray-100 text-sm">
        {linhas.map((l) => (
          <div key={l.label} className="flex items-center justify-between px-4 py-2.5">
            <span className="flex items-center gap-2 text-gray-700"><Dot ok={l.ok} /> {l.label}</span>
            <span className={`text-xs ${l.ok ? 'text-gray-500' : 'text-orange-600 font-medium'}`}>{l.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Visão geral do mês: composição, evolução, categorias e movimentações. */
export default function OverviewTab({
  summary, upcoming, recent,
}: {
  summary: MonthSummary | null
  upcoming: EntryLike[]
  recent: Movement[]
}) {
  const brl = (c: number) => formatCurrency(c / 100)
  const s = summary
  const maxCategoria = Math.max(1, ...(s?.custosPorCategoria ?? []).map((c) => c.previstoCents))

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-4">
      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={`rounded-2xl border p-4 ${s.resultadoPrevistoCents >= 0 ? 'bg-[#030A8C]/[0.04] border-[#030A8C]/30' : 'bg-red-50 border-red-200'}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resultado previsto</p>
            <p className={`text-2xl font-bold mt-1 ${s.resultadoPrevistoCents >= 0 ? 'text-[#030A8C]' : 'text-red-700'}`}>{brl(s.resultadoPrevistoCents)}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{brl(s.previstaCents)} previsto − {brl(s.custosPrevistosCents)} de custos</p>
          </div>
          <div className={`rounded-2xl border p-4 ${s.lucroRealizadoCents >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lucro realizado</p>
            <p className={`text-2xl font-bold mt-1 ${s.lucroRealizadoCents >= 0 ? 'text-green-700' : 'text-red-700'}`}>{brl(s.lucroRealizadoCents)}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{brl(s.recebidaCents)} recebido − {brl(s.custosPagosCents)} pago</p>
          </div>
        </div>
      )}

      <FinanceChart />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <p className="font-semibold text-gray-900 text-sm">Custos por categoria</p>
          </div>
          {!s || s.custosPorCategoria.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-5">Nenhum custo lançado neste mês</p>
          ) : (
            <div className="p-4 space-y-2.5">
              {s.custosPorCategoria.map((c) => (
                <div key={c.category}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-700 font-medium truncate">{c.category}</span>
                    <span className="text-gray-900 font-semibold shrink-0 ml-2">
                      {brl(c.previstoCents)}
                      {c.pagoCents > 0 && c.pagoCents < c.previstoCents && <span className="text-gray-400 font-normal"> · {brl(c.pagoCents)} pago</span>}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${(c.previstoCents / maxCategoria) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <DollarSign className="w-4 h-4 text-[#030A8C]" />
            <p className="font-semibold text-gray-900 text-sm">Cobranças por status</p>
          </div>
          {!s || s.cobrancasPorStatus.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-5">Nenhuma cobrança gerada neste mês</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {s.cobrancasPorStatus.map((c) => {
                const st = ASAAS_STATUS_PT[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-600' }
                return (
                  <div key={c.status} className="flex items-center justify-between px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      <span className="text-[11px] text-gray-400">{c.count} cobrança(s)</span>
                    </span>
                    <span className="text-xs font-bold text-gray-900">{brl(c.cents)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {s && s.segments.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <Users className="w-4 h-4 text-[#030A8C]" />
            <p className="font-semibold text-gray-900 text-sm">Carteira por grupo</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
            {s.segments.map((seg) => (
              <div key={seg.tier ?? 'sem'} className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  {seg.tier ? <TierBadge tier={seg.tier} size="sm" /> : <span className="text-xs font-semibold text-gray-500">Não classificado</span>}
                  <span className="text-[11px] text-gray-400">{seg.count} cliente(s)</span>
                </div>
                <p className="text-base font-bold text-gray-900">{brl(seg.recurringCents)}<span className="text-[11px] text-gray-400 font-normal">/mês</span></p>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${seg.tier === 'SCALE' ? 'bg-[#F74A13]' : seg.tier ? 'bg-[#030A8C]' : 'bg-gray-300'}`} style={{ width: `${Math.min(seg.share, 100)}%` }} />
                  </div>
                  <span className="text-[11px] text-gray-500 font-semibold">{seg.share.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <CalendarClock className="w-4 h-4 text-[#030A8C]" />
            <p className="font-semibold text-gray-900 text-sm">Próximos vencimentos</p>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-5">Nenhum vencimento pendente</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {upcoming.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{e.name || e.description}</p>
                    <p className="text-[11px] text-gray-400">
                      {e.type === 'SALARIO' ? (e.user?.name ?? 'Salário') : e.category}
                      {e.dueDate ? ` · vence ${formatDate(e.dueDate)}` : ''}
                    </p>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ml-2 ${isOverdue(e) ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <DollarSign className="w-4 h-4 text-[#030A8C]" />
              <p className="font-semibold text-gray-900 text-sm">Movimentações recentes</p>
            </div>
            {recent.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-5">Nenhuma movimentação registrada</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {recent.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{m.label}</p>
                      <p className="text-[11px] text-gray-400">
                        {m.kind === 'recebimento' ? 'Recebimento' : m.kind === 'salario' ? 'Salário pago' : 'Custo pago'}
                        {' · '}{m.detail}{m.at ? ` · ${formatDate(m.at)}` : ''}
                      </p>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ml-2 ${m.kind === 'recebimento' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.kind === 'recebimento' ? '+ ' : '- '}{formatCurrency(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <IntegrationsCard />
        </div>
      </div>
    </div>
  )
}
