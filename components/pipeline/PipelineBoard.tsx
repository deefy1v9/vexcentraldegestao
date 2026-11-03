'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Plus, Search, LayoutGrid, List, X, Loader2, AlertTriangle, Clock, FileText,
  MoreHorizontal, ArrowRight, CalendarClock, ChevronsLeftRight, ChevronsRightLeft, Flame,
} from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import CurrencyInput from '@/components/ui/CurrencyInput'
import TierBadge from '@/components/ui/TierBadge'
import {
  STAGES, STAGE_LABEL, opportunityTotals, daysBetween, isFollowUpLate, type Stage,
} from '@/lib/pipeline-core'
import OpportunityDrawer, { type Opportunity, type CatalogOption } from '@/components/pipeline/OpportunityDrawer'
import PortalMenu from '@/components/ui/PortalMenu'
import {
  EMPTY_FILTERS, FilterChips, FiltersButton, OwnerSelect,
  type PipelineFilterState,
} from '@/components/pipeline/PipelineFilters'
import Header from '@/components/layout/Header'
import { Button } from '@/components/vex/button'
import { Avatar } from '@/components/vex/avatar'
import { Pilulas, TOM, type Tom } from '@/components/vex/vireo'

interface Owner { id: string; name: string }

/** Selo da etapa (lista e menus). "Em negociação" é âmbar, como no resto do sistema. */
const STAGE_COLOR: Record<Stage, string> = {
  NOVO: 'bg-secondary text-muted-foreground',
  EM_CONTATO: 'bg-info-suave text-info',
  QUALIFICADO: 'bg-marca/5 text-marca-texto',
  PROPOSTA_ENVIADA: 'bg-marca-suave text-marca-texto',
  EM_NEGOCIACAO: 'bg-warning-suave text-warning',
  GANHO: 'bg-success-suave text-success',
  PERDIDO: 'bg-destructive-suave text-destructive-texto',
}

/** A barrinha fina do cabeçalho da coluna (modelo Vireo), na cor da etapa. */
const STAGE_BAR: Record<Stage, string> = {
  NOVO: 'bg-subtle',
  EM_CONTATO: 'bg-info',
  QUALIFICADO: 'bg-marca/60',
  PROPOSTA_ENVIADA: 'bg-marca',
  EM_NEGOCIACAO: 'bg-warning',
  GANHO: 'bg-success',
  PERDIDO: 'bg-destructive',
}

/** Tons das iniciais da empresa: só neutros e estados (roxo é da IA, laranja da ação). */
const TONS_EMPRESA: Tom[] = ['marca', 'info', 'sucesso', 'atencao', 'neutro']
function tomDaEmpresa(nome: string): Tom {
  let h = 0
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TONS_EMPRESA[h % TONS_EMPRESA.length]
}

