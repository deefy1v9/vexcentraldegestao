'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Plus, Search, LayoutGrid, List, X, Loader2, AlertTriangle, Clock, FileText,
  MoreVertical, ArrowRight, CalendarClock,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import CurrencyInput from '@/components/ui/CurrencyInput'
import TierBadge from '@/components/ui/TierBadge'
import {
  STAGES, STAGE_LABEL, opportunityTotals, daysBetween, isFollowUpLate, type Stage,
} from '@/lib/pipeline-core'
import OpportunityDrawer, { type Opportunity, type CatalogOption } from '@/components/pipeline/OpportunityDrawer'
import {
  EMPTY_FILTERS, FilterChips, FiltersButton, OwnerSelect,
  type PipelineFilterState,
} from '@/components/pipeline/PipelineFilters'

interface Owner { id: string; name: string }

const STAGE_COLOR: Record<Stage, string> = {
  NOVO: 'bg-gray-100 text-gray-600',
  EM_CONTATO: 'bg-blue-50 text-blue-700',
  QUALIFICADO: 'bg-indigo-50 text-indigo-700',
  PROPOSTA_ENVIADA: 'bg-[#030A8C]/10 text-[#030A8C]',
  EM_NEGOCIACAO: 'bg-[#F74A13]/10 text-[#F74A13]',
  GANHO: 'bg-green-100 text-green-700',
  PERDIDO: 'bg-red-50 text-red-600',
}

const brl = (cents: number) => formatCurrency(cents / 100)
const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

/**
 * Quadro comercial: barra compacta de busca e filtros, Kanban com arrastar e
 * soltar e a ação "Mover para" como alternativa acessível por teclado e no
 * celular. Filtros e visualização vivem na URL. Toda mudança de etapa passa
 * pelo servidor, com as mesmas validações — inclusive a conversão no ganho.
 */
