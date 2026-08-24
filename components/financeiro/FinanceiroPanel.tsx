'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import CurrencyInput from '@/components/ui/CurrencyInput'
import TierBadge from '@/components/ui/TierBadge'
import {
  TrendingUp, TrendingDown, DollarSign, Users, Plus, Check, X,
  ChevronLeft, ChevronRight, Pencil, Trash2, Repeat, CalendarClock,
} from 'lucide-react'

/* ---------------------------------- tipos ---------------------------------- */

interface Entry {
  id: string
  type: string // CUSTO | SALARIO | RECEITA
  category: string
  name?: string | null
  description: string
  amount: number
  dueDate?: string | null
  paidAt?: string | null
  status: string // PENDENTE | PAGO
  recurring: boolean
  recurringCostId?: string | null
  salaryContractId?: string | null
  user?: { id: string; name: string; position?: string | null } | null
}

interface Payment {
  id: string
  month: number
  year: number
  amount: number
  dueDate: string
  paidAt?: string | null
  status: string
  client: { id: string; name: string; tier?: string | null }
}

interface Collaborator {
  id: string
  name: string
  position?: string | null
  salary?: number | null
}

interface Movement {
  id: string
  kind: 'custo' | 'salario' | 'recebimento'
  label: string
  detail: string
  amount: number
  at: string
}

interface NfseRow {
  id: string
  status: string
  numero?: string | null
  pdfUrl?: string | null
  xmlUrl?: string | null
  lastError?: string | null
  municipalMessage?: string | null
}

interface AsaasChargeRow {
  id: string
  clientId: string
  year: number
  month: number
  status: string
  value: string
  netValue?: string | null
  fee?: string | null
  billingType: string
  dueDate: string
  invoiceUrl?: string | null
  bankSlipUrl?: string | null
  identificationField?: string | null
  lastError?: string | null
  asaasId?: string | null
  nfse?: NfseRow | null
  client: { id: string; name: string }
}

