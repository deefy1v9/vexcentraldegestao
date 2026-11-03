'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Download, Plus, RefreshCw, Settings2 } from 'lucide-react'
import Header from '@/components/layout/Header'
import { Button } from '@/components/vex/button'
import { parseCompetence } from '@/lib/billing-core'
import AddEntryModal from '@/components/financeiro/AddEntryModal'
import FinanceKpis, { type MonthSummary, type TileKey } from '@/components/financeiro/FinanceKpis'
import CaixaPanel from './CaixaPanel'
import type { VexSalesMes } from './VexSalesCard'
import { MonthPicker, FinanceTabs, FinanceFilterRow, FinanceChips, Pagination } from '@/components/financeiro/FinanceToolbar'
import ReceivablesTable from '@/components/financeiro/ReceivablesTable'
import EntriesTable from '@/components/financeiro/EntriesTable'
import BpoTab from '@/components/financeiro/BpoTab'
import ConciliacaoTab from '@/components/financeiro/ConciliacaoTab'
import {
  COST_CATEGORIES, CostEditForm, DueDateDialog, NewCostModal, NewSalaryModal, SalaryEditForm, ScopeDialog,
} from '@/components/financeiro/EntryForms'
import {
  buildReceivableRows, filterEntries, filterReceivables, finTabCounts, isOverdue, situationOf,
  sortEntries, sortReceivables, EMPTY_FIN_FILTERS,
  type ChargeLike, type EntryLike, type FinFilters, type FinSort, type FinTab, type PaymentLike, type ReceivableRow,
} from '@/lib/financeiro-core'

interface Collaborator { id: string; name: string; position?: string | null; salary?: number | null }

interface Movement {
  id: string
  kind: 'custo' | 'salario' | 'recebimento'
  label: string
  detail: string
  amount: number
  at: string
}

interface Entry extends EntryLike {
  recurringCostId?: string | null
  salaryContractId?: string | null
}

interface MonthData {
  summary: MonthSummary
  entries: Entry[]
  clientPayments: PaymentLike[]
  users: Collaborator[]
  asaasCharges: ChargeLike[]
  vexSales: VexSalesMes | null
  previstoServicos: number
  upcoming: Entry[]
  recent: Movement[]
}

const PAGE = 15
const TABS: FinTab[] = ['bpo', 'conciliacao', 'recebiveis', 'atrasados', 'custos', 'salarios', 'caixa']
const SORTS: FinSort[] = ['vencimento', 'valor', 'nome']

function currentPeriod() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * Financeiro do mês: quatro números clicáveis no topo, abas com contadores,
 * filtros e tabela paginada com a ação de cada linha. A competência, a aba e
 * os filtros vivem na URL.
 */