export default function PipelineBoard({ isAdmin, currentUserId }: { isAdmin: boolean; currentUserId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [owners, setOwners] = useState<Owner[]>([])
  const [catalog, setCatalog] = useState<CatalogOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [loss, setLoss] = useState<Opportunity | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [mobileStage, setMobileStage] = useState<Stage>('NOVO')

  /* ------------------------- estado que vive na URL ------------------------- */
  const view = params.get('visao') === 'lista' ? 'lista' : 'kanban'
  const filters: PipelineFilterState = useMemo(() => ({
    q: params.get('q') ?? '',
    owner: params.get('responsavel') ?? '',
    source: params.get('origem') ?? '',
    service: params.get('servico') ?? '',
    stage: params.get('etapa') ?? '',
    dueUntil: params.get('ate') ?? '',
    lateOnly: params.get('atrasadas') === '1',
    noActionOnly: params.get('semAcao') === '1',
    noForecastOnly: params.get('semPrevisao') === '1',
  }), [params])

  // Busca digitada acompanha a URL sem efeito: ajuste no próprio render
  const [searchDraft, setSearchDraft] = useState(filters.q)
  const [urlQ, setUrlQ] = useState(filters.q)
  if (urlQ !== filters.q) { setUrlQ(filters.q); setSearchDraft(filters.q) }

  const push = useCallback((next: Partial<PipelineFilterState> & { view?: 'kanban' | 'lista' }) => {
    const merged = { ...filters, ...next }
    const q = new URLSearchParams()
    q.set('visao', next.view ?? view)
    if (merged.q) q.set('q', merged.q)
    if (merged.owner) q.set('responsavel', merged.owner)
    if (merged.source) q.set('origem', merged.source)
    if (merged.service) q.set('servico', merged.service)
    if (merged.stage) q.set('etapa', merged.stage)
    if (merged.dueUntil) q.set('ate', merged.dueUntil)
    if (merged.lateOnly) q.set('atrasadas', '1')
    if (merged.noActionOnly) q.set('semAcao', '1')
    if (merged.noForecastOnly) q.set('semPrevisao', '1')
    router.replace(`${pathname}?${q.toString()}`, { scroll: false })
  }, [filters, view, router, pathname])

  // A busca digitada entra na URL com um respiro, para não navegar a cada tecla
  useEffect(() => {
    if (searchDraft === filters.q) return
    const t = setTimeout(() => push({ q: searchDraft }), 350)
    return () => clearTimeout(t)
  }, [searchDraft, filters.q, push])

  /* ------------------------------- dados ------------------------------- */
  const load = useCallback(() => {
    fetch('/api/pipeline')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => {
        setOpportunities(b.opportunities ?? [])
        setOwners(b.owners ?? [])
        setCatalog(b.catalog ?? [])
      })
      .catch(() => setError('Não foi possível carregar o pipeline.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  const reload = useCallback(() => { setLoading(true); setError(null); load() }, [load])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 6000)
    return () => clearTimeout(t)
  }, [flash])

  const hoje = useMemo(() => new Date(), [])
  const sources = useMemo(
    () => [...new Set(opportunities.map((o) => o.source).filter((s): s is string => !!s))].sort(),
    [opportunities],
  )
  const services = useMemo(
    () => [...new Set(opportunities.flatMap((o) => o.items.map((i) => i.name)))].sort(),
    [opportunities],
  )

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return opportunities.filter((o) => {
      const nome = o.client?.name ?? o.prospect?.tradeName ?? o.prospect?.name ?? ''
      if (q && !`${o.title} ${nome}`.toLowerCase().includes(q)) return false
      if (filters.owner && o.ownerId !== filters.owner) return false
      if (filters.source && o.source !== filters.source) return false
      if (filters.stage && o.stage !== filters.stage) return false
      if (filters.service && !o.items.some((i) => i.name === filters.service)) return false
      if (filters.dueUntil && (!o.expectedCloseDate || String(o.expectedCloseDate).slice(0, 10) > filters.dueUntil)) return false
      if (filters.lateOnly && !isFollowUpLate(o.nextActionAt, hoje)) return false
      if (filters.noActionOnly && o.nextAction) return false
      if (filters.noForecastOnly && o.expectedCloseDate) return false
      return true
    })
  }, [opportunities, filters, hoje])

  const byStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>()
    for (const s of STAGES) map.set(s, [])
    for (const o of filtered) map.get(o.stage)?.push(o)
    return map
  }, [filtered])

  /* ------------------------------- ações ------------------------------- */
  async function moveTo(opp: Opportunity, stage: Stage) {
    if (opp.stage === stage) return
    if (stage === 'PERDIDO') { setLoss(opp); return }
    if (stage === 'GANHO') { setOpenId(opp.id); setFlash('Confira o fechamento para converter em cliente.'); return }

    setBusy(opp.id)
    try {
      const res = await fetch(`/api/pipeline/${opp.id}/etapa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setFlash(body.error || 'Não foi possível mover.'); return }
      setOpportunities((prev) => prev.map((o) => (o.id === opp.id ? { ...o, stage, stageChangedAt: new Date().toISOString() } : o)))
    } finally { setBusy(null) }
  }

  function columnTotals(list: Opportunity[]) {
    let rec = 0, pontual = 0
    for (const o of list) {
      const t = opportunityTotals(o.items, o.estimateCents)
      rec += t.recorrenteCents
      pontual += t.avulsoCents + t.projetoMensalCents
    }
    return { rec, pontual }
  }

  const colunas = filters.stage ? STAGES.filter((s) => s === filters.stage) : STAGES
  const etapaCelular = colunas.includes(mobileStage) ? mobileStage : colunas[0]
  const ownerName = owners.find((o) => o.id === filters.owner)?.name ?? null

  return (
    <div className="space-y-3">
      {/* Cabeçalho: contexto à esquerda, ação principal à direita */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-500">
          {loading ? 'Carregando negociações…' : `${filtered.length} negociação(ões) no funil comercial.`}
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="shrink-0 h-10 px-4 inline-flex items-center gap-1.5 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo lead
        </button>
      </div>

      {/* Barra compacta */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-[400px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Buscar negociação ou cliente"
            aria-label="Buscar negociação ou cliente"
            className="w-full h-10 pl-9 pr-8 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#030A8C]"
          />
          {searchDraft && (
            <button
              onClick={() => { setSearchDraft(''); push({ q: '' }) }}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>

        <OwnerSelect owners={owners} value={filters.owner} onChange={(id) => push({ owner: id })} />
        <FiltersButton filters={filters} sources={sources} services={services} onApply={(next) => push(next)} />

        <div className="ml-auto flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 h-10">
          <button
            onClick={() => push({ view: 'kanban' })}
            aria-label="Ver como Kanban"
            aria-pressed={view === 'kanban'}
            className={`px-2.5 h-9 rounded-md flex items-center ${view === 'kanban' ? 'bg-white text-[#030A8C] shadow-sm' : 'text-gray-500'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => push({ view: 'lista' })}
            aria-label="Ver como lista"
            aria-pressed={view === 'lista'}
            className={`px-2.5 h-9 rounded-md flex items-center ${view === 'lista' ? 'bg-white text-[#030A8C] shadow-sm' : 'text-gray-500'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      <FilterChips
        filters={filters}
        ownerName={ownerName}
        onRemove={(key) => push({ [key]: typeof filters[key] === 'boolean' ? false : '' } as Partial<PipelineFilterState>)}
        onClear={() => push({ ...EMPTY_FILTERS })}
      />

      {flash && <p className="text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{flash}</p>}
      {error && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[...Array(4)].map((_, i) => <div key={i} className="h-64 w-[300px] shrink-0 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : view === 'lista' ? (
        <ListView list={filtered} onOpen={setOpenId} />
      ) : (
        <>
          {/* Celular e tablet: uma etapa por vez, sem depender de arrastar */}
          <div className="lg:hidden space-y-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {colunas.map((s) => (
                <button
                  key={s}
                  onClick={() => setMobileStage(s)}
                  aria-pressed={etapaCelular === s}
                  className={`text-[11px] font-semibold px-2.5 h-8 rounded-full whitespace-nowrap border ${
                    etapaCelular === s ? 'bg-[#030A8C] text-white border-[#030A8C]' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {STAGE_LABEL[s]} · {byStage.get(s)?.length ?? 0}
                </button>
              ))}
            </div>
            <Column
              stage={etapaCelular}
              list={byStage.get(etapaCelular) ?? []}
              totals={columnTotals(byStage.get(etapaCelular) ?? [])}
              onOpen={setOpenId}
              onMove={moveTo}
              busy={busy}
              today={hoje}
              draggable={false}
            />
          </div>

          {/* Desktop: rolagem horizontal apenas dentro do quadro */}
          <div className="hidden lg:flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {colunas.map((stage) => {
              const list = byStage.get(stage) ?? []
              return (
                <div
                  key={stage}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const opp = opportunities.find((o) => o.id === dragging)
                    setDragging(null)
                    if (opp) moveTo(opp, stage)
                  }}
                  className="w-[300px] shrink-0"
                >
                  <Column
                    stage={stage}
                    list={list}
                    totals={columnTotals(list)}
                    onOpen={setOpenId}
                    onMove={moveTo}
                    busy={busy}
                    today={hoje}
                    draggable
                    onDragStart={setDragging}
                  />
                </div>
              )
            })}
          </div>
        </>
      )}

      {showNew && (
        <NewOpportunityModal
          owners={owners}
          defaultOwnerId={currentUserId}
          onClose={() => setShowNew(false)}
          onCreated={(msg) => { setShowNew(false); setFlash(msg); reload() }}
        />
      )}

      {loss && (
        <LossModal
          opportunity={loss}
          onClose={() => setLoss(null)}
          onDone={(msg) => { setLoss(null); setFlash(msg); reload() }}
        />
      )}

      {openId && (
        <OpportunityDrawer
          id={openId}
          isAdmin={isAdmin}
          owners={owners}
          catalog={catalog}
          onClose={() => setOpenId(null)}
          onChanged={(msg) => { if (msg) setFlash(msg); reload() }}
        />
      )}
    </div>
  )
}