const brl = (cents: number) => formatCurrency(cents / 100)
const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const nomeDoContato = (o: Opportunity) => o.client?.name ?? o.prospect?.tradeName ?? o.prospect?.name ?? ''

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
  const [dragOver, setDragOver] = useState<Stage | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [loss, setLoss] = useState<Opportunity | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [mobileStage, setMobileStage] = useState<Stage>('NOVO')
  // Colunas recolhidas: estado só da tela. Coluna vazia começa recolhida;
  // `alternadas` guarda o que a pessoa inverteu à mão.
  const [alternadas, setAlternadas] = useState<Set<Stage>>(new Set())

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
      const nome = nomeDoContato(o)
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

  // Previsão de entrada: só o que ainda está em negociação (ganho já é receita, perdido não entra)
  const abertas = filtered.filter((o) => o.stage !== 'GANHO' && o.stage !== 'PERDIDO')
  const previsto = columnTotals(abertas)

  const colunas = filters.stage ? STAGES.filter((s) => s === filters.stage) : STAGES
  const etapaCelular = colunas.includes(mobileStage) ? mobileStage : colunas[0]
  const ownerName = owners.find((o) => o.id === filters.owner)?.name ?? null

  const recolhida = (s: Stage) => ((byStage.get(s)?.length ?? 0) === 0) !== alternadas.has(s)
  const alternar = (s: Stage) => setAlternadas((prev) => {
    const next = new Set(prev)
    if (next.has(s)) next.delete(s); else next.add(s)
    return next
  })

  // Frase do cabeçalho: quantas, e o mensal separado do pontual
  const subtitulo = loading
    ? 'Leads, negociações e fechamento comercial'
    : [
      `${abertas.length} ${abertas.length === 1 ? 'negociação aberta' : 'negociações abertas'}`,
      previsto.rec > 0 ? `${brl(previsto.rec)}/mês em negociação` : null,
      previsto.pontual > 0 ? `+ ${brl(previsto.pontual)} pontual` : null,
    ].filter(Boolean).join(' · ')

  return (
    <>
      <Header
        title="Pipeline"
        subtitle={subtitulo}
        acoes={<Button onClick={() => setShowNew(true)}><Plus /> Novo lead</Button>}
      />

      <div className="flex-1 min-h-0 flex flex-col gap-4 px-4 sm:px-8 pb-6 pt-2">
        {/* Barra compacta: busca, responsável, filtros; Quadro · Lista à direita */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-[240px] max-w-[380px]">
            <Search className="w-4 h-4 text-subtle absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Buscar negociação ou cliente"
              aria-label="Buscar negociação ou cliente"
              className="w-full h-10 pl-10 pr-8 text-[13px] border border-border rounded-xl bg-card text-foreground placeholder:text-subtle focus:outline-none focus:border-marca focus:ring-2 focus:ring-marca/15"
            />
            {searchDraft && (
              <button
                onClick={() => { setSearchDraft(''); push({ q: '' }) }}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary"
              >
                <X className="w-3.5 h-3.5 text-subtle" />
              </button>
            )}
          </div>

          <OwnerSelect owners={owners} value={filters.owner} onChange={(id) => push({ owner: id })} />
          <FiltersButton filters={filters} sources={sources} services={services} onApply={(next) => push(next)} />

          <div className="ml-auto">
            <Pilulas
              rotulo="Visualização do pipeline"
              valor={view}
              aoMudar={(v) => push({ view: v })}
              opcoes={[
                { valor: 'kanban', rotulo: <><LayoutGrid className="w-3.5 h-3.5" /> Quadro</> },
                { valor: 'lista', rotulo: <><List className="w-3.5 h-3.5" /> Lista</> },
              ]}
            />
          </div>
        </div>

        <FilterChips
          filters={filters}
          ownerName={ownerName}
          onRemove={(key) => push({ [key]: typeof filters[key] === 'boolean' ? false : '' } as Partial<PipelineFilterState>)}
          onClear={() => push({ ...EMPTY_FILTERS })}
        />

        {flash && <p className="text-xs font-medium text-foreground bg-marca-suave border border-marca/15 rounded-xl px-3 py-2 shrink-0">{flash}</p>}
        {error && <p className="text-xs font-medium text-destructive-texto bg-destructive-suave border border-destructive/20 rounded-xl px-3 py-2 shrink-0">{error}</p>}

        {loading ? (
          <div className="flex gap-4 overflow-hidden flex-1 min-h-0">
            {[...Array(4)].map((_, i) => <div key={i} className="w-[300px] shrink-0 bg-secondary rounded-[20px] animate-pulse" />)}
          </div>
        ) : view === 'lista' ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <ListView list={filtered} onOpen={setOpenId} today={hoje} />
          </div>
        ) : (
          <>
            {/* Celular e tablet: uma etapa por vez, sem depender de arrastar */}
            <div className="lg:hidden flex-1 min-h-0 flex flex-col gap-3">
              <div className="flex gap-1.5 overflow-x-auto pb-1 shrink-0">
                {colunas.map((s) => (
                  <button
                    key={s}
                    onClick={() => setMobileStage(s)}
                    aria-pressed={etapaCelular === s}
                    className={cn(
                      'text-[12px] font-semibold px-3 h-8 rounded-full whitespace-nowrap border transition-colors',
                      etapaCelular === s ? 'bg-marca text-white border-marca' : 'bg-card text-muted-foreground border-border',
                    )}
                  >
                    {STAGE_LABEL[s]} · {byStage.get(s)?.length ?? 0}
                  </button>
                ))}
              </div>
              <Column
                stage={etapaCelular}
                list={byStage.get(etapaCelular) ?? []}
                totals={columnTotals(byStage.get(etapaCelular) ?? [])}
                share={filtered.length ? (byStage.get(etapaCelular)?.length ?? 0) / filtered.length : 0}
                onOpen={setOpenId}
                onMove={moveTo}
                onNew={() => setShowNew(true)}
                busy={busy}
                today={hoje}
                draggable={false}
              />
            </div>

            {/* Desktop: rolagem horizontal apenas dentro do quadro */}
            <div className="hidden lg:flex gap-4 overflow-x-auto overflow-y-hidden pb-2 -mx-1 px-1 flex-1 min-h-0">
              {colunas.map((stage) => {
                const list = byStage.get(stage) ?? []
                const fechada = recolhida(stage)
                return (
                  <div
                    key={stage}
                    onDragOver={(e) => { e.preventDefault(); if (dragOver !== stage) setDragOver(stage) }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((s) => (s === stage ? null : s)) }}
                    onDrop={() => {
                      const opp = opportunities.find((o) => o.id === dragging)
                      setDragging(null)
                      setDragOver(null)
                      if (opp) moveTo(opp, stage)
                    }}
                    className={cn('shrink-0 h-full transition-[width] duration-200', fechada ? 'w-[60px]' : 'w-[304px]')}
                  >
                    {fechada ? (
                      <ColunaRecolhida
                        stage={stage}
                        count={list.length}
                        destacada={dragOver === stage}
                        onExpand={() => alternar(stage)}
                      />
                    ) : (
                      <Column
                        stage={stage}
                        list={list}
                        totals={columnTotals(list)}
                        share={filtered.length ? list.length / filtered.length : 0}
                        onOpen={setOpenId}
                        onMove={moveTo}
                        onNew={() => setShowNew(true)}
                        onCollapse={() => alternar(stage)}
                        busy={busy}
                        today={hoje}
                        draggable
                        destacada={dragOver === stage}
                        onDragStart={setDragging}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

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
    </>
  )
}

/* ------------------------------ coluna recolhida ------------------------------ */

function ColunaRecolhida({ stage, count, destacada, onExpand }: { stage: Stage; count: number; destacada: boolean; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Abrir a coluna ${STAGE_LABEL[stage]}`}
      aria-label={`Abrir a coluna ${STAGE_LABEL[stage]} (${count})`}
      className={cn(
        'h-full w-full rounded-[20px] border bg-secondary/40 flex flex-col items-center gap-3 py-4 transition-colors hover:bg-secondary',
        destacada ? 'border-marca bg-marca-suave' : 'border-border',
      )}
    >
      <ChevronsLeftRight className="w-4 h-4 text-subtle" />
      <span className="rounded-full bg-card border border-border px-1.5 text-[11px] font-semibold text-muted-foreground tabular">{count}</span>
      <span className={cn('w-1 h-8 rounded-full', STAGE_BAR[stage])} aria-hidden />
      <span className="text-[12.5px] font-semibold text-foreground whitespace-nowrap [writing-mode:vertical-rl] rotate-180">
        {STAGE_LABEL[stage]}
      </span>
    </button>
  )
}

/* --------------------------------- coluna --------------------------------- */

function Column({
  stage, list, totals, share, onOpen, onMove, onNew, onCollapse, busy, today, draggable, destacada, onDragStart,
}: {
  stage: Stage
  list: Opportunity[]
  totals: { rec: number; pontual: number }
  share: number
  onOpen: (id: string) => void
  onMove: (opp: Opportunity, stage: Stage) => void
  onNew: () => void
  onCollapse?: () => void
  busy: string | null
  today: Date
  draggable: boolean
  destacada?: boolean
  onDragStart?: (id: string) => void
}) {
  const pct = Math.round(share * 100)
  return (
    <div className={cn(
      'rounded-[20px] border bg-secondary/40 flex flex-col h-full min-h-0 transition-colors',
      destacada ? 'border-marca bg-marca-suave/60' : 'border-border',
    )}>
      {/* Cabeçalho no modelo Vireo: nome + contagem, total grande e a barrinha */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13.5px] font-semibold text-foreground truncate">{STAGE_LABEL[stage]}</span>
            <span className="rounded-full bg-card border border-border px-1.5 text-[11px] font-semibold text-muted-foreground tabular">{list.length}</span>
          </div>
          <div className="flex items-center -mr-1.5">
            {stage === 'NOVO' && (
              <button onClick={onNew} aria-label="Novo lead" title="Novo lead" className="p-1.5 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground">
                <Plus className="w-4 h-4" />
              </button>
            )}
            {onCollapse && (
              <button onClick={onCollapse} aria-label={`Recolher a coluna ${STAGE_LABEL[stage]}`} title="Recolher coluna" className="p-1.5 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground">
                <ChevronsRightLeft className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-[19px] font-semibold tracking-[-0.02em] text-foreground tabular leading-6">
              {brl(totals.rec)}<span className="text-[12px] font-medium text-muted-foreground">/mês</span>
            </p>
            <p className="text-[11.5px] text-muted-foreground tabular">
              {totals.pontual > 0 ? <><span className="font-semibold text-foreground">{brl(totals.pontual)}</span> pontual</> : 'sem valor pontual'}
            </p>
          </div>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap pb-0.5">{pct}% do funil</span>
        </div>
        <div className="mt-2.5 h-1 rounded-full bg-border overflow-hidden" aria-hidden>
          <div className={cn('h-full rounded-full', STAGE_BAR[stage])} style={{ width: `${Math.max(pct, list.length ? 4 : 0)}%` }} />
        </div>
      </div>

      <div className="px-3 pb-3 space-y-2.5 overflow-y-auto flex-1 min-h-0">
        {list.length === 0 ? (
          <p className="text-[12px] text-subtle text-center py-6 border border-dashed border-border rounded-2xl">Nenhuma negociação</p>
        ) : list.map((o) => (
          <Card key={o.id} opp={o} onOpen={onOpen} onMove={onMove} busy={busy === o.id} today={today} draggable={draggable} onDragStart={onDragStart} />
        ))}
        {stage === 'NOVO' && (
          <button
            onClick={onNew}
            className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-subtle/60 text-[12.5px] font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
          >
            <Plus className="w-4 h-4" /> Adicionar lead
          </button>
        )}
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
  const totals = opportunityTotals(opp.items, opp.estimateCents)
  const nome = nomeDoContato(opp) || 'Sem contato'
  const atrasado = isFollowUpLate(opp.nextActionAt, today)
  const pontual = totals.avulsoCents + totals.projetoMensalCents
  const semValor = totals.itemCount === 0 && !totals.usandoEstimativa

  return (
    <div
      draggable={draggable}
      onDragStart={() => onDragStart?.(opp.id)}
      className={cn(
        'group bg-card border rounded-2xl p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-shadow hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)]',
        busy && 'opacity-50',
        atrasado ? 'border-destructive/30' : 'border-border',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <button onClick={() => onOpen(opp.id)} className="text-left min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-foreground leading-snug line-clamp-2 break-words group-hover:text-marca-texto">{opp.title}</p>
        </button>
        {atrasado && (
          <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md bg-destructive-suave px-1.5 py-0.5 text-[10.5px] font-semibold text-destructive-texto">
            <Flame className="w-3 h-3" /> Atrasada
          </span>
        )}

        {/* Menu em portal: dentro da coluna com rolagem, um menu absoluto
            seria recortado — subir z-index não resolveria */}
        <PortalMenu
          ariaLabel={`Ações de ${opp.title}`}
          trigger={({ open, toggle, ref }) => (
            <button
              ref={ref}
              onClick={toggle}
              aria-label="Ações da negociação"
              aria-haspopup="menu"
              aria-expanded={open}
              className="p-0.5 -mr-1 rounded-md hover:bg-secondary text-subtle hover:text-foreground shrink-0"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                onClick={() => { close(); onOpen(opp.id) }}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/60"
                role="menuitem"
              >
                Abrir detalhes
              </button>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-subtle uppercase tracking-wide">Mover para</p>
              {STAGES.filter((s) => s !== opp.stage).map((s) => (
                <button
                  key={s}
                  onClick={() => { close(); onMove(opp, s) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-secondary/60 flex items-center gap-1.5"
                  role="menuitem"
                >
                  <ArrowRight className="w-3 h-3 text-subtle/70 shrink-0" /> {STAGE_LABEL[s]}
                </button>
              ))}
            </>
          )}
        </PortalMenu>
      </div>

      {/* Empresa: iniciais num quadradinho de tom suave + nome */}
      <button onClick={() => onOpen(opp.id)} className="mt-1.5 flex items-center gap-2 min-w-0 max-w-full text-left">
        <span className={cn('shrink-0 w-6 h-6 rounded-md grid place-items-center text-[10px] font-bold', TOM[tomDaEmpresa(nome)])}>{iniciais(nome) || '?'}</span>
        <span className="text-[12px] text-muted-foreground truncate">{nome}</span>
        {opp.client && <TierBadge tier={opp.client.tier} />}
      </button>

      {/* Valor: mensal e pontual nunca somados */}
      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {totals.usandoEstimativa ? (
            <p className="font-display text-[15px] font-semibold text-foreground tabular">{brl(totals.totalContratoCents)} <span className="font-sans text-[10.5px] font-medium text-subtle">estimado</span></p>
          ) : semValor ? (
            <p className="text-[11.5px] font-medium text-warning">Sem valor informado</p>
          ) : (
            <>
              {totals.recorrenteCents > 0 && (
                <p className="font-display text-[15px] font-semibold text-foreground tabular">{brl(totals.recorrenteCents)}<span className="font-sans text-[10.5px] font-medium text-subtle">/mês</span></p>
              )}
              {pontual > 0 && (
                <p className={cn('tabular', totals.recorrenteCents > 0 ? 'text-[11.5px] font-semibold text-muted-foreground' : 'font-display text-[15px] font-semibold text-foreground')}>
                  {brl(pontual)} <span className="font-sans text-[10.5px] font-medium text-subtle">pontual</span>
                </p>
              )}
            </>
          )}
        </div>
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] text-muted-foreground pb-0.5" title="Previsão de fechamento">
          <CalendarClock className="w-3.5 h-3.5" /> {opp.expectedCloseDate ? formatDate(opp.expectedCloseDate) : 'sem previsão'}
        </span>
      </div>

      {/* Próxima ação (vermelha quando passou do dia) */}
      {opp.nextAction ? (
        <p className={cn('mt-2 text-[11.5px] break-words line-clamp-2', atrasado ? 'text-destructive-texto font-semibold' : 'text-muted-foreground')}>
          {opp.nextAction}{opp.nextActionAt ? ` · ${formatDate(opp.nextActionAt)}` : ''}
        </p>
      ) : (
        <p className="mt-2 text-[11.5px] text-warning inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Sem próxima ação
        </p>
      )}

      <div className="mt-3 pt-2.5 border-t border-border flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Dias nesta etapa">
          <Clock className="w-3.5 h-3.5" /> {daysBetween(opp.stageChangedAt, today)}d
        </span>
        {opp.proposal && (
          <span className="inline-flex items-center gap-1 text-marca-texto" title={`Proposta ${opp.proposal.number}`}>
            <FileText className="w-3.5 h-3.5" aria-label="Proposta vinculada" /> {opp.proposal.number}
          </span>
        )}
        <span className="ml-auto" title={opp.owner?.name ?? ''}>
          <Avatar nome={opp.owner?.name ?? '?'} tamanho="sm" className="w-6 h-6 text-[10px] bg-marca-suave text-marca-texto" />
        </span>
      </div>
    </div>
  )
}

/* --------------------------------- lista --------------------------------- */

function ListView({ list, onOpen, today }: { list: Opportunity[]; onOpen: (id: string) => void; today: Date }) {
  return (
    <section className="rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
      <div className="px-6 pt-5 pb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[21px] font-semibold tracking-[-0.01em] text-foreground">Todas as negociações</h2>
        <p className="t-meta tabular">{list.length} {list.length === 1 ? 'negociação' : 'negociações'}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[880px]">
          <thead className="bg-secondary/60 border-y border-border">
            <tr className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
              <th className="px-6 py-3">Negociação</th>
              <th className="px-4 py-3">Etapa</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3 text-right">Mensal</th>
              <th className="px-4 py-3 text-right">Pontual</th>
              <th className="px-4 py-3">Próxima ação</th>
              <th className="px-6 py-3">Previsão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-subtle text-xs">Nenhuma negociação</td></tr>
            ) : list.map((o) => {
              const t = opportunityTotals(o.items, o.estimateCents)
              const nome = nomeDoContato(o) || '—'
              const pontual = t.avulsoCents + t.projetoMensalCents
              const atrasado = isFollowUpLate(o.nextActionAt, today)
              return (
                <tr key={o.id} className="hover:bg-secondary/40">
                  <td className="px-6 py-3 min-w-[240px]">
                    <button onClick={() => onOpen(o.id)} className="flex items-center gap-3 text-left min-w-0 group">
                      <span className={cn('shrink-0 w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold', TOM[tomDaEmpresa(nome)])}>{iniciais(nome) || '?'}</span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-foreground group-hover:text-marca-texto">{o.title}</span>
                        <span className="block text-[11.5px] text-muted-foreground truncate">{nome}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3"><span className={cn('inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap', STAGE_COLOR[o.stage as Stage])}>{STAGE_LABEL[o.stage as Stage]}</span></td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-foreground whitespace-nowrap">
                      <Avatar nome={o.owner?.name ?? '?'} tamanho="sm" className="w-6 h-6 text-[10px] bg-marca-suave text-marca-texto" />
                      {o.owner?.name ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-display font-semibold text-foreground tabular whitespace-nowrap">
                    {t.recorrenteCents > 0 ? <>{brl(t.recorrenteCents)}<span className="font-sans text-[11px] font-medium text-subtle">/mês</span></> : t.usandoEstimativa ? <span className="block font-sans font-normal text-muted-foreground leading-tight">{brl(t.totalContratoCents)}<span className="block text-[10.5px] text-subtle">estimado</span></span> : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground tabular whitespace-nowrap">{pontual > 0 ? brl(pontual) : '—'}</td>
                  <td className={cn('px-4 py-3 max-w-[200px] truncate', atrasado ? 'text-destructive-texto font-semibold' : 'text-muted-foreground')}>
                    {o.nextAction ? `${o.nextAction}${o.nextActionAt ? ` · ${formatDate(o.nextActionAt)}` : ''}` : '—'}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground whitespace-nowrap">{o.expectedCloseDate ? formatDate(o.expectedCloseDate) : 'sem previsão'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
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
    <div className="fixed inset-0 z-50 bg-veu flex items-end sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-lg rounded-t-[24px] sm:rounded-[24px] border border-border shadow-xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h3 className="font-display text-[19px] font-semibold tracking-[-0.01em] text-foreground">Novo lead</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-secondary rounded-lg"><X className="w-4 h-4 text-subtle" /></button>
        </div>
        <div className="px-5 sm:px-6 py-5 space-y-3">
          {error && <p className="text-xs text-destructive-texto bg-destructive-suave border border-destructive/20 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome do contato ou empresa *</label>
            <input value={form.leadName} onChange={(e) => set('leadName', e.target.value)} className="input text-sm" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Responsável comercial *</label>
            <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)} className="input text-sm">
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-subtle">Só isso já cria o lead. O resto pode entrar depois, sem travar o primeiro contato.</p>

          <button onClick={() => setMais((v) => !v)} className="text-xs font-semibold text-marca-texto hover:underline">
            {mais ? 'Esconder campos opcionais' : 'Completar agora (opcional)'}
          </button>

          {mais && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Título da negociação</label><input value={form.title} onChange={(e) => set('title', e.target.value)} className="input text-sm" placeholder="Ex: Social media + tráfego" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">WhatsApp/telefone</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">E-mail</label><input value={form.email} onChange={(e) => set('email', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">CPF/CNPJ</label><input value={form.document} onChange={(e) => set('document', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Nome fantasia</label><input value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Origem do lead</label><input value={form.source} onChange={(e) => set('source', e.target.value)} className="input text-sm" placeholder="Indicação, tráfego, evento..." /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Valor estimado</label><CurrencyInput value={estimate} onChange={setEstimate} className="input text-sm" ariaLabel="Valor estimado" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Previsão de fechamento</label><input type="date" value={form.expectedCloseDate} onChange={(e) => set('expectedCloseDate', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Próxima ação</label><input value={form.nextAction} onChange={(e) => set('nextAction', e.target.value)} className="input text-sm" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Data do próximo contato</label><input type="date" value={form.nextActionAt} onChange={(e) => set('nextActionAt', e.target.value)} className="input text-sm" /></div>
              <div className="sm:col-span-2"><label className="text-xs font-medium text-muted-foreground mb-1 block">Observações</label><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="input text-sm resize-none" /></div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 sm:px-6 py-4 border-t border-border sticky bottom-0 bg-card">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !form.leadName.trim() || !form.ownerId}>
            {saving && <Loader2 className="animate-spin" />} Criar lead
          </Button>
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
    <div className="fixed inset-0 z-50 bg-veu flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-[24px] border border-border w-full max-w-sm p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-[19px] font-semibold tracking-[-0.01em] text-foreground mb-1">Fechar como perdido</p>
        <p className="text-xs text-muted-foreground mb-3 truncate">{opportunity.title}</p>
        {error && <p className="text-xs text-destructive-texto bg-destructive-suave border border-destructive/20 rounded-lg px-3 py-2 mb-2">{error}</p>}
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Motivo da perda *</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input text-sm resize-none" placeholder="Preço, prazo, concorrente, sem resposta..." autoFocus />
        <p className="text-[11px] text-subtle mt-2">Não cria cliente nem lança valores no financeiro.</p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="destructive" onClick={submit} disabled={saving || !reason.trim()}>
            Registrar perda
          </Button>
        </div>
      </div>
    </div>
  )
}
