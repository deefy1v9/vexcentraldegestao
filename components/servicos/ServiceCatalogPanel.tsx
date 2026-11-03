'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Plus, Search, LayoutGrid, List, Copy, Pencil, Power, X, Loader2, Briefcase, Users, TrendingUp, Check,
} from 'lucide-react'
import { Kpi } from '@/components/vex/vireo'
import { GrupoCliente } from '@/components/clientes/ClienteVisual'
import { campo, campoTexto } from '@/components/clientes/FormSecao'

/* ---------------------------------- tipos ---------------------------------- */

interface CatalogItem {
  id: string
  name: string
  category: string | null
  summary: string | null
  scope: string | null
  deliverables: string[]
  exclusions: string[]
  leadTimeDays: number | null
  periodicity: string | null
  billingType: string
  minCents: number | null
  maxCents: number | null
  defaultCents: number | null
  isActive: boolean
  internalNotes: string | null
  createdAt: string
  updatedAt: string
  activeClients: number
  recurringCents: number
}

interface Contract {
  id: string
  clientId: string
  clientName: string
  clientStatus: string
  clientTier: string | null
  status: string
  contractType: string
  cents: number
  competence: string | null
  startDate: string | null
  endDate: string | null
}

const BILLING_LABEL: Record<string, string> = {
  RECORRENTE: 'Mensal recorrente',
  AVULSO: 'Avulso',
  PROJETO: 'Projeto com prazo',
  QUANTIDADE: 'Por quantidade',
  PERSONALIZADO: 'Personalizado',
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ATIVO: { label: 'Ativo', cls: 'bg-success-suave text-success' },
  PAUSADO: { label: 'Pausado', cls: 'bg-warning-suave text-warning' },
  ENCERRADO: { label: 'Encerrado', cls: 'bg-secondary text-muted-foreground' },
}