/* --------------------------------- coluna --------------------------------- */

function Column({
  stage, list, totals, onOpen, onMove, busy, today, draggable, onDragStart,
}: {
  stage: Stage
  list: Opportunity[]
  totals: { rec: number; pontual: number }
  onOpen: (id: string) => void
  onMove: (opp: Opportunity, stage: Stage) => void
  busy: string | null
  today: Date
  draggable: boolean
  onDragStart?: (id: string) => void
}) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 flex flex-col max-h-[calc(100dvh-330px)] min-h-[180px]">
      <div className="px-3 py-2.5 border-b border-gray-200 bg-gray-50 rounded-t-xl">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLOR[stage]}`}>{STAGE_LABEL[stage]}</span>
          <span className="text-[11px] font-semibold text-gray-500">{list.length}</span>
        </div>
        <p className="text-[10px] text-gray-500 mt-1">
          {brl(totals.rec)}<span className="text-gray-400">/mês</span>
          {totals.pontual > 0 && <span className="text-purple-700"> · {brl(totals.pontual)} pontual</span>}
        </p>
      </div>
      <div className="p-2 space-y-2 overflow-y-auto">
        {list.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-4">Nenhuma negociação</p>
        ) : list.map((o) => (
          <Card key={o.id} opp={o} onOpen={onOpen} onMove={onMove} busy={busy === o.id} today={today} draggable={draggable} onDragStart={onDragStart} />
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------- card ---------------------------------- */

function Card({
  opp, onOpen, onMove, busy, today, draggable, onDragStart,
}: {
  opp: Opportunity
  onOpen: (id: string) => void
  onMove: (opp: Opportunity, stage: Stage) => void
  busy: boolean
  today: Date
  draggable: boolean
  onDragStart?: (id: string) => void
}) {
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const totals = opportunityTotals(opp.items, opp.estimateCents)
  const nome = opp.client?.name ?? opp.prospect?.tradeName ?? opp.prospect?.name ?? 'Sem contato'
  const atrasado = isFollowUpLate(opp.nextActionAt, today)
  const pontual = totals.avulsoCents + totals.projetoMensalCents
  const semValor = totals.itemCount === 0 && !totals.usandoEstimativa

  useEffect(() => {
    if (!menu) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [menu])

  return (
    <div
      ref={ref}
      draggable={draggable}
      onDragStart={() => onDragStart?.(opp.id)}
      className={`relative bg-white border rounded-lg p-3 ${busy ? 'opacity-50' : ''} ${atrasado ? 'border-red-200' : 'border-gray-200'} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-start justify-between gap-1">
        <button onClick={() => onOpen(opp.id)} className="text-left min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{opp.title}</p>
          <p className="text-[11px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
            {nome}
            {opp.client && <TierBadge tier={opp.client.tier} />}
          </p>
        </button>
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label="Ações da negociação"
          aria-haspopup="menu"
          aria-expanded={menu}
          className="p-1 -mr-1 rounded hover:bg-gray-100 text-gray-400 shrink-0"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {menu && (
        <div className="absolute right-2 top-9 z-30 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1" role="menu">
          <button
            onClick={() => { setMenu(false); onOpen(opp.id) }}
            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            Abrir detalhes
          </button>
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Mover para</p>
          {STAGES.filter((s) => s !== opp.stage).map((s) => (
            <button
              key={s}
              onClick={() => { setMenu(false); onMove(opp, s) }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
              role="menuitem"
            >
              <ArrowRight className="w-3 h-3 text-gray-300" /> {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 text-xs">
        {totals.usandoEstimativa ? (
          <p className="font-bold text-gray-700">{brl(totals.totalContratoCents)} <span className="text-[10px] font-medium text-gray-400">estimado</span></p>
        ) : semValor ? (
          <p className="text-[11px] font-medium text-amber-700">Sem valor informado</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-2">
            {totals.recorrenteCents > 0 && (
              <p className="font-bold text-[#030A8C]">{brl(totals.recorrenteCents)}<span className="text-[10px] font-medium text-gray-400">/mês</span></p>
            )}
            {pontual > 0 && (
              <p className={totals.recorrenteCents > 0 ? 'text-[11px] font-semibold text-purple-700' : 'text-sm font-bold text-purple-700'}>
                {brl(pontual)} <span className="text-[10px] font-medium text-gray-400">pontual</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-500">
        <span
          title={opp.owner?.name ?? ''}
          className="w-5 h-5 rounded-full bg-[#030A8C] text-white text-[9px] font-bold flex items-center justify-center shrink-0"
        >
          {iniciais(opp.owner?.name ?? '?')}
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Clock className="w-3 h-3" /> {daysBetween(opp.stageChangedAt, today)}d
        </span>
        {opp.expectedCloseDate ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <CalendarClock className="w-3 h-3" /> {formatDate(opp.expectedCloseDate)}
          </span>
        ) : (
          <span className="text-gray-400">sem previsão</span>
        )}
        {opp.proposal && <FileText className="w-3 h-3 text-[#030A8C]" aria-label="Proposta vinculada" />}
      </div>

      {opp.nextAction ? (
        <p className={`mt-1.5 text-[11px] truncate ${atrasado ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
          {opp.nextAction}{opp.nextActionAt ? ` · ${formatDate(opp.nextActionAt)}` : ''}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-amber-700 inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Sem próxima ação
        </p>
      )}
    </div>
  )
}

/* --------------------------------- lista --------------------------------- */

function ListView({ list, onOpen }: { list: Opportunity[]; onOpen: (id: string) => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm min-w-[820px]">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-2.5">Negociação</th>
            <th className="px-4 py-2.5">Etapa</th>
            <th className="px-4 py-2.5">Responsável</th>
            <th className="px-4 py-2.5">Recorrente</th>
            <th className="px-4 py-2.5">Pontual</th>
            <th className="px-4 py-2.5">Próxima ação</th>
            <th className="px-4 py-2.5">Previsão</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {list.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-xs">Nenhuma negociação</td></tr>
          ) : list.map((o) => {
            const t = opportunityTotals(o.items, o.estimateCents)
            const nome = o.client?.name ?? o.prospect?.tradeName ?? o.prospect?.name ?? '—'
            const pontual = t.avulsoCents + t.projetoMensalCents
            return (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <button onClick={() => onOpen(o.id)} className="font-semibold text-gray-900 hover:text-[#030A8C] text-left">{o.title}</button>
                  <p className="text-[11px] text-gray-400">{nome}</p>
                </td>
                <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLOR[o.stage as Stage]}`}>{STAGE_LABEL[o.stage as Stage]}</span></td>
                <td className="px-4 py-3 text-gray-600">{o.owner?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-900">{t.recorrenteCents > 0 ? `${brl(t.recorrenteCents)}/mês` : '—'}</td>
                <td className="px-4 py-3 text-gray-900">{pontual > 0 ? brl(pontual) : '—'}</td>
                <td className="px-4 py-3 text-gray-600 max-w-[220px] truncate">{o.nextAction ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{o.expectedCloseDate ? formatDate(o.expectedCloseDate) : 'sem previsão'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------- novo lead ------------------------------- */

function NewOpportunityModal({
  owners, defaultOwnerId, onClose, onCreated,
}: {
  owners: Owner[]
  defaultOwnerId: string
  onClose: () => void
  onCreated: (msg: string) => void
}) {
  const [form, setForm] = useState({
    leadName: '', title: '', ownerId: defaultOwnerId, phone: '', email: '', document: '',
    tradeName: '', source: '', notes: '', nextAction: '', nextActionAt: '', expectedCloseDate: '',
  })
  const [estimate, setEstimate] = useState<number | null>(null)
  const [mais, setMais] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))

  async function submit() {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          title: form.title || form.leadName,
          estimateCents: estimate != null ? Math.round(estimate * 100) : 0,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível criar.'); return }
      onCreated('Lead cadastrado no pipeline.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-bold text-gray-900">Novo lead</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-4 sm:p-5 space-y-3">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nome do contato ou empresa *</label>
            <input value={form.leadName} onChange={(e) => set('leadName', e.target.value)} className="input text-sm" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Responsável comercial *</label>
            <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)} className="input text-sm">
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-gray-400">Só isso já cria o lead. O resto pode entrar depois, sem travar o primeiro contato.</p>

          <button onClick={() => setMais((v) => !v)} className="text-xs font-semibold text-[#030A8C] hover:underline">
            {mais ? 'Esconder campos opcionais' : 'Completar agora (opcional)'}
          </button>

          {mais && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">Título da negociação</label><input value={form.title} onChange={(e) => set('title', e.target.value)} className="input text-sm" placeholder="Ex: Social media + tráfego" /></div>
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">WhatsApp/telefone</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">E-mail</label><input value={form.email} onChange={(e) => set('email', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">CPF/CNPJ</label><input value={form.document} onChange={(e) => set('document', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">Nome fantasia</label><input value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">Origem do lead</label><input value={form.source} onChange={(e) => set('source', e.target.value)} className="input text-sm" placeholder="Indicação, tráfego, evento..." /></div>
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">Valor estimado</label><CurrencyInput value={estimate} onChange={setEstimate} className="input text-sm" ariaLabel="Valor estimado" /></div>
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">Previsão de fechamento</label><input type="date" value={form.expectedCloseDate} onChange={(e) => set('expectedCloseDate', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">Próxima ação</label><input value={form.nextAction} onChange={(e) => set('nextAction', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">Data do próximo contato</label><input type="date" value={form.nextActionAt} onChange={(e) => set('nextActionAt', e.target.value)} className="input text-sm" /></div>
              <div className="sm:col-span-2"><label className="text-xs font-medium text-gray-600 mb-1 block">Observações</label><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="input text-sm resize-none" /></div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 sm:p-5 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} disabled={saving} className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900">Cancelar</button>
          <button onClick={submit} disabled={saving || !form.leadName.trim() || !form.ownerId} className="flex items-center gap-1.5 px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Criar lead
          </button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------- perda --------------------------------- */

function LossModal({ opportunity, onClose, onDone }: { opportunity: Opportunity; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/pipeline/${opportunity.id}/etapa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'PERDIDO', lossReason: reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível registrar a perda.'); return }
      onDone('Negociação marcada como perdida. Nenhum cliente foi criado.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-sm p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-gray-900 mb-1">Fechar como perdido</p>
        <p className="text-xs text-gray-500 mb-3 truncate">{opportunity.title}</p>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">{error}</p>}
        <label className="text-xs font-medium text-gray-600 mb-1 block">Motivo da perda *</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input text-sm resize-none" placeholder="Preço, prazo, concorrente, sem resposta..." autoFocus />
        <p className="text-[11px] text-gray-400 mt-2">Não cria cliente nem lança valores no financeiro.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={saving} className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900">Cancelar</button>
          <button onClick={submit} disabled={saving || !reason.trim()} className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-40">
            Registrar perda
          </button>
        </div>
      </div>
    </div>
  )
}