export default function FinanceiroPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const period = useMemo(() => parseCompetence(params.get('mes')) ?? currentPeriod(), [params])
  const isCurrentMonth = period.year === currentPeriod().year && period.month === currentPeriod().month

  const [data, setData] = useState<MonthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [runningJob, setRunningJob] = useState(false)
  const [page, setPage] = useState(1)

  const [showAdd, setShowAdd] = useState(false)
  const [showNewCost, setShowNewCost] = useState(false)
  const [showNewSalary, setShowNewSalary] = useState(false)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [editAmount, setEditAmount] = useState<number | null>(null)
  const [scopeAction, setScopeAction] = useState<{ entry: Entry; action: 'edit' | 'delete'; fields?: Record<string, unknown> } | null>(null)
  const [dueDialog, setDueDialog] = useState<{ ids: string[]; label: string; current: string } | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [fiscal, setFiscal] = useState<{ ready: boolean; missing: string[] } | null>(null)

  /* ------------------------- estado que vive na URL ------------------------- */
  // Sem aba na URL abre o BPO; link antigo com filtro (?situacao=...) continua caindo em Recebíveis
  const temFiltro = ['q', 'situacao', 'tipo', 'categoria'].some((k) => params.get(k))
  const tab: FinTab = TABS.includes(params.get('aba') as FinTab) ? (params.get('aba') as FinTab) : temFiltro ? 'recebiveis' : 'bpo'
  const sort: FinSort = SORTS.includes(params.get('ordem') as FinSort) ? (params.get('ordem') as FinSort) : 'vencimento'
  const filters: FinFilters = useMemo(() => ({
    q: params.get('q') ?? '',
    situation: (params.get('situacao') ?? '') as FinFilters['situation'],
    kind: (params.get('tipo') ?? '') as FinFilters['kind'],
    category: params.get('categoria') ?? '',
  }), [params])

  const push = useCallback((next: Partial<FinFilters> & { tab?: FinTab; sort?: FinSort; period?: { year: number; month: number } }) => {
    const m = { ...filters, ...next }
    const p = next.period ?? period
    const q = new URLSearchParams()
    q.set('mes', `${p.year}-${String(p.month).padStart(2, '0')}`)
    const t = next.tab ?? tab
    if (t !== 'bpo') q.set('aba', t)
    const s = next.sort ?? sort
    if (s !== 'vencimento') q.set('ordem', s)
    if (m.q) q.set('q', m.q)
    if (m.situation) q.set('situacao', m.situation)
    if (m.kind) q.set('tipo', m.kind)
    if (m.category) q.set('categoria', m.category)
    router.replace(`${pathname}?${q.toString()}`, { scroll: false })
    setPage(1)
  }, [filters, period, tab, sort, router, pathname])

  /* --------------------------------- dados --------------------------------- */
  const load = useCallback((p: { year: number; month: number }) => {
    fetch(`/api/financeiro?month=${p.month}&year=${p.year}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falha'))))
      .then((body: MonthData) => setData(body))
      .catch(() => setError('Não foi possível carregar os dados financeiros.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(period) }, [period, load])
  const reload = useCallback(() => { setLoading(true); setError(null); load(period) }, [load, period])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 5000)
    return () => clearTimeout(t)
  }, [flash])

  useEffect(() => {
    fetch('/api/fiscal-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setFiscal({ ready: !!b.ready, missing: b.missing ?? [] }))
      .catch(() => {})
  }, [])

  const entries = useMemo(() => data?.entries ?? [], [data])
  const costs = useMemo(() => entries.filter((e) => e.type === 'CUSTO'), [entries])
  const salaries = useMemo(() => entries.filter((e) => e.type === 'SALARIO'), [entries])
  const rows = useMemo(() => buildReceivableRows(data?.clientPayments ?? [], data?.asaasCharges ?? []), [data])
  const counts = useMemo(() => finTabCounts(rows, costs, salaries), [rows, costs, salaries])

  /* ------------------------ recorte visível por aba ------------------------ */
  const receivableRows: ReceivableRow[] = useMemo(() => {
    const base = tab === 'atrasados' ? rows.filter((r) => r.situation === 'atrasado') : rows
    return sortReceivables(filterReceivables(base, filters), sort)
  }, [rows, tab, filters, sort])

  const costRows = useMemo(() => {
    const base = tab === 'atrasados' ? costs.filter((e) => isOverdue(e)) : costs
    return sortEntries(filterEntries(base, filters), sort)
  }, [costs, tab, filters, sort])

  const salaryRows = useMemo(() => {
    const base = tab === 'atrasados' ? salaries.filter((e) => isOverdue(e)) : salaries
    return sortEntries(filterEntries(base, filters), sort)
  }, [salaries, tab, filters, sort])

  const lista = tab === 'custos' ? costRows : tab === 'salarios' ? salaryRows : receivableRows
  const pages = Math.max(1, Math.ceil(lista.length / PAGE))
  const pageSafe = Math.min(page, pages)
  const from = (pageSafe - 1) * PAGE
  const to = pageSafe * PAGE
  const shown = Math.max(0, Math.min(to, lista.length) - from)

  const activeTile: TileKey | null = filters.situation === 'pago' && tab === 'recebiveis' ? 'recebido'
    : filters.situation === 'pendente' && tab === 'recebiveis' ? 'receber'
    : tab === 'atrasados' ? 'atrasado'
    : tab === 'custos' ? 'custos'
    : null

  function toggleTile(k: TileKey) {
    if (activeTile === k) { push({ tab: 'recebiveis', situation: '' }); return }
    if (k === 'recebido') push({ tab: 'recebiveis', situation: 'pago' })
    else if (k === 'receber') push({ tab: 'recebiveis', situation: 'pendente' })
    else if (k === 'atrasado') push({ tab: 'atrasados', situation: '' })
    else push({ tab: 'custos', situation: '' })
  }

  /* --------------------------------- ações --------------------------------- */

  async function togglePayments(paymentIds: string[], newStatus: string) {
    const res = await fetch('/api/financeiro/pagamentos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentIds, status: newStatus }),
    })
    if (res.ok) reload()
  }

  async function toggleEntryPaid(entry: EntryLike) {
    const endpoint = entry.type === 'SALARIO' ? '/api/financeiro/salarios' : '/api/financeiro/custos'
    const res = await fetch(endpoint, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, status: entry.status === 'PAGO' ? 'PENDENTE' : 'PAGO' }),
    })
    if (res.ok) reload()
  }

  async function paymentAction(payload: Record<string, unknown>, okMsg: string) {
    const res = await fetch('/api/financeiro/pagamentos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setFlash(body.error || 'Falha na operação.'); return }
    setFlash(body.skipped ? `${okMsg} (${body.skipped} parcela(s) já paga(s) mantida(s))` : okMsg)
    reload()
  }

  async function chargeAction(fn: () => Promise<Response>, key: string, okMsg?: string) {
    setBusyKey(key)
    try {
      const res = await fn()
      const body = await res.json().catch(() => ({}))
      if (!res.ok) setFlash(body.error || 'Falha na operação.')
      else if (okMsg) setFlash(okMsg)
      reload()
    } catch { setFlash('Falha de conexão.') } finally { setBusyKey(null) }
  }

  async function applyCostEdit(entry: Entry, fields: Record<string, unknown>, scope: 'only' | 'future') {
    const res = await fetch('/api/financeiro/custos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryId: entry.id, scope, ...fields }),
    })
    if (res.ok) { setEditing(null); reload() }
  }

  async function applySalaryEdit(entry: Entry, scope: 'only' | 'future') {
    const res = await fetch('/api/financeiro/salarios', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryId: entry.id, scope, amount: editAmount }),
    })
    if (res.ok) { setEditing(null); setEditAmount(null); reload() }
  }

  async function deleteCost(entry: Entry, scope: 'only' | 'future') {
    const res = await fetch(`/api/financeiro/custos?entryId=${entry.id}&scope=${scope}`, { method: 'DELETE' })
    if (res.ok) reload()
  }

  async function stopSalary(entry: Entry) {
    if (!confirm(`Interromper os próximos salários de ${entry.user?.name ?? 'colaborador'} a partir de ${String(period.month).padStart(2, '0')}/${period.year}? O histórico é preservado.`)) return
    const res = await fetch(`/api/financeiro/salarios?entryId=${entry.id}`, { method: 'DELETE' })
    if (res.ok) reload()
  }

  function exportCsv() {
    if (!data) return
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const linhas = [
      ['tipo', 'natureza', 'descricao', 'cliente/colaborador', 'valor', 'vencimento', 'status'].join(';'),
      ...rows.map((r) => ['recebimento', r.kind.toLowerCase(), r.label, r.client.name, r.amount.toFixed(2), r.dueDate?.slice(0, 10) ?? '', r.situation].map(esc).join(';')),
      ...entries.map((e) => [e.type.toLowerCase(), e.recurring ? 'recorrente' : 'unico', e.name || e.description, e.user?.name ?? e.category, e.amount.toFixed(2), e.dueDate?.slice(0, 10) ?? '', e.status].map(esc).join(';')),
    ].join('\n')
    const blob = new Blob([`﻿${linhas}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `financeiro-${period.year}-${String(period.month).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const ehLista = tab === 'recebiveis' || tab === 'atrasados' || tab === 'custos' || tab === 'salarios'

  async function gerarCobrancas() {
    setRunningJob(true)
    try {
      const res = await fetch('/api/asaas/cobrancas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runJob: true }) })
      const r = await res.json().catch(() => ({}))
      setFlash(res.ok
        ? `Cobranças: ${r.created ?? 0} criada(s), ${r.skipped ?? 0} já existente(s) ou fora da janela, ${r.errors ?? 0} erro(s).`
        : r.error || 'Falha ao gerar cobranças.')
      if (res.ok) reload()
    } finally { setRunningJob(false) }
  }

  const esqueleto = (
    <div className="space-y-3 animate-pulse py-2">
      {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-secondary/60 rounded-xl" />)}
    </div>
  )

  return (
    <div className="flex-1 flex flex-col">
      {/* Cabeçalho da página com o período e as ações do mês à direita (modelo Vireo) */}
      <Header
        title="Financeiro"
        subtitle="Controle financeiro por mês"
        acoes={
          <>
            <MonthPicker period={period} isCurrent={isCurrentMonth} onChange={(p) => push({ period: p })} onToday={() => push({ period: currentPeriod() })} />
            <Button variant="outline" asChild className="h-10 rounded-xl">
              <a href="/financeiro/fiscal" title="Configuração fiscal e diagnóstico"><Settings2 /><span className="hidden md:inline">Fiscal</span></a>
            </Button>
            <Button variant="outline" type="button" onClick={exportCsv} className="h-10 rounded-xl">
              <Download /><span className="hidden md:inline">Exportar</span>
            </Button>
            <Button variant="outline" type="button" disabled={runningJob} onClick={gerarCobrancas} className="h-10 rounded-xl">
              <RefreshCw className={runningJob ? 'animate-spin' : ''} />
              <span className="hidden md:inline">{runningJob ? 'Gerando…' : 'Gerar cobranças'}</span>
            </Button>
            <Button type="button" onClick={() => setShowAdd(true)} className="h-10 rounded-xl shadow-[0_6px_16px_-6px_var(--primary)]">
              <Plus /><span className="hidden sm:inline">Novo lançamento</span>
            </Button>
          </>
        }
      />

      <div className="px-4 sm:px-8 pt-2 pb-4 space-y-4">
        {flash && <p className="text-[13px] font-medium text-foreground bg-info-suave border border-info/20 rounded-2xl px-4 py-3">{flash}</p>}
        {error && <p className="text-[13.5px] font-medium text-destructive-texto bg-destructive-suave border border-destructive/20 rounded-2xl px-4 py-3 text-center">{error}</p>}

        <FinanceTabs active={tab} counts={counts} onChange={(t) => push({ tab: t })} />
        {/* Nas listas, os números do mês funcionam como filtro; o BPO, a
            Conciliação e o Caixa têm o próprio topo. Saldo e sócios ficam no BPO. */}
        {ehLista && (
          // O grid dos indicadores usa h-full: o bloco em volta dá a ele a altura do próprio conteúdo
          <div><FinanceKpis s={data?.summary ?? null} loading={loading} active={activeTile} onToggle={toggleTile} /></div>
        )}

        {tab === 'caixa' && <CaixaPanel />}
      </div>

      <div className="flex flex-col px-4 sm:px-8 pb-8">
        {ehLista ? (
          // A lista no padrão de tabela do Vireo: busca e filtros no topo do cartão, tabela e paginação dentro dele
          <section className="rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="px-4 sm:px-6 py-4 space-y-3">
              <FinanceFilterRow
                filters={filters}
                onChange={push}
                sort={sort}
                onSort={(s) => push({ sort: s })}
                categories={tab === 'custos' ? COST_CATEGORIES : []}
                showKind={tab !== 'salarios'}
                addLabel={tab === 'custos' ? 'Novo custo' : tab === 'salarios' ? 'Novo salário' : undefined}
                onAdd={tab === 'custos' ? () => setShowNewCost(true) : tab === 'salarios' ? () => setShowNewSalary(true) : undefined}
                placeholder={tab === 'salarios' ? 'Buscar colaborador' : tab === 'custos' ? 'Buscar custo ou categoria' : 'Buscar cliente ou serviço'}
              />
              <FinanceChips
                filters={filters}
                onRemove={(k) => push({ [k]: '' } as Partial<FinFilters>)}
                onClear={() => push({ ...EMPTY_FIN_FILTERS })}
              />
            </div>

            {loading ? <div className="px-6 pb-4 border-t border-border">{esqueleto}</div> : (
              <>
                {tab === 'custos' ? (
                  <EntriesTable
                    entries={costRows.slice(from, to)}
                    kind="custo"
                    onTogglePaid={toggleEntryPaid}
                    onEdit={(e) => setEditing(editing?.id === e.id ? null : e)}
                    onDelete={(e) => {
                      if (e.recurringCostId) setScopeAction({ entry: e, action: 'delete' })
                      else if (confirm(`Excluir o custo "${e.name || e.description}"?`)) deleteCost(e, 'only')
                    }}
                    deleteLabel="Excluir custo"
                    editingId={editing?.id ?? null}
                    editor={editing ? (
                      <CostEditForm
                        entry={editing}
                        onCancel={() => setEditing(null)}
                        onSave={(fields) => {
                          if (editing.recurringCostId) setScopeAction({ entry: editing, action: 'edit', fields })
                          else applyCostEdit(editing, fields, 'only')
                        }}
                      />
                    ) : null}
                  />
                ) : tab === 'salarios' ? (
                  <EntriesTable
                    entries={salaryRows.slice(from, to)}
                    kind="salario"
                    onTogglePaid={toggleEntryPaid}
                    onEdit={(e) => { setEditing(editing?.id === e.id ? null : e); setEditAmount(e.amount) }}
                    onDelete={stopSalary}
                    deleteLabel="Interromper próximos"
                    editingId={editing?.id ?? null}
                    editor={editing ? (
                      <SalaryEditForm
                        value={editAmount}
                        onChange={setEditAmount}
                        onCancel={() => setEditing(null)}
                        onSave={() => setScopeAction({ entry: editing, action: 'edit' })}
                      />
                    ) : null}
                  />
                ) : (
                  <ReceivablesTable
                    rows={receivableRows.slice(from, to)}
                    actions={{
                      busyKey,
                      fiscalReady: fiscal == null || fiscal.ready,
                      fiscalMissing: fiscal?.missing ?? [],
                      onTogglePaid: (r) => r.payment && togglePayments([r.payment.id], r.payment.status === 'PAGO' ? 'PENDENTE' : 'PAGO'),
                      onChangeDue: (r) => r.payment && setDueDialog({ ids: [r.payment.id], label: `${r.client.name} · ${r.label}`, current: r.dueDate.slice(0, 10) }),
                      onCancel: (r) => {
                        if (!r.payment) return
                        const reason = prompt('Motivo do cancelamento (opcional):') ?? undefined
                        paymentAction({ paymentIds: [r.payment.id], action: 'cancelar', reason }, 'Parcela cancelada.')
                      },
                      onResend: (r) => r.payment && paymentAction({ paymentIds: [r.payment.id], action: 'reenviar' }, 'Fatura reenviada por e-mail.'),
                      onGenerateCharge: (clientId) => chargeAction(
                        () => fetch('/api/asaas/cobrancas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, year: period.year, month: period.month }) }),
                        `gen-${clientId}`, 'Cobrança gerada no Asaas.',
                      ),
                      onSyncCharge: (chargeId) => chargeAction(
                        () => fetch('/api/asaas/cobrancas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chargeId }) }),
                        `sync-${chargeId}`,
                      ),
                      onNfse: (chargeId, action) => chargeAction(
                        () => fetch(`/api/nfse/${chargeId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }),
                        `${action}-${chargeId}`,
                        action === 'emit' ? 'NFS-e enviada para processamento.' : undefined,
                      ),
                    }}
                  />
                )}
                <div className="px-4 sm:px-6 py-3.5 border-t border-border">
                  <Pagination page={pageSafe} pages={pages} total={lista.length} shown={shown} onPage={setPage} />
                </div>
              </>
            )}
          </section>
        ) : tab === 'caixa' ? null : loading ? esqueleto : tab === 'conciliacao' ? (
          <ConciliacaoTab />
        ) : (
          <BpoTab competencia={`${period.year}-${String(period.month).padStart(2, '0')}`} />
        )}
      </div>

      {showAdd && (
        <AddEntryModal period={period} onClose={() => setShowAdd(false)} onSaved={(msg) => { setShowAdd(false); setFlash(msg); reload() }} />
      )}
      {showNewCost && (
        <NewCostModal period={period} onClose={() => setShowNewCost(false)} onSaved={() => { setShowNewCost(false); reload() }} />
      )}
      {showNewSalary && (
        <NewSalaryModal period={period} users={data?.users ?? []} onClose={() => setShowNewSalary(false)} onSaved={() => { setShowNewSalary(false); reload() }} />
      )}

      {dueDialog && (
        <DueDateDialog
          label={dueDialog.label}
          current={dueDialog.current}
          onClose={() => setDueDialog(null)}
          onConfirm={(date) => {
            const ids = dueDialog.ids
            setDueDialog(null)
            paymentAction({ paymentIds: ids, action: 'vencimento', dueDate: date }, 'Vencimento alterado.')
          }}
        />
      )}

      {scopeAction && (
        <ScopeDialog
          title={scopeAction.action === 'delete'
            ? `Excluir "${scopeAction.entry.name || scopeAction.entry.description}"?`
            : `Alterar "${scopeAction.entry.user?.name || scopeAction.entry.name || scopeAction.entry.description}"?`}
          onlyLabel={scopeAction.action === 'delete' ? 'Excluir somente este lançamento' : 'Alterar somente este mês'}
          futureLabel={scopeAction.action === 'delete' ? 'Excluir este e os próximos lançamentos' : 'Alterar este e os próximos meses'}
          onPick={(scope) => {
            const { entry, action, fields } = scopeAction
            if (action === 'delete') deleteCost(entry, scope)
            else if (entry.type === 'SALARIO') applySalaryEdit(entry, scope)
            else if (fields) applyCostEdit(entry, fields, scope)
            setScopeAction(null)
          }}
          onClose={() => setScopeAction(null)}
        />
      )}
    </div>
  )
}

/** Situação da linha — reexport para os testes de fumaça da página. */
export { situationOf }