function StatusPill({ ativo }: { ativo: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 h-[22px] shrink-0 rounded-full px-2.5 text-[11.5px] font-semibold whitespace-nowrap ${ativo ? 'bg-success-suave text-success' : 'bg-secondary text-muted-foreground'}`}>
      <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-current" />
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function brl(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function maskMoney(v: string) {
  const d = v.replace(/\D/g, '')
  return d ? (Number(d) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
}
function toCents(v: string) {
  const d = (v ?? '').replace(/\D/g, '')
  return d ? Number(d) : 0
}
function priceRange(c: { minCents: number | null; maxCents: number | null; defaultCents: number | null }) {
  if (c.minCents != null && c.maxCents != null) return `${brl(c.minCents)} a ${brl(c.maxCents)}`
  if (c.minCents != null) return `a partir de ${brl(c.minCents)}`
  if (c.maxCents != null) return `até ${brl(c.maxCents)}`
  if (c.defaultCents != null) return brl(c.defaultCents)
  return 'sem valor sugerido'
}

const EMPTY_FORM = {
  name: '', category: '', summary: '', scope: '', deliverables: '', exclusions: '',
  leadTimeDays: '', periodicity: 'MENSAL', billingType: 'RECORRENTE',
  minValue: '', maxValue: '', defaultValue: '', isActive: true, internalNotes: '',
}

/**
 * Catálogo de serviços da VEX: cards (padrão) ou tabela, busca, filtros,
 * ordenação, cadastro/edição/duplicação/ativação e detalhe com os clientes
 * que contratam cada serviço. Dados reais de /api/servicos.
 */
export default function ServiceCatalogPanel() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<'' | 'ativo' | 'inativo'>('')
  const [sort, setSort] = useState<'name' | 'value' | 'clients'>('name')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<CatalogItem | null | 'new'>(null)
  const [detail, setDetail] = useState<{ item: CatalogItem; contracts: Contract[]; stats: { activeClients: number; recurringCents: number; receivedCents: number } } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const PAGE = 12

  const load = useCallback(() => {
    fetch('/api/servicos')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => setItems(b.catalog ?? []))
      .catch(() => setError('Não foi possível carregar o catálogo.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  // Recarga manual depois de uma ação: aí o estado de carga pode ser ligado
  const reload = useCallback(() => { setLoading(true); setError(null); load() }, [load])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort(), [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter((i) => !q || i.name.toLowerCase().includes(q) || (i.summary ?? '').toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q))
      .filter((i) => !category || i.category === category)
      .filter((i) => !status || (status === 'ativo' ? i.isActive : !i.isActive))
      .sort((a, b) => {
        if (sort === 'value') return (b.defaultCents ?? b.maxCents ?? 0) - (a.defaultCents ?? a.maxCents ?? 0)
        if (sort === 'clients') return b.activeClients - a.activeClients
        return a.name.localeCompare(b.name, 'pt-BR')
      })
  }, [items, search, category, status, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  // Filtro novo sempre volta para a primeira página
  const currentPage = Math.min(page, pages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE, currentPage * PAGE)

  async function toggleActive(item: CatalogItem) {
    if (!confirm(`${item.isActive ? 'Inativar' : 'Ativar'} "${item.name}"? ${item.isActive ? 'Contratações existentes continuam válidas; só novas contratações ficam bloqueadas.' : ''}`)) return
    setBusy(item.id)
    try {
      const res = await fetch(`/api/servicos/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.isActive }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(b.error || 'Falha ao alterar.'); return }
      setMsg(item.isActive ? 'Serviço inativado.' : 'Serviço ativado.')
      reload()
    } finally { setBusy(null) }
  }

  async function duplicate(item: CatalogItem) {
    setBusy(item.id)
    try {
      const res = await fetch(`/api/servicos/${item.id}`, { method: 'POST' })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(b.error || 'Falha ao duplicar.'); return }
      setMsg(`Cópia criada (inativa) — revise e ative.`)
      reload()
    } finally { setBusy(null) }
  }

  async function openDetail(item: CatalogItem) {
    setBusy(item.id)
    try {
      const res = await fetch(`/api/servicos/${item.id}`)
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(b.error || 'Falha ao abrir.'); return }
      setDetail({ item, contracts: b.contracts ?? [], stats: b.stats })
    } finally { setBusy(null) }
  }

  // Números do topo, tirados do próprio catálogo carregado
  const ativos = items.filter((i) => i.isActive).length
  const contratacoes = items.reduce((a, i) => a + i.activeClients, 0)
  const recorrente = items.reduce((a, i) => a + i.recurringCents, 0)

  const selectFiltro = 'h-9 rounded-xl border border-border bg-input px-3 text-[13px] text-foreground hover:border-subtle focus:outline-none focus:border-marca focus:ring-2 focus:ring-marca/20 transition-colors'
  const th = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground whitespace-nowrap'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icone={Briefcase} rotulo="Serviços no catálogo" valor={loading ? '—' : items.length} nota={`${categories.length} categoria(s)`} />
        <Kpi icone={Check} tom="sucesso" rotulo="Ativos" valor={loading ? '—' : ativos} nota={`${items.length - ativos} inativo(s)`} />
        <Kpi icone={Users} tom="info" rotulo="Contratações ativas" valor={loading ? '—' : contratacoes} nota="Somando todos os serviços" />
        <Kpi icone={TrendingUp} tom="sucesso" rotulo="Receita recorrente" valor={loading ? '—' : <span className="text-[22px]">{brl(recorrente)}</span>} nota="Por mês, nos serviços ativos" />
      </div>

      <section className="rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
        {/* Cabeçalho do cartão: título, busca, filtros, visão e a ação (modelo Vireo) */}
        <div className="px-6 pt-6 pb-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[21px] font-semibold tracking-[-0.01em] text-foreground">Catálogo</h2>
              <p className="t-legenda mt-0.5">{filtered.length} de {items.length} serviço(s)</p>
            </div>
            <button onClick={() => setEditing('new')} className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-primary-foreground text-[13.5px] font-medium hover:bg-primary-hover transition-colors">
              <Plus className="w-4 h-4" /> Cadastrar serviço
            </button>
          </div>

          {/* Barra de ações */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Pesquisar serviço" className={`${campo} h-9 rounded-full`} style={{ paddingLeft: "2.25rem" }} />
            </div>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} className={selectFiltro} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value as '' | 'ativo' | 'inativo'); setPage(1) }} className={selectFiltro} aria-label="Status">
              <option value="">Ativos e inativos</option>
              <option value="ativo">Somente ativos</option>
              <option value="inativo">Somente inativos</option>
            </select>
            <select value={sort} onChange={(e) => { setSort(e.target.value as 'name' | 'value' | 'clients'); setPage(1) }} className={selectFiltro} aria-label="Ordenação">
              <option value="name">Ordenar por nome</option>
              <option value="value">Ordenar por valor</option>
              <option value="clients">Ordenar por clientes</option>
            </select>
            <div className="inline-flex rounded-xl border border-border bg-secondary/60 p-1" role="tablist" aria-label="Visão">
              <button onClick={() => setView('cards')} aria-label="Cards" role="tab" aria-selected={view === 'cards'} className={`h-7 w-8 grid place-items-center rounded-lg transition-colors ${view === 'cards' ? 'bg-card text-marca-texto shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'}`}><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setView('table')} aria-label="Tabela" role="tab" aria-selected={view === 'table'} className={`h-7 w-8 grid place-items-center rounded-lg transition-colors ${view === 'table' ? 'bg-card text-marca-texto shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'}`}><List className="w-4 h-4" /></button>
            </div>
          </div>

          {msg && <p className="text-xs font-medium text-foreground bg-secondary/60 border border-border rounded-xl px-3 py-2">{msg}</p>}
          {error && <p className="text-xs font-medium text-destructive-texto bg-destructive-suave border border-destructive/20 rounded-xl px-3 py-2">{error}</p>}
        </div>

        {loading ? (
          <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse">
            {[...Array(6)].map((_, i) => <div key={i} className="h-44 bg-secondary rounded-[20px]" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 border-t border-border">
            <Briefcase className="w-8 h-8 text-subtle mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{items.length === 0 ? 'Nenhum serviço no catálogo ainda.' : 'Nenhum serviço com esses filtros.'}</p>
            {items.length === 0 && (
              <button onClick={() => setEditing('new')} className="text-xs font-semibold text-primary hover:underline mt-1">Cadastrar o primeiro</button>
            )}
          </div>
        ) : view === 'cards' ? (
          <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {pageItems.map((item) => (
              <div key={item.id} className={`bg-card border border-border rounded-[20px] p-5 flex flex-col gap-2.5 transition-colors hover:border-subtle/60 ${item.isActive ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-3">
                    <span className="w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-secondary text-muted-foreground"><Briefcase className="w-[18px] h-[18px]" /></span>
                    <div className="min-w-0">
                      <button onClick={() => openDetail(item)} title={item.name} className="text-[14.5px] font-semibold leading-snug text-foreground hover:text-marca-texto text-left line-clamp-2">{item.name}</button>
                      <p className="text-[11.5px] text-muted-foreground">{item.category || 'Sem categoria'} · {BILLING_LABEL[item.billingType] ?? item.billingType}</p>
                    </div>
                  </div>
                  <StatusPill ativo={item.isActive} />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{item.summary || item.scope || 'Sem resumo cadastrado.'}</p>
                <div className="flex items-end justify-between gap-2 mt-auto pt-3 border-t border-border">
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Faixa</p>
                    <p className="font-display text-[15px] font-semibold tabular text-foreground truncate">{priceRange(item)}</p>
                  </div>
                  <span className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground" title="Clientes ativos"><Users className="w-3.5 h-3.5" /> {item.activeClients}</span>
                </div>
                <div className="flex items-center gap-1 -mx-1.5">
                  <button onClick={() => setEditing(item)} className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary"><Pencil className="w-3.5 h-3.5" /> Editar</button>
                  <button onClick={() => duplicate(item)} disabled={busy === item.id} className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary disabled:opacity-50"><Copy className="w-3.5 h-3.5" /> Duplicar</button>
                  <button onClick={() => toggleActive(item)} disabled={busy === item.id} className={`flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg disabled:opacity-50 ${item.isActive ? 'text-muted-foreground hover:text-destructive-texto hover:bg-destructive-suave' : 'text-success hover:bg-success-suave'}`}><Power className="w-3.5 h-3.5" /> {item.isActive ? 'Inativar' : 'Ativar'}</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-secondary/60 border-y border-border">
                <tr>
                  <th className={`${th} pl-6`}>Serviço</th>
                  <th className={th}>Categoria</th>
                  <th className={th}>Cobrança</th>
                  <th className={th}>Faixa</th>
                  <th className={`${th} text-right`}>Clientes</th>
                  <th className={`${th} text-right`}>Receita rec.</th>
                  <th className={th}>Status</th>
                  <th className={`${th} pr-6`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((item) => (
                  <tr key={item.id} className="hover:bg-secondary/50 transition-colors">
                    <td className="px-4 pl-6 py-3.5">
                      <button onClick={() => openDetail(item)} className="font-semibold text-foreground hover:text-marca-texto text-left">{item.name}</button>
                      <p className="text-[12px] text-muted-foreground truncate max-w-[280px]">{item.summary}</p>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">{item.category || '—'}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">{BILLING_LABEL[item.billingType] ?? item.billingType}</td>
                    <td className="px-4 py-3.5 text-foreground tabular">{priceRange(item)}</td>
                    <td className="px-4 py-3.5 text-foreground text-right tabular">{item.activeClients}</td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap"><span className="font-display font-semibold tabular text-foreground">{brl(item.recurringCents)}</span><span className="text-[11px] text-muted-foreground">/mês</span></td>
                    <td className="px-4 py-3.5"><StatusPill ativo={item.isActive} /></td>
                    <td className="px-4 pr-6 py-3.5 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(item)} aria-label="Editar" title="Editar" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => duplicate(item)} aria-label="Duplicar" title="Duplicar" disabled={busy === item.id} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50"><Copy className="w-4 h-4" /></button>
                      <button onClick={() => toggleActive(item)} aria-label={item.isActive ? 'Inativar' : 'Ativar'} title={item.isActive ? 'Inativar' : 'Ativar'} disabled={busy === item.id} className="p-2 rounded-lg text-muted-foreground hover:text-destructive-texto hover:bg-destructive-suave disabled:opacity-50"><Power className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-border text-xs">
            <span className="text-muted-foreground">Página {currentPage} de {pages}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 px-3 border border-border bg-card rounded-lg font-medium text-foreground hover:bg-accent disabled:opacity-40">Anterior</button>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={currentPage === pages} className="h-8 px-3 border border-border bg-card rounded-lg font-medium text-foreground hover:bg-accent disabled:opacity-40">Próxima</button>
            </div>
          </div>
        )}
      </section>

      {editing && (
        <CatalogForm
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); setMsg(m); reload() }}
        />
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center sm:p-4" onClick={() => setDetail(null)}>
          <div className="bg-card w-full sm:max-w-2xl rounded-t-[24px] sm:rounded-[24px] border border-border shadow-xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-4 sm:p-5 border-b border-border sticky top-0 bg-card">
              <div className="min-w-0">
                <h3 className="font-display text-[18px] font-semibold tracking-[-0.01em] text-foreground">{detail.item.name}</h3>
                <p className="text-xs text-muted-foreground">{detail.item.category || 'Sem categoria'} · {BILLING_LABEL[detail.item.billingType] ?? detail.item.billingType} · Faixa sugerida: {priceRange(detail.item)}</p>
              </div>
              <button onClick={() => setDetail(null)} aria-label="Fechar" className="p-1.5 hover:bg-secondary rounded-lg"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-4 sm:p-5 space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Clientes ativos', String(detail.stats.activeClients), Users],
                  ['Receita recorrente', `${brl(detail.stats.recurringCents)}/mês`, TrendingUp],
                  ['Já recebido', brl(detail.stats.receivedCents), Check],
                ].map(([label, value, Icon]) => {
                  const I = Icon as React.ElementType
                  return (
                    <div key={label as string} className="bg-secondary/60 border border-border rounded-[16px] p-3.5">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1"><I className="w-3 h-3" /> {label as string}</p>
                      <p className="font-display text-[17px] font-semibold tabular text-foreground mt-1">{value as string}</p>
                    </div>
                  )
                })}
              </div>
              {detail.item.summary && <p className="text-foreground">{detail.item.summary}</p>}
              {detail.item.scope && (<div><p className="text-xs font-bold text-foreground mb-1">Escopo</p><p className="text-muted-foreground whitespace-pre-line text-xs">{detail.item.scope}</p></div>)}
              {detail.item.deliverables.length > 0 && (<div><p className="text-xs font-bold text-foreground mb-1">Entregáveis incluídos</p><ul className="list-disc list-inside text-xs text-muted-foreground">{detail.item.deliverables.map((d) => <li key={d}>{d}</li>)}</ul></div>)}
              {detail.item.exclusions.length > 0 && (<div><p className="text-xs font-bold text-foreground mb-1">Não incluído</p><ul className="list-disc list-inside text-xs text-muted-foreground">{detail.item.exclusions.map((d) => <li key={d}>{d}</li>)}</ul></div>)}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div><p className="text-muted-foreground">Prazo médio</p><p className="text-foreground font-medium">{detail.item.leadTimeDays ? `${detail.item.leadTimeDays} dias` : '—'}</p></div>
                <div><p className="text-muted-foreground">Periodicidade</p><p className="text-foreground font-medium">{detail.item.periodicity || '—'}</p></div>
                <div><p className="text-muted-foreground">Criado em</p><p className="text-foreground font-medium">{new Date(detail.item.createdAt).toLocaleDateString('pt-BR')}</p></div>
                <div><p className="text-muted-foreground">Atualizado em</p><p className="text-foreground font-medium">{new Date(detail.item.updatedAt).toLocaleDateString('pt-BR')}</p></div>
              </div>
              {detail.item.internalNotes && <p className="text-[11px] text-muted-foreground bg-secondary/60 rounded-lg p-2">Interno: {detail.item.internalNotes}</p>}

              <div>
                <p className="text-xs font-bold text-foreground mb-2">Clientes que contratam</p>
                {detail.contracts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum cliente contratou este serviço ainda.</p>
                ) : (
                  <div className="divide-y divide-border border border-border rounded-lg">
                    {detail.contracts.map((c) => {
                      const st = STATUS_LABEL[c.status] ?? { label: c.status, cls: 'bg-secondary text-muted-foreground' }
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <Link href={`/clientes/${c.clientId}`} className="text-sm font-medium text-foreground hover:text-marca-texto flex items-center gap-1.5">
                              <span className="truncate">{c.clientName}</span> <GrupoCliente tier={c.clientTier} />
                            </Link>
                            <p className="text-[11px] text-muted-foreground">
                              {BILLING_LABEL[c.contractType] ?? c.contractType}
                              {c.competence ? ` · ${c.competence.split('-').reverse().join('/')}` : ''}
                              {c.startDate ? ` · desde ${new Date(c.startDate).toLocaleDateString('pt-BR')}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-foreground">{brl(c.cents)}{c.contractType === 'AVULSO' ? '' : '/mês'}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------- form ---------------------------------- */

function CatalogForm({ item, onClose, onSaved }: { item: CatalogItem | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState(() => item ? {
    name: item.name, category: item.category ?? '', summary: item.summary ?? '', scope: item.scope ?? '',
    deliverables: item.deliverables.join('\n'), exclusions: item.exclusions.join('\n'),
    leadTimeDays: item.leadTimeDays ? String(item.leadTimeDays) : '', periodicity: item.periodicity ?? 'MENSAL',
    billingType: item.billingType, minValue: item.minCents != null ? maskMoney(String(item.minCents)) : '',
    maxValue: item.maxCents != null ? maskMoney(String(item.maxCents)) : '',
    defaultValue: item.defaultCents != null ? maskMoney(String(item.defaultCents)) : '',
    isActive: item.isActive, internalNotes: item.internalNotes ?? '',
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true); setError(null)
    try {
      const payload = {
        name: form.name, category: form.category || null, summary: form.summary || null, scope: form.scope || null,
        deliverables: form.deliverables.split('\n').map((s) => s.trim()).filter(Boolean),
        exclusions: form.exclusions.split('\n').map((s) => s.trim()).filter(Boolean),
        leadTimeDays: form.leadTimeDays || null, periodicity: form.periodicity || null, billingType: form.billingType,
        minCents: form.minValue ? toCents(form.minValue) : null,
        maxCents: form.maxValue ? toCents(form.maxValue) : null,
        defaultCents: form.defaultValue ? toCents(form.defaultValue) : null,
        isActive: form.isActive, internalNotes: form.internalNotes || null,
      }
      const res = await fetch(item ? `/api/servicos/${item.id}` : '/api/servicos', {
        method: item ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setError(b.error || 'Não foi possível salvar.'); return }
      onSaved(item ? 'Serviço atualizado.' : 'Serviço cadastrado.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-2xl rounded-t-[24px] sm:rounded-[24px] border border-border shadow-xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border sticky top-0 bg-card">
          <h3 className="font-display text-[18px] font-semibold tracking-[-0.01em] text-foreground">{item ? 'Editar serviço' : 'Cadastrar serviço'}</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-secondary rounded-lg"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="p-4 sm:p-5 space-y-3">
          {error && <p className="text-xs text-destructive-texto bg-destructive-suave border border-destructive/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className="block text-[13px] font-medium text-foreground mb-1.5">Nome *</label><input value={form.name} onChange={(e) => set('name', e.target.value)} className={campo} /></div>
            <div><label className="block text-[13px] font-medium text-foreground mb-1.5">Categoria</label><input value={form.category} onChange={(e) => set('category', e.target.value)} className={campo} placeholder="Ex: Social Media, Tráfego, Site" /></div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5">Tipo de cobrança padrão</label>
              <select value={form.billingType} onChange={(e) => set('billingType', e.target.value)} className={campo}>
                {Object.entries(BILLING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><label className="block text-[13px] font-medium text-foreground mb-1.5">Descrição resumida</label><input value={form.summary} onChange={(e) => set('summary', e.target.value)} className={campo} maxLength={600} /></div>
            <div className="sm:col-span-2"><label className="block text-[13px] font-medium text-foreground mb-1.5">Escopo completo</label><textarea value={form.scope} onChange={(e) => set('scope', e.target.value)} rows={4} className={campoTexto} /></div>
            <div><label className="block text-[13px] font-medium text-foreground mb-1.5">Entregáveis incluídos (um por linha)</label><textarea value={form.deliverables} onChange={(e) => set('deliverables', e.target.value)} rows={4} className={campoTexto} /></div>
            <div><label className="block text-[13px] font-medium text-foreground mb-1.5">Itens não incluídos (um por linha)</label><textarea value={form.exclusions} onChange={(e) => set('exclusions', e.target.value)} rows={4} className={campoTexto} /></div>
            <div><label className="block text-[13px] font-medium text-foreground mb-1.5">Prazo médio (dias)</label><input type="number" min={0} value={form.leadTimeDays} onChange={(e) => set('leadTimeDays', e.target.value)} className={campo} /></div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5">Periodicidade sugerida</label>
              <select value={form.periodicity} onChange={(e) => set('periodicity', e.target.value)} className={campo}>
                <option value="MENSAL">Mensal</option>
                <option value="UNICO">Único</option>
                <option value="PROJETO">Projeto</option>
              </select>
            </div>
            <div><label className="block text-[13px] font-medium text-foreground mb-1.5">Valor mínimo sugerido (R$)</label><input value={form.minValue} onChange={(e) => set('minValue', maskMoney(e.target.value))} className={campo} inputMode="numeric" /></div>
            <div><label className="block text-[13px] font-medium text-foreground mb-1.5">Valor máximo sugerido (R$)</label><input value={form.maxValue} onChange={(e) => set('maxValue', maskMoney(e.target.value))} className={campo} inputMode="numeric" /></div>
            <div><label className="block text-[13px] font-medium text-foreground mb-1.5">Valor padrão (opcional)</label><input value={form.defaultValue} onChange={(e) => set('defaultValue', maskMoney(e.target.value))} className={campo} inputMode="numeric" /></div>
            <label className="flex items-center gap-2 text-sm text-foreground mt-6"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Serviço ativo</label>
            <div className="sm:col-span-2"><label className="block text-[13px] font-medium text-foreground mb-1.5">Observações internas</label><textarea value={form.internalNotes} onChange={(e) => set('internalNotes', e.target.value)} rows={2} className={campoTexto} /></div>
          </div>
          <p className="text-[11px] text-muted-foreground">A faixa é referência comercial: na contratação o valor negociado pode ser diferente (o sistema avisa, mas não bloqueia).</p>
        </div>
        <div className="flex justify-end gap-2 p-4 sm:p-5 border-t border-border sticky bottom-0 bg-card">
          <button onClick={onClose} disabled={saving} className="h-9 px-3 rounded-lg text-[13.5px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50">Cancelar</button>
          <button onClick={save} disabled={saving || !form.name.trim()} className="inline-flex items-center gap-1.5 h-9 px-4 bg-primary text-primary-foreground rounded-lg text-[13.5px] font-medium hover:bg-primary-hover disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