interface MonthData {
  entries: Entry[]
  clientPayments: Payment[]
  users: Collaborator[]
  asaasCharges: AsaasChargeRow[]
  previstoServicos: number
  upcoming: Entry[]
  recent: Movement[]
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

const NFSE_STATUS_PT: Record<string, { label: string; cls: string }> = {
  PROCESSANDO: { label: 'Processando NFS-e', cls: 'bg-blue-50 text-[#030A8C]' },
  AUTORIZADO: { label: 'NFS-e autorizada', cls: 'bg-green-100 text-green-700' },
  ERRO_AUTORIZACAO: { label: 'Erro na NFS-e', cls: 'bg-red-100 text-red-700' },
  CANCELADO: { label: 'NFS-e cancelada', cls: 'bg-gray-100 text-gray-600' },
  ERRO_CANCELAMENTO: { label: 'Erro no cancelamento', cls: 'bg-red-100 text-red-700' },
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const COST_CATEGORIES = [
  'Softwares e ferramentas', 'Anúncios', 'Fornecedores', 'Impostos',
  'Aluguel', 'Equipamentos', 'Serviços', 'Administrativo', 'Outros',
]

/* ------------------------------- badges/status ------------------------------ */

function isOverdue(e: { status: string; dueDate?: string | null }) {
  if (e.status !== 'PENDENTE' || !e.dueDate) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return new Date(e.dueDate) < today
}

function StatusBadge({ entry }: { entry: { status: string; dueDate?: string | null } }) {
  if (entry.status === 'PAGO') {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Pago</span>
  }
  if (isOverdue(entry)) {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Atrasado</span>
  }
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Pendente</span>
}

function TypeBadge({ recurring }: { recurring: boolean }) {
  return recurring ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-[#030A8C]">
      <Repeat className="w-2.5 h-2.5" /> Recorrente
    </span>
  ) : (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Único</span>
  )
}

/* --------------------------- diálogo de escopo (2 opções) --------------------------- */

function ScopeDialog({
  title, onlyLabel, futureLabel, onPick, onClose,
}: {
  title: string
  onlyLabel: string
  futureLabel: string
  onPick: (scope: 'only' | 'future') => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-sm p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold text-gray-900 mb-4">{title}</p>
        <div className="space-y-2">
          <button onClick={() => onPick('only')}
            className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors">
            {onlyLabel}
          </button>
          <button onClick={() => onPick('future')}
            className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors">
            {futureLabel}
          </button>
        </div>
        <button onClick={onClose} className="mt-3 w-full py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* --------------------------------- principal --------------------------------- */

export default function FinanceiroPanel() {
  const now = new Date()
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [data, setData] = useState<MonthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'costs' | 'salaries'>('overview')
  const [runningJob, setRunningJob] = useState(false)

  const load = useCallback(async (p: { year: number; month: number }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/financeiro?month=${p.month}&year=${p.year}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError('Não foi possível carregar os dados financeiros.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [period, load])

  function shiftMonth(delta: number) {
    setPeriod((p) => {
      const d = new Date(p.year, p.month - 1 + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() + 1 }
    })
  }

  /* ------------------------------ derivados do mês ------------------------------ */

  const entries = useMemo(() => data?.entries ?? [], [data])
  const payments = useMemo(() => data?.clientPayments ?? [], [data])
  const costEntries = useMemo(() => entries.filter((e) => e.type === 'CUSTO'), [entries])
  const salaryEntries = useMemo(() => entries.filter((e) => e.type === 'SALARIO'), [entries])

  const receitaRecebida = payments.filter((p) => p.status === 'PAGO').reduce((s, p) => s + p.amount, 0)
  const receitaPendente = payments.filter((p) => p.status === 'PENDENTE').reduce((s, p) => s + p.amount, 0)

  const salariosPrevistos = salaryEntries.reduce((s, e) => s + e.amount, 0)
  const salariosPagos = salaryEntries.filter((e) => e.status === 'PAGO').reduce((s, e) => s + e.amount, 0)
  const outrosCustosPrevistos = costEntries.reduce((s, e) => s + e.amount, 0)
  const outrosCustosPagos = costEntries.filter((e) => e.status === 'PAGO').reduce((s, e) => s + e.amount, 0)

  // Custos Totais = Salários + Outros Custos (salário contado uma única vez)
  const custosTotais = salariosPrevistos + outrosCustosPrevistos
  const custosPagos = salariosPagos + outrosCustosPagos
  const custosPendentes = custosTotais - custosPagos

  // Lucro Líquido Realizado = Receitas Recebidas − Custos Pagos
  const lucroRealizado = receitaRecebida - custosPagos
  // Resultado previsto = receita prevista − salários previstos − outros custos previstos
  const previstoServicos = data?.previstoServicos ?? 0
  const resultadoPrevisto = previstoServicos - salariosPrevistos - outrosCustosPrevistos

  /* --------------------------------- ações --------------------------------- */

  async function togglePayments(paymentIds: string[], newStatus: string) {
    const res = await fetch('/api/financeiro/pagamentos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIds, status: newStatus }),
    })
    if (res.ok) load(period)
  }

  async function toggleEntryPaid(entry: Entry) {
    const endpoint = entry.type === 'SALARIO' ? '/api/financeiro/salarios' : '/api/financeiro/custos'
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, status: entry.status === 'PAGO' ? 'PENDENTE' : 'PAGO' }),
    })
    if (res.ok) load(period)
  }

  const tabs = [
    { key: 'overview', label: 'Resumo' },
    { key: 'payments', label: 'Recebimentos' },
    { key: 'costs', label: 'Custos' },
    { key: 'salaries', label: 'Salários' },
  ] as const

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

      {/* Atalhos administrativos */}
      <div className="flex items-center justify-end gap-2 -mb-3">
        <a href="/financeiro/fiscal" className="text-[11px] font-semibold text-gray-500 hover:text-[#030A8C] px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
          Configuração fiscal
        </a>
        <a href="/financeiro/integracoes" className="text-[11px] font-semibold text-gray-500 hover:text-[#030A8C] px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
          Diagnóstico
        </a>
      </div>

      {/* Navegação de mês */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => shiftMonth(-1)} aria-label="Mês anterior"
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <label className="relative cursor-pointer">
          <span className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-900 inline-block min-w-[180px] text-center">
            {MONTHS[period.month - 1]} de {period.year}
          </span>
          <input
            type="month"
            aria-label="Selecionar mês e ano"
            value={`${period.year}-${String(period.month).padStart(2, '0')}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number)
              if (y && m) setPeriod({ year: y, month: m })
            }}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <button onClick={() => shiftMonth(1)} aria-label="Próximo mês"
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block" />

        {/* Gerar cobranças: roda a mesma varredura do agendador (idempotente) */}
        <button
          onClick={async () => {
            if (runningJob) return
            setRunningJob(true)
            try {
              const res = await fetch('/api/asaas/cobrancas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runJob: true }),
              })
              const r = await res.json().catch(() => ({}))
              alert(res.ok
                ? `Cobranças: ${r.created ?? 0} criada(s), ${r.skipped ?? 0} já existente(s)/fora da janela, ${r.errors ?? 0} erro(s).`
                : r.error || 'Falha ao gerar cobranças.')
              if (res.ok) load(period)
            } finally {
              setRunningJob(false)
            }
          }}
          disabled={runningJob}
          className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors disabled:opacity-50"
        >
          {runningJob ? 'Gerando...' : 'Gerar cobranças'}
        </button>

        {/* Exporta o mês carregado em CSV (recebimentos + custos + salários) */}
        <button
          onClick={() => {
            if (!data) return
            const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
            const rows = [
              ['tipo', 'descricao', 'cliente/colaborador', 'valor', 'vencimento', 'status'].join(';'),
              ...payments.map((p) => ['recebimento', `competencia ${String(p.month).padStart(2, '0')}/${p.year}`, p.client.name, p.amount.toFixed(2), p.dueDate?.slice(0, 10) ?? '', p.status].map(esc).join(';')),
              ...entries.map((e) => [e.type.toLowerCase(), e.name || e.description, e.user?.name ?? e.category, e.amount.toFixed(2), e.dueDate?.slice(0, 10) ?? '', e.status].map(esc).join(';')),
            ].join('\n')
            const blob = new Blob([`﻿${rows}`], { type: 'text/csv;charset=utf-8' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `financeiro-${period.year}-${String(period.month).padStart(2, '0')}.csv`
            a.click()
            URL.revokeObjectURL(a.href)
          }}
          className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors"
        >
          Exportar relatório
        </button>
      </div>

      {error && (
        <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-center">
          {error}
        </p>
      )}

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Receita do Mês', value: formatCurrency(receitaRecebida),
            sub: `${formatCurrency(receitaPendente)} pendente`,
            icon: TrendingUp, color: 'text-green-600 bg-green-50',
          },
          {
            label: 'Receita Prevista', value: formatCurrency(previstoServicos),
            sub: 'serviços ativos',
            icon: Users, color: 'text-[#030A8C] bg-blue-50',
          },
          {
            label: 'Custos Totais', value: formatCurrency(custosTotais),
            sub: `${formatCurrency(custosPagos)} pago · ${formatCurrency(custosPendentes)} pendente`,
            icon: TrendingDown, color: 'text-red-600 bg-red-50',
          },
          {
            label: 'Resultado Previsto', value: formatCurrency(resultadoPrevisto),
            sub: 'receita prevista − custos',
            icon: DollarSign,
            color: resultadoPrevisto >= 0 ? 'text-[#030A8C] bg-blue-50' : 'text-red-600 bg-red-50',
          },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500">{card.label}</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon className="w-4 h-4" />
              </div>
            </div>
            {loading ? (
              <div className="h-6 w-24 bg-gray-100 rounded animate-pulse" />
            ) : (
              <p className={`text-xl font-bold ${card.label === 'Resultado Previsto' && resultadoPrevisto < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {card.value}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1 truncate" title={card.sub}>{loading ? '—' : card.sub}</p>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-[#030A8C] border-b-2 border-[#030A8C]'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {loading ? (
            <div className="space-y-3 animate-pulse py-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-50 rounded-lg" />)}
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewTab
                  previstoServicos={previstoServicos}
                  receitaRecebida={receitaRecebida}
                  receitaPendente={receitaPendente}
                  salariosPrevistos={salariosPrevistos}
                  outrosCustos={outrosCustosPrevistos}
                  resultadoPrevisto={resultadoPrevisto}
                  lucroRealizado={lucroRealizado}
                  upcoming={data?.upcoming ?? []}
                  recent={data?.recent ?? []}
                />
              )}
              {activeTab === 'payments' && (
                <PaymentsTab
                  payments={payments}
                  charges={data?.asaasCharges ?? []}
                  period={period}
                  onToggle={togglePayments}
                  onChanged={() => load(period)}
                />
              )}
              {activeTab === 'costs' && (
                <CostsTab entries={costEntries} period={period} onChanged={() => load(period)} onTogglePaid={toggleEntryPaid} />
              )}
              {activeTab === 'salaries' && (
                <SalariesTab
                  entries={salaryEntries}
                  users={data?.users ?? []}
                  period={period}
                  onChanged={() => load(period)}
                  onTogglePaid={toggleEntryPaid}
                />
              )}
            </>
          )}
        </div>
      </div>

    </div>
  )
}

