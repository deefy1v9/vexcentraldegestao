'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Plus, Search, LayoutGrid, List, Copy, Pencil, Power, X, Loader2, Briefcase, Users, TrendingUp, Check,
} from 'lucide-react'
import TierBadge from '@/components/ui/TierBadge'

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
  ATIVO: { label: 'Ativo', cls: 'bg-green-100 text-green-700' },
  PAUSADO: { label: 'Pausado', cls: 'bg-orange-100 text-orange-700' },
  ENCERRADO: { label: 'Encerrado', cls: 'bg-gray-100 text-gray-600' },
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

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Pesquisar serviço" className="input" style={{ paddingLeft: '2.25rem' }} />
        </div>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} className="input text-xs w-auto">
          <option value="">Todas as categorias</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value as '' | 'ativo' | 'inativo'); setPage(1) }} className="input text-xs w-auto">
          <option value="">Ativos e inativos</option>
          <option value="ativo">Somente ativos</option>
          <option value="inativo">Somente inativos</option>
        </select>
        <select value={sort} onChange={(e) => { setSort(e.target.value as 'name' | 'value' | 'clients'); setPage(1) }} className="input text-xs w-auto">
          <option value="name">Ordenar por nome</option>
          <option value="value">Ordenar por valor</option>
          <option value="clients">Ordenar por clientes</option>
        </select>
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setView('cards')} aria-label="Cards" className={`p-1.5 rounded-md ${view === 'cards' ? 'bg-white text-[#030A8C] shadow-sm' : 'text-gray-500'}`}><LayoutGrid className="w-4 h-4" /></button>
          <button onClick={() => setView('table')} aria-label="Tabela" className={`p-1.5 rounded-md ${view === 'table' ? 'bg-white text-[#030A8C] shadow-sm' : 'text-gray-500'}`}><List className="w-4 h-4" /></button>
        </div>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1.5 bg-[#030A8C] text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-[#02077a] transition-colors">
          <Plus className="w-3.5 h-3.5" /> Cadastrar serviço
        </button>
      </div>

      {msg && <p className="text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{msg}</p>}
      {error && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
          {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14 bg-white border border-gray-200 rounded-xl">
          <Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">{items.length === 0 ? 'Nenhum serviço no catálogo ainda.' : 'Nenhum serviço com esses filtros.'}</p>
          {items.length === 0 && (
            <button onClick={() => setEditing('new')} className="text-xs font-semibold text-[#030A8C] hover:underline mt-1">Cadastrar o primeiro</button>
          )}
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pageItems.map((item) => (
            <div key={item.id} className={`bg-white border rounded-xl p-4 flex flex-col gap-2 ${item.isActive ? 'border-gray-200' : 'border-gray-200 opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button onClick={() => openDetail(item)} className="text-sm font-bold text-gray-900 hover:text-[#030A8C] text-left truncate block max-w-full">{item.name}</button>
                  <p className="text-[11px] text-gray-500">{item.category || 'Sem categoria'} · {BILLING_LABEL[item.billingType] ?? item.billingType}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${item.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {item.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <p className="text-xs text-gray-600 line-clamp-2 min-h-[2rem]">{item.summary || item.scope || 'Sem resumo cadastrado.'}</p>
              <div className="flex items-center justify-between text-[11px] text-gray-500 mt-auto pt-2 border-t border-gray-100">
                <span className="font-medium text-gray-900">{priceRange(item)}</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {item.activeClients}</span>
              </div>
              <div className="flex items-center gap-1 pt-1">
                <button onClick={() => setEditing(item)} className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-[#030A8C] px-2 py-1 rounded-lg hover:bg-gray-100"><Pencil className="w-3 h-3" /> Editar</button>
                <button onClick={() => duplicate(item)} disabled={busy === item.id} className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-[#030A8C] px-2 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-50"><Copy className="w-3 h-3" /> Duplicar</button>
                <button onClick={() => toggleActive(item)} disabled={busy === item.id} className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg disabled:opacity-50 ${item.isActive ? 'text-gray-600 hover:text-red-600 hover:bg-red-50' : 'text-green-700 hover:bg-green-50'}`}><Power className="w-3 h-3" /> {item.isActive ? 'Inativar' : 'Ativar'}</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5">Serviço</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5">Cobrança</th>
                <th className="px-4 py-2.5">Faixa</th>
                <th className="px-4 py-2.5">Clientes</th>
                <th className="px-4 py-2.5">Receita rec.</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button onClick={() => openDetail(item)} className="font-semibold text-gray-900 hover:text-[#030A8C] text-left">{item.name}</button>
                    <p className="text-[11px] text-gray-400 truncate max-w-[280px]">{item.summary}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.category || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{BILLING_LABEL[item.billingType] ?? item.billingType}</td>
                  <td className="px-4 py-3 text-gray-900">{priceRange(item)}</td>
                  <td className="px-4 py-3 text-gray-900">{item.activeClients}</td>
                  <td className="px-4 py-3 text-gray-900">{brl(item.recurringCents)}/mês</td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{item.isActive ? 'Ativo' : 'Inativo'}</span></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setEditing(item)} aria-label="Editar" className="p-1.5 text-gray-400 hover:text-[#030A8C]"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => duplicate(item)} aria-label="Duplicar" disabled={busy === item.id} className="p-1.5 text-gray-400 hover:text-[#030A8C] disabled:opacity-50"><Copy className="w-3.5 h-3.5" /></button>
                    <button onClick={() => toggleActive(item)} aria-label={item.isActive ? 'Inativar' : 'Ativar'} disabled={busy === item.id} className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50"><Power className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40">Anterior</button>
          <span className="text-gray-500">{currentPage} / {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={currentPage === pages} className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40">Próxima</button>
        </div>
      )}

      {editing && (
        <CatalogForm
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); setMsg(m); reload() }}
        />
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center sm:p-4" onClick={() => setDetail(null)}>
          <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white">
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900">{detail.item.name}</h3>
                <p className="text-xs text-gray-500">{detail.item.category || 'Sem categoria'} · {BILLING_LABEL[detail.item.billingType] ?? detail.item.billingType} · Faixa sugerida: {priceRange(detail.item)}</p>
              </div>
              <button onClick={() => setDetail(null)} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
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
                    <div key={label as string} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 flex items-center gap-1"><I className="w-3 h-3" /> {label as string}</p>
                      <p className="text-sm font-bold text-gray-900 mt-0.5">{value as string}</p>
                    </div>
                  )
                })}
              </div>
              {detail.item.summary && <p className="text-gray-700">{detail.item.summary}</p>}
              {detail.item.scope && (<div><p className="text-xs font-bold text-gray-900 mb-1">Escopo</p><p className="text-gray-600 whitespace-pre-line text-xs">{detail.item.scope}</p></div>)}
              {detail.item.deliverables.length > 0 && (<div><p className="text-xs font-bold text-gray-900 mb-1">Entregáveis incluídos</p><ul className="list-disc list-inside text-xs text-gray-600">{detail.item.deliverables.map((d) => <li key={d}>{d}</li>)}</ul></div>)}
              {detail.item.exclusions.length > 0 && (<div><p className="text-xs font-bold text-gray-900 mb-1">Não incluído</p><ul className="list-disc list-inside text-xs text-gray-600">{detail.item.exclusions.map((d) => <li key={d}>{d}</li>)}</ul></div>)}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div><p className="text-gray-400">Prazo médio</p><p className="text-gray-900 font-medium">{detail.item.leadTimeDays ? `${detail.item.leadTimeDays} dias` : '—'}</p></div>
                <div><p className="text-gray-400">Periodicidade</p><p className="text-gray-900 font-medium">{detail.item.periodicity || '—'}</p></div>
                <div><p className="text-gray-400">Criado em</p><p className="text-gray-900 font-medium">{new Date(detail.item.createdAt).toLocaleDateString('pt-BR')}</p></div>
                <div><p className="text-gray-400">Atualizado em</p><p className="text-gray-900 font-medium">{new Date(detail.item.updatedAt).toLocaleDateString('pt-BR')}</p></div>
              </div>
              {detail.item.internalNotes && <p className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-2">Interno: {detail.item.internalNotes}</p>}

              <div>
                <p className="text-xs font-bold text-gray-900 mb-2">Clientes que contratam</p>
                {detail.contracts.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhum cliente contratou este serviço ainda.</p>
                ) : (
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                    {detail.contracts.map((c) => {
                      const st = STATUS_LABEL[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-600' }
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <Link href={`/clientes/${c.clientId}`} className="text-sm font-medium text-gray-900 hover:text-[#030A8C] flex items-center gap-1.5">
                              <span className="truncate">{c.clientName}</span> <TierBadge tier={c.clientTier} />
                            </Link>
                            <p className="text-[11px] text-gray-400">
                              {BILLING_LABEL[c.contractType] ?? c.contractType}
                              {c.competence ? ` · ${c.competence.split('-').reverse().join('/')}` : ''}
                              {c.startDate ? ` · desde ${new Date(c.startDate).toLocaleDateString('pt-BR')}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-gray-900">{brl(c.cents)}{c.contractType === 'AVULSO' ? '' : '/mês'}</p>
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
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-bold text-gray-900">{item ? 'Editar serviço' : 'Cadastrar serviço'}</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-4 sm:p-5 space-y-3">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label><input value={form.name} onChange={(e) => set('name', e.target.value)} className="input" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Categoria</label><input value={form.category} onChange={(e) => set('category', e.target.value)} className="input" placeholder="Ex: Social Media, Tráfego, Site" /></div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de cobrança padrão</label>
              <select value={form.billingType} onChange={(e) => set('billingType', e.target.value)} className="input">
                {Object.entries(BILLING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-700 mb-1">Descrição resumida</label><input value={form.summary} onChange={(e) => set('summary', e.target.value)} className="input" maxLength={600} /></div>
            <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-700 mb-1">Escopo completo</label><textarea value={form.scope} onChange={(e) => set('scope', e.target.value)} rows={4} className="input resize-none" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Entregáveis incluídos (um por linha)</label><textarea value={form.deliverables} onChange={(e) => set('deliverables', e.target.value)} rows={4} className="input resize-none" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Itens não incluídos (um por linha)</label><textarea value={form.exclusions} onChange={(e) => set('exclusions', e.target.value)} rows={4} className="input resize-none" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Prazo médio (dias)</label><input type="number" min={0} value={form.leadTimeDays} onChange={(e) => set('leadTimeDays', e.target.value)} className="input" /></div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Periodicidade sugerida</label>
              <select value={form.periodicity} onChange={(e) => set('periodicity', e.target.value)} className="input">
                <option value="MENSAL">Mensal</option>
                <option value="UNICO">Único</option>
                <option value="PROJETO">Projeto</option>
              </select>
            </div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Valor mínimo sugerido (R$)</label><input value={form.minValue} onChange={(e) => set('minValue', maskMoney(e.target.value))} className="input" inputMode="numeric" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Valor máximo sugerido (R$)</label><input value={form.maxValue} onChange={(e) => set('maxValue', maskMoney(e.target.value))} className="input" inputMode="numeric" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Valor padrão (opcional)</label><input value={form.defaultValue} onChange={(e) => set('defaultValue', maskMoney(e.target.value))} className="input" inputMode="numeric" /></div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mt-6"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Serviço ativo</label>
            <div className="sm:col-span-2"><label className="block text-xs font-medium text-gray-700 mb-1">Observações internas</label><textarea value={form.internalNotes} onChange={(e) => set('internalNotes', e.target.value)} rows={2} className="input resize-none" /></div>
          </div>
          <p className="text-[11px] text-gray-400">A faixa é referência comercial: na contratação o valor negociado pode ser diferente (o sistema avisa, mas não bloqueia).</p>
        </div>
        <div className="flex justify-end gap-2 p-4 sm:p-5 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} disabled={saving} className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50">Cancelar</button>
          <button onClick={save} disabled={saving || !form.name.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