/* ------------------------------- Integrações ------------------------------- */

interface IntegrationsStatus {
  asaas: { env: string; configured: boolean; connected: boolean }
  focus: { env: string; mode: string; configured: boolean; certStatus: string }
  email: { configured: boolean }
}

/**
 * Card de integrações com status real (sem tokens). Certificado A1 pendente
 * NÃO é falha da Focus: aparece como "aguardando certificado" e bloqueia
 * apenas a emissão de NFS-e — Asaas e o resto seguem normais.
 */
function IntegrationsCard() {
  const [st, setSt] = useState<IntegrationsStatus | null>(null)
  useEffect(() => {
    fetch('/api/integracoes/status')
      .then((r) => (r.ok ? r.json() : null))
      .then(setSt)
      .catch(() => {})
  }, [])
  if (!st) return null

  const Dot = ({ ok }: { ok: boolean }) => (
    <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-500' : 'bg-orange-400'}`} />
  )

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="font-semibold text-gray-900 text-sm">Integrações</p>
        <a href="/financeiro/integracoes" className="text-[11px] text-[#030A8C] hover:underline font-medium">
          Gerenciar integrações
        </a>
      </div>
      <div className="divide-y divide-gray-100 text-sm">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="flex items-center gap-2 text-gray-700">
            <Dot ok={st.asaas.connected} /> Asaas
          </span>
          <span className="text-xs text-gray-500">
            {st.asaas.connected ? 'Conectado' : st.asaas.configured ? 'Configurado' : 'Não configurado'} · {st.asaas.env === 'production' ? 'produção' : 'sandbox'}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="flex items-center gap-2 text-gray-700">
            <Dot ok={st.focus.configured} /> Focus NFe
          </span>
          <span className="text-xs text-gray-500">
            {st.focus.configured ? 'Conectado' : 'Não configurado'} · {st.focus.env}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="flex items-center gap-2 text-gray-700">
            <Dot ok={st.focus.certStatus === 'OK'} /> Certificado digital A1
          </span>
          <span className={`text-xs ${st.focus.certStatus === 'OK' ? 'text-gray-500' : 'text-orange-600 font-medium'}`}>
            {st.focus.certStatus === 'OK' ? 'Cadastrado' : 'Aguardando certificado'}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="flex items-center gap-2 text-gray-700">
            <Dot ok={st.email.configured} /> E-mail transacional
          </span>
          <span className="text-xs text-gray-500">
            {st.email.configured ? 'Configurado' : 'SMTP pendente'}
          </span>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------- Resumo --------------------------------- */

function OverviewTab({
  previstoServicos, receitaRecebida, receitaPendente, salariosPrevistos,
  outrosCustos, resultadoPrevisto, lucroRealizado, upcoming, recent,
}: {
  previstoServicos: number
  receitaRecebida: number
  receitaPendente: number
  salariosPrevistos: number
  outrosCustos: number
  resultadoPrevisto: number
  lucroRealizado: number
  upcoming: Entry[]
  recent: Movement[]
}) {
  const rows = [
    { label: 'Receita prevista (serviços ativos)', value: formatCurrency(previstoServicos), cls: 'bg-blue-50 text-[#030A8C]' },
    { label: 'Receita já recebida', value: formatCurrency(receitaRecebida), cls: 'bg-green-50 text-green-700' },
    { label: 'Receita pendente', value: formatCurrency(receitaPendente), cls: 'bg-orange-50 text-orange-700' },
    { label: 'Salários', value: `- ${formatCurrency(salariosPrevistos)}`, cls: 'bg-purple-50 text-purple-700' },
    { label: 'Outros custos', value: `- ${formatCurrency(outrosCustos)}`, cls: 'bg-red-50 text-red-700' },
  ]
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className={`flex items-center justify-between p-3 rounded-lg ${r.cls.split(' ')[0]}`}>
            <span className="text-sm font-medium text-gray-700">{r.label}</span>
            <span className={`text-sm font-bold ${r.cls.split(' ')[1]}`}>{r.value}</span>
          </div>
        ))}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={`flex items-center justify-between p-4 rounded-lg border-2 ${resultadoPrevisto >= 0 ? 'bg-blue-50 border-[#030A8C]/40' : 'bg-red-50 border-red-300'}`}>
            <span className="text-sm font-bold text-gray-900">Resultado previsto</span>
            <span className={`text-base font-bold ${resultadoPrevisto >= 0 ? 'text-[#030A8C]' : 'text-red-700'}`}>
              {formatCurrency(resultadoPrevisto)}
            </span>
          </div>
          <div className={`flex items-center justify-between p-4 rounded-lg border-2 ${lucroRealizado >= 0 ? 'bg-blue-50 border-[#030A8C]' : 'bg-red-50 border-red-400'}`}>
            <span className="text-sm font-bold text-gray-900">Lucro realizado</span>
            <span className={`text-base font-bold ${lucroRealizado >= 0 ? 'text-[#030A8C]' : 'text-red-700'}`}>
              {formatCurrency(lucroRealizado)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Próximos vencimentos */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
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
                  <span className={`text-xs font-bold shrink-0 ml-2 ${isOverdue(e) ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatCurrency(e.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
        {/* Movimentações recentes */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
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

        {/* Integrações — status real, sem tokens */}
        <IntegrationsCard />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------- Recebimentos ------------------------------- */

function PaymentsTab({
  payments, charges, period, onToggle, onChanged,
}: {
  payments: Payment[]
  charges: AsaasChargeRow[]
  period: { year: number; month: number }
  onToggle: (ids: string[], status: string) => void
  onChanged: () => void
}) {
  const [busyCharge, setBusyCharge] = useState<string | null>(null)
  const [chargeMsg, setChargeMsg] = useState<string | null>(null)

  // Uma linha por cliente: soma todas as parcelas/serviços do mês.
  const groups = useMemo(() => {
    const map = new Map<string, { client: Payment['client']; items: Payment[] }>()
    for (const p of payments) {
      const g = map.get(p.client.id)
      if (g) g.items.push(p)
      else map.set(p.client.id, { client: p.client, items: [p] })
    }
    // Clientes que só têm cobrança Asaas (sem parcela local) também aparecem
    for (const c of charges) {
      if (!map.has(c.clientId)) map.set(c.clientId, { client: { id: c.clientId, name: c.client.name }, items: [] })
    }
    return [...map.values()].sort((a, b) => a.client.name.localeCompare(b.client.name, 'pt-BR'))
  }, [payments, charges])

  const chargeByClient = useMemo(() => {
    const m = new Map<string, AsaasChargeRow>()
    for (const c of charges) m.set(c.clientId, c)
    return m
  }, [charges])

  async function chargeAction(fn: () => Promise<Response>, chargeKey: string, okMsg?: string) {
    setBusyCharge(chargeKey)
    setChargeMsg(null)
    try {
      const res = await fn()
      const body = await res.json().catch(() => ({}))
      if (!res.ok) setChargeMsg(body.error || 'Falha na operação.')
      else if (okMsg) setChargeMsg(okMsg)
      onChanged()
    } catch {
      setChargeMsg('Falha de conexão.')
    } finally {
      setBusyCharge(null)
    }
  }

  const generate = (clientId: string) => chargeAction(
    () => fetch('/api/asaas/cobrancas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, year: period.year, month: period.month }),
    }),
    `gen-${clientId}`,
    'Cobrança gerada no Asaas.',
  )
  const syncCharge = (chargeId: string) => chargeAction(
    () => fetch('/api/asaas/cobrancas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chargeId }),
    }),
    `sync-${chargeId}`,
  )
  const nfseAction = (chargeId: string, action: string, okMsg?: string) => chargeAction(
    () => fetch(`/api/nfse/${chargeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }),
    `${action}-${chargeId}`,
    okMsg,
  )

  return (
    <div className="space-y-2">
      {chargeMsg && (
        <p className="text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{chargeMsg}</p>
      )}
      {groups.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Nenhum pagamento cadastrado neste mês</p>
      ) : (
        groups.map(({ client, items }) => {
          const total = items.reduce((s, p) => s + p.amount, 0)
          const paid = items.filter((p) => p.status === 'PAGO')
          const paidTotal = paid.reduce((s, p) => s + p.amount, 0)
          const pending = items.filter((p) => p.status !== 'PAGO')
          const allPaid = items.length > 0 && pending.length === 0
          const overdue = pending.some((p) => isOverdue(p))
          const earliestDue = items.length > 0
            ? items.reduce((min, p) => (new Date(p.dueDate) < new Date(min) ? p.dueDate : min), items[0].dueDate)
            : null
          const charge = chargeByClient.get(client.id)
          const st = charge ? (ASAAS_STATUS_PT[charge.status] ?? { label: charge.status, cls: 'bg-gray-100 text-gray-600' }) : null
          const nf = charge?.nfse ? (NFSE_STATUS_PT[charge.nfse.status] ?? { label: charge.nfse.status, cls: 'bg-gray-100 text-gray-600' }) : null
          const busy = busyCharge != null && busyCharge.endsWith(charge?.id ?? client.id)

          return (
            <div key={client.id} className="border border-gray-200 rounded-lg hover:bg-gray-50">
              <div className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{client.name}</p>
                    <TierBadge tier={client.tier} />
                    {charge && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#030A8C]/10 text-[#030A8C]">Asaas</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {items.length > 0 ? `${items.length} serviço(s)` : 'cobrança Asaas'}
                    {earliestDue ? ` · vence ${formatDate(earliestDue)}` : charge ? ` · vence ${formatDate(charge.dueDate)}` : ''}
                    {allPaid
                      ? paid[0]?.paidAt ? ` · pago em ${formatDate(paid[0].paidAt)}` : ''
                      : paidTotal > 0 ? ` · ${formatCurrency(paidTotal)} já pago` : ''}
                    {charge?.netValue != null ? ` · líquido ${formatCurrency(Number(charge.netValue))}` : ''}
                    {charge?.fee != null ? ` · tarifa ${formatCurrency(Number(charge.fee))}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(items.length > 0 ? total : Number(charge?.value ?? 0))}</p>
                  {items.length > 0 && (
                    <button
                      onClick={() =>
                        allPaid
                          ? onToggle(items.map((p) => p.id), 'PENDENTE')
                          : onToggle(pending.map((p) => p.id), 'PAGO')
                      }
                      title={charge ? 'Cobrança Asaas: o status muda pelo webhook; use só para ajuste manual' : allPaid ? 'Marcar tudo como pendente' : 'Marcar tudo como pago'}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        allPaid
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : overdue
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                      }`}
                    >
                      {allPaid ? <Check className="w-3 h-3" /> : null}
                      {allPaid ? 'PAGO' : overdue ? 'ATRASADO' : paidTotal > 0 ? 'PARCIAL' : 'PENDENTE'}
                    </button>
                  )}
                </div>
              </div>

              {/* Faixa Asaas / NFS-e */}
              <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5">
                {!charge ? (
                  <button
                    onClick={() => generate(client.id)}
                    disabled={busy}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#030A8C] text-white hover:bg-[#02077a] disabled:opacity-50 transition-colors"
                  >
                    {busy ? 'Gerando...' : 'Gerar cobrança Asaas'}
                  </button>
                ) : (
                  <>
                    {st && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>}
                    {nf && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${nf.cls}`}>{nf.label}</span>}
                    {charge.invoiceUrl && (
                      <a href={charge.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#030A8C] hover:underline font-medium">Fatura</a>
                    )}
                    {charge.bankSlipUrl && (
                      <a href={charge.bankSlipUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#030A8C] hover:underline font-medium">Boleto</a>
                    )}
                    {charge.identificationField && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(charge.identificationField!); setChargeMsg('Linha digitável copiada.') }}
                        className="text-[11px] text-gray-500 hover:text-[#030A8C] font-medium"
                      >
                        Copiar linha digitável
                      </button>
                    )}
                    <button onClick={() => syncCharge(charge.id)} disabled={busy} className="text-[11px] text-gray-500 hover:text-[#030A8C] font-medium disabled:opacity-50">
                      Sincronizar
                    </button>
                    {!charge.nfse && ['CONFIRMED', 'RECEIVED'].includes(charge.status) && (
                      <button onClick={() => nfseAction(charge.id, 'emit', 'NFS-e enviada para processamento.')} disabled={busy} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors">
                        Emitir NFS-e
                      </button>
                    )}
                    {charge.nfse && (
                      <>
                        <button onClick={() => nfseAction(charge.id, 'consult')} disabled={busy} className="text-[11px] text-gray-500 hover:text-[#030A8C] font-medium disabled:opacity-50">
                          Consultar NFS-e
                        </button>
                        {charge.nfse.pdfUrl && (
                          <a href={charge.nfse.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#030A8C] hover:underline font-medium">PDF</a>
                        )}
                        {charge.nfse.xmlUrl && (
                          <a href={charge.nfse.xmlUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#030A8C] hover:underline font-medium">XML</a>
                        )}
                        {charge.nfse.status === 'AUTORIZADO' && (
                          <button onClick={() => nfseAction(charge.id, 'email', 'NFS-e reenviada por e-mail.')} disabled={busy} className="text-[11px] text-gray-500 hover:text-[#030A8C] font-medium disabled:opacity-50">
                            Reenviar por e-mail
                          </button>
                        )}
                        {charge.nfse.status === 'ERRO_AUTORIZACAO' && (
                          <button onClick={() => nfseAction(charge.id, 'emit', 'Nova tentativa de emissão enviada.')} disabled={busy} className="text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-50">
                            Tentar novamente
                          </button>
                        )}
                      </>
                    )}
                    {(charge.lastError || charge.nfse?.lastError || charge.nfse?.municipalMessage) && (
                      <button
                        onClick={() => alert(charge.lastError || charge.nfse?.lastError || charge.nfse?.municipalMessage || '')}
                        className="text-[11px] text-red-600 hover:underline font-medium"
                      >
                        Ver erro
                      </button>
                    )}
                    {charge.status === 'ERROR' && (
                      <button onClick={() => generate(client.id)} disabled={busy} className="text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-50">
                        Tentar novamente
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

/* ---------------------------------- Custos ---------------------------------- */

function CostsTab({
  entries, period, onChanged, onTogglePaid,
}: {
  entries: Entry[]
  period: { year: number; month: number }
  onChanged: () => void
  onTogglePaid: (e: Entry) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('todos')
  const [categoryFilter, setCategoryFilter] = useState('todas')
  const [typeFilter, setTypeFilter] = useState('todos')
  const [editing, setEditing] = useState<Entry | null>(null)
  const [scopeAction, setScopeAction] = useState<{ entry: Entry; action: 'edit' | 'delete' } | null>(null)
  const [pendingEdit, setPendingEdit] = useState<Record<string, unknown> | null>(null)

  const emptyForm = {
    name: '', description: '', category: 'Softwares e ferramentas',
    amount: null as number | null, recurrenceType: 'UNICO',
    dueDate: `${period.year}-${String(period.month).padStart(2, '0')}-05`,
    status: 'PENDENTE', paidAt: '',
    frequency: 'MENSAL', startDate: `${period.year}-${String(period.month).padStart(2, '0')}-01`, endDate: '', dueDay: '5',
  }
  const [form, setForm] = useState(emptyForm)

  const filtered = entries.filter((e) => {
    if (statusFilter === 'pago' && e.status !== 'PAGO') return false
    if (statusFilter === 'pendente' && (e.status !== 'PENDENTE' || isOverdue(e))) return false
    if (statusFilter === 'atrasado' && !isOverdue(e)) return false
    if (categoryFilter !== 'todas' && e.category !== categoryFilter) return false
    if (typeFilter === 'unico' && e.recurring) return false
    if (typeFilter === 'recorrente' && !e.recurring) return false
    return true
  })

  async function submit() {
    if (!form.name.trim() || form.amount == null) return
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/financeiro/custos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setShowForm(false)
        setForm(emptyForm)
        onChanged()
      } else {
        const body = await res.json().catch(() => ({}))
        setFormError(body.error || 'Não foi possível salvar o custo.')
      }
    } catch {
      setFormError('Falha de conexão. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  async function applyEdit(entry: Entry, fields: Record<string, unknown>, scope: 'only' | 'future') {
    const res = await fetch('/api/financeiro/custos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, scope, ...fields }),
    })
    if (res.ok) { setEditing(null); onChanged() }
  }

  async function applyDelete(entry: Entry, scope: 'only' | 'future') {
    const res = await fetch(`/api/financeiro/custos?entryId=${entry.id}&scope=${scope}`, { method: 'DELETE' })
    if (res.ok) onChanged()
  }

  function requestEdit(entry: Entry, fields: Record<string, unknown>) {
    if (entry.recurringCostId) {
      setPendingEdit(fields)
      setScopeAction({ entry, action: 'edit' })
    } else {
      applyEdit(entry, fields, 'only')
    }
  }

  function requestDelete(entry: Entry) {
    if (entry.recurringCostId) {
      setScopeAction({ entry, action: 'delete' })
    } else if (confirm(`Excluir o custo "${entry.name || entry.description}"?`)) {
      applyDelete(entry, 'only')
    }
  }

  return (
    <div>
      {/* Filtros + adicionar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input text-xs !w-auto" aria-label="Filtrar por status">
          <option value="todos">Status: todos</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
          <option value="atrasado">Atrasado</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input text-xs !w-auto" aria-label="Filtrar por categoria">
          <option value="todas">Categoria: todas</option>
          {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input text-xs !w-auto" aria-label="Filtrar por tipo">
          <option value="todos">Tipo: todos</option>
          <option value="unico">Único</option>
          <option value="recorrente">Recorrente</option>
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 px-3 py-1.5 bg-[#030A8C] text-white rounded-lg text-xs font-medium hover:bg-[#02077a] transition-colors">
          <Plus className="w-3.5 h-3.5" /> Adicionar custo
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3 border border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Nome do custo *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input text-sm" placeholder="Ex: Assinatura Adobe" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Categoria</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input text-sm">
                {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição</label>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="input text-sm" placeholder="Detalhes do custo" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Valor *</label>
              <CurrencyInput value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} className="input text-sm" ariaLabel="Valor do custo" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo *</label>
              <select value={form.recurrenceType} onChange={(e) => setForm((f) => ({ ...f, recurrenceType: e.target.value }))} className="input text-sm">
                <option value="UNICO">Custo único</option>
                <option value="RECORRENTE">Custo recorrente</option>
              </select>
            </div>

            {form.recurrenceType === 'UNICO' ? (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Data de vencimento *</label>
                  <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="input text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="input text-sm">
                    <option value="PENDENTE">Pendente</option>
                    <option value="PAGO">Pago</option>
                  </select>
                </div>
                {form.status === 'PAGO' && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Data do pagamento</label>
                    <input type="date" value={form.paidAt} onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))} className="input text-sm" />
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Frequência *</label>
                  <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} className="input text-sm">
                    <option value="MENSAL">Mensal</option>
                    <option value="TRIMESTRAL">Trimestral</option>
                    <option value="ANUAL">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Data de início *</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="input text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Data de término (opcional)</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="input text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Dia do vencimento</label>
                  <input type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm((f) => ({ ...f, dueDay: e.target.value }))} className="input text-sm" />
                </div>
              </>
            )}
          </div>
          {formError && (
            <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setFormError(null) }} className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded-lg">Cancelar</button>
            <button onClick={submit} disabled={!form.name.trim() || form.amount == null || saving}
              className="text-xs px-3 py-1.5 bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar custo'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          {entries.length === 0 ? 'Nenhum custo neste mês' : 'Nenhum custo com esses filtros'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <div key={entry.id} className="border border-gray-100 rounded-lg">
              <div className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 truncate">{entry.name || entry.description}</p>
                    <TypeBadge recurring={entry.recurring} />
                    <StatusBadge entry={entry} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {entry.category}
                    {entry.dueDate ? ` · vence ${formatDate(entry.dueDate)}` : ''}
                    {entry.status === 'PAGO' && entry.paidAt ? ` · pago em ${formatDate(entry.paidAt)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-sm font-bold text-red-600">- {formatCurrency(entry.amount)}</span>
                  <button onClick={() => onTogglePaid(entry)}
                    title={entry.status === 'PAGO' ? 'Marcar como pendente' : 'Marcar como pago'}
                    className={`p-1.5 rounded-lg transition-colors ${entry.status === 'PAGO' ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditing(editing?.id === entry.id ? null : entry)} title="Editar"
                    className="p-1.5 text-gray-400 hover:text-[#030A8C] hover:bg-[#030A8C]/5 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => requestDelete(entry)} title="Excluir"
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {editing?.id === entry.id && (
                <CostEditForm
                  entry={entry}
                  onCancel={() => setEditing(null)}
                  onSave={(fields) => requestEdit(entry, fields)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Escopo de edição/exclusão de recorrente */}
      {scopeAction && (
        <ScopeDialog
          title={scopeAction.action === 'delete'
            ? `Excluir "${scopeAction.entry.name || scopeAction.entry.description}"?`
            : `Alterar "${scopeAction.entry.name || scopeAction.entry.description}"?`}
          onlyLabel={scopeAction.action === 'delete' ? 'Excluir somente este lançamento' : 'Alterar somente este lançamento'}
          futureLabel={scopeAction.action === 'delete' ? 'Excluir este e os próximos lançamentos' : 'Alterar este e os próximos lançamentos'}
          onPick={(scope) => {
            if (scopeAction.action === 'delete') applyDelete(scopeAction.entry, scope)
            else if (pendingEdit) applyEdit(scopeAction.entry, pendingEdit, scope)
            setScopeAction(null)
            setPendingEdit(null)
          }}
          onClose={() => { setScopeAction(null); setPendingEdit(null) }}
        />
      )}
    </div>
  )
}

function CostEditForm({ entry, onCancel, onSave }: {
  entry: Entry
  onCancel: () => void
  onSave: (fields: Record<string, unknown>) => void
}) {
  const [f, setF] = useState({
    name: entry.name || entry.description,
    description: entry.description,
    category: entry.category,
    amount: entry.amount as number | null,
    dueDate: entry.dueDate ? String(entry.dueDate).split('T')[0] : '',
  })
  return (
    <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className="input text-sm" placeholder="Nome *" aria-label="Nome do custo" />
        <select value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))} className="input text-sm" aria-label="Categoria">
          {COST_CATEGORIES.includes(f.category) ? null : <option value={f.category}>{f.category}</option>}
          {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <CurrencyInput value={f.amount} onChange={(v) => setF((p) => ({ ...p, amount: v }))} className="input text-sm" ariaLabel="Valor do custo" />
        <input type="date" value={f.dueDate} onChange={(e) => setF((p) => ({ ...p, dueDate: e.target.value }))} className="input text-sm" aria-label="Vencimento" />
        <input value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} className="input text-sm sm:col-span-2" placeholder="Descrição" aria-label="Descrição" />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded-lg">Cancelar</button>
        <button
          onClick={() => onSave({ name: f.name, description: f.description, category: f.category, amount: f.amount, dueDate: f.dueDate || undefined })}
          disabled={!f.name.trim() || f.amount == null}
          className="text-xs px-3 py-1.5 bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50"
        >
          Salvar
        </button>
      </div>
    </div>
  )
}

/* --------------------------------- Salários --------------------------------- */

function SalariesTab({
  entries, users, period, onChanged, onTogglePaid,
}: {
  entries: Entry[]
  users: Collaborator[]
  period: { year: number; month: number }
  onChanged: () => void
  onTogglePaid: (e: Entry) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('todos')
  const [userFilter, setUserFilter] = useState('todos')
  const [editing, setEditing] = useState<Entry | null>(null)
  const [editAmount, setEditAmount] = useState<number | null>(null)
  const [scopeFor, setScopeFor] = useState<Entry | null>(null)

  const emptyForm = {
    userId: '', amount: null as number | null, payDay: '5',
    startYear: period.year, startMonth: period.month,
    endDate: '', notes: '', status: 'PENDENTE',
  }
  const [form, setForm] = useState(emptyForm)

  const filtered = entries.filter((e) => {
    if (statusFilter === 'pago' && e.status !== 'PAGO') return false
    if (statusFilter === 'pendente' && (e.status !== 'PENDENTE' || isOverdue(e))) return false
    if (statusFilter === 'atrasado' && !isOverdue(e)) return false
    if (userFilter !== 'todos' && e.user?.id !== userFilter) return false
    return true
  })

  const total = entries.reduce((s, e) => s + e.amount, 0)

  function pickUser(userId: string) {
    const u = users.find((x) => x.id === userId)
    // Reaproveita o salário do perfil do colaborador, se houver
    setForm((f) => ({ ...f, userId, amount: f.amount ?? u?.salary ?? null }))
  }

  async function submit() {
    if (!form.userId || form.amount == null) return
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/financeiro/salarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setShowForm(false)
        setForm(emptyForm)
        onChanged()
      } else {
        const body = await res.json().catch(() => ({}))
        setFormError(body.error || 'Não foi possível cadastrar o salário.')
      }
    } catch {
      setFormError('Falha de conexão. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  async function applyEdit(entry: Entry, scope: 'only' | 'future') {
    const res = await fetch('/api/financeiro/salarios', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, scope, amount: editAmount }),
    })
    if (res.ok) { setEditing(null); setEditAmount(null); onChanged() }
  }

  async function stopSalary(entry: Entry) {
    if (!confirm(`Interromper os próximos salários de ${entry.user?.name ?? 'colaborador'} a partir de ${String(period.month).padStart(2, '0')}/${period.year}? O histórico é preservado.`)) return
    const res = await fetch(`/api/financeiro/salarios?entryId=${entry.id}`, { method: 'DELETE' })
    if (res.ok) onChanged()
  }

  return (
    <div>
      {/* Filtros + adicionar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input text-xs !w-auto" aria-label="Filtrar por status">
          <option value="todos">Status: todos</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
          <option value="atrasado">Atrasado</option>
        </select>
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="input text-xs !w-auto" aria-label="Filtrar por colaborador">
          <option value="todos">Colaborador: todos</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 px-3 py-1.5 bg-[#030A8C] text-white rounded-lg text-xs font-medium hover:bg-[#02077a] transition-colors">
          <Plus className="w-3.5 h-3.5" /> Adicionar salário
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3 border border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Colaborador *</label>
              <select value={form.userId} onChange={(e) => pickUser(e.target.value)} className="input text-sm">
                <option value="">Selecione...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}{u.position ? ` — ${u.position}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Valor do salário *</label>
              <CurrencyInput value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} className="input text-sm" ariaLabel="Valor do salário" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Dia do pagamento</label>
              <input type="number" min="1" max="31" value={form.payDay} onChange={(e) => setForm((f) => ({ ...f, payDay: e.target.value }))} className="input text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Mês inicial</label>
              <input
                type="month"
                value={`${form.startYear}-${String(form.startMonth).padStart(2, '0')}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number)
                  if (y && m) setForm((f) => ({ ...f, startYear: y, startMonth: m }))
                }}
                className="input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Data final (opcional)</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="input text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Status do mês</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="input text-sm">
                <option value="PENDENTE">Pendente</option>
                <option value="PAGO">Pago</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Observação</label>
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input text-sm" placeholder="Ex: acordo de horas, bônus incluído..." />
            </div>
          </div>
          {formError && (
            <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setFormError(null) }} className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded-lg">Cancelar</button>
            <button onClick={submit} disabled={!form.userId || form.amount == null || saving}
              className="text-xs px-3 py-1.5 bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar salário'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          {entries.length === 0 ? 'Nenhum salário cadastrado neste mês' : 'Nenhum salário com esses filtros'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <div key={entry.id} className="border border-gray-100 rounded-lg">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-[#030A8C] rounded-full flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">{(entry.user?.name ?? '?').charAt(0)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{entry.user?.name ?? entry.name}</p>
                      <TypeBadge recurring />
                      <StatusBadge entry={entry} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {entry.user?.position ?? 'Colaborador'}
                      {entry.dueDate ? ` · vence ${formatDate(entry.dueDate)}` : ''}
                      {entry.status === 'PAGO' && entry.paidAt ? ` · pago em ${formatDate(entry.paidAt)}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-sm font-bold text-red-600">- {formatCurrency(entry.amount)}</span>
                  <button onClick={() => onTogglePaid(entry)}
                    title={entry.status === 'PAGO' ? 'Marcar como pendente' : 'Marcar como pago'}
                    className={`p-1.5 rounded-lg transition-colors ${entry.status === 'PAGO' ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setEditing(editing?.id === entry.id ? null : entry); setEditAmount(entry.amount) }} title="Alterar salário"
                    className="p-1.5 text-gray-400 hover:text-[#030A8C] hover:bg-[#030A8C]/5 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => stopSalary(entry)} title="Interromper próximos salários"
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {editing?.id === entry.id && (
                <div className="border-t border-gray-100 bg-gray-50 p-3 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Novo valor</label>
                    <CurrencyInput value={editAmount} onChange={setEditAmount} className="input text-sm" ariaLabel="Novo valor do salário" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(null)} className="text-xs px-3 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">Cancelar</button>
                    <button onClick={() => setScopeFor(entry)} disabled={editAmount == null}
                      className="text-xs px-3 py-2 bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50">
                      Salvar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg mt-3">
            <span className="text-sm font-bold text-gray-900">Total Salários do mês</span>
            <span className="text-sm font-bold text-red-700">{formatCurrency(total)}</span>
          </div>
        </div>
      )}

      {scopeFor && (
        <ScopeDialog
          title={`Alterar o salário de ${scopeFor.user?.name ?? 'colaborador'}?`}
          onlyLabel="Alterar somente o salário deste mês"
          futureLabel="Alterar a partir deste mês (meses anteriores preservados)"
          onPick={(scope) => { applyEdit(scopeFor, scope); setScopeFor(null) }}
          onClose={() => setScopeFor(null)}
        />
      )}
    </div>
  )
}
