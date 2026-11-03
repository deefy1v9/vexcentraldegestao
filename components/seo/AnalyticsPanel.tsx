'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search, RefreshCw, Plug, AlertTriangle, CheckCircle2, Loader2, X, Users, MousePointerClick,
  Eye, Activity, TrendingUp, TrendingDown, Trash2, ChevronDown, Link2, MessageCircle, FileText,
} from 'lucide-react'
import {
  formatCount, formatRate, variation, br, TRAFFIC_LABEL, TRAFFIC_FILTERS,
  EVENT_STATUS_LABEL, eventStatus, LEAD_EVENT_DEFAULT,
  type TrafficFilter, type RangeKind, type EventStatus,
} from '@/lib/ga-core'
import GraficoDiario from '@/components/seo/GraficoDiario'
import { Button } from '@/components/vex/button'
import { Chip, Kpi, Painel, Pilulas } from '@/components/vex/vireo'
import { PERIODOS } from '@/components/seo/periodos'

/* ---------------------------------- tipos ---------------------------------- */

interface Mapping {
  leadEvent: string | null
  leadStatus: string
  whatsappEvent: string | null
  whatsappUrlContains: string | null
  whatsappStatus: string
  notes: string | null
}

interface PropriedadeGa {
  id: string
  propertyId: string
  displayName: string
  accountName: string | null
  timeZone: string | null
  isVexSite: boolean
  client: { id: string; name: string } | null
  mapping: Mapping | null
}

interface StatusGa {
  connected: boolean
  googleEmail: string | null
  hasAnalyticsScope: boolean
  properties: PropriedadeGa[]
}

interface Row {
  dimensionValues?: Array<{ value?: string }>
  metricValues?: Array<{ value?: string }>
}

interface RelatorioGa {
  range: { startDate: string; endDate: string; kind: RangeKind; label: string; emAndamento: boolean }
  filtro: TrafficFilter
  timeZone: string | null
  hoje: string
  cached: boolean
  fetchedAt: string
  report: {
    totals: Row | null
    previousTotals: Row | null
    byDate: Row[]
    landingPages: Row[]
    channels: Row[]
    contatos: {
      leadEvent: string | null
      leadCount: number
      leadEverSeen: boolean
      whatsappMode: 'evento' | 'click' | 'indefinido'
      whatsappCount: number
      whatsappEverSeen: boolean
      topEvents: Array<{ name: string; count: number }>
    }
  }
}

const num = (r: Row | null | undefined, i: number) => Number(r?.metricValues?.[i]?.value ?? 0) || 0

const STATUS_CLS: Record<EventStatus, string> = {
  VALIDADO: 'bg-success-suave text-success',
  SEM_OCORRENCIA: 'bg-secondary text-muted-foreground',
  NAO_VERIFICADO: 'bg-warning-suave text-warning',
  CONFIGURACAO_NECESSARIA: 'bg-destructive-suave text-destructive-texto',
}

/**
 * Aba Analytics: indicadores do GA4 da propriedade vinculada, com filtro de
 * canal aplicado a tudo. Sessão do GA4 e clique do Search Console são coisas
 * diferentes e não se misturam aqui.
 */
export default function AnalyticsPanel({
  clientes, periodo, mes, ano, de, ate, onPeriodo,
}: {
  clientes: Array<{ id: string; name: string }>
  periodo: RangeKind
  mes: string
  ano: string
  de: string
  ate: string
  onPeriodo: (next: Record<string, string | null>) => void
}) {
  const [status, setStatus] = useState<StatusGa | null>(null)
  const [relatorio, setRelatorio] = useState<RelatorioGa | null>(null)
  const [propId, setPropId] = useState('')
  const [trafego, setTrafego] = useState<TrafficFilter>('organico')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [vincular, setVincular] = useState(false)
  const [config, setConfig] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const carregarStatus = useCallback(() => fetch('/api/ga/status')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
    .then(setStatus)
    .catch(() => setErro('Não foi possível carregar o Analytics.')), [])

  useEffect(() => { carregarStatus() }, [carregarStatus])

  const propriedade = useMemo(
    () => status?.properties.find((p) => p.id === propId) ?? status?.properties[0] ?? null,
    [status, propId],
  )

  const carregarRelatorio = useCallback((forcar = false) => {
    if (!propriedade) return Promise.resolve()
    const q = new URLSearchParams({ propriedade: propriedade.id, periodo, trafego })
    if (mes) q.set('mes', mes)
    if (ano) q.set('ano', ano)
    if (de) q.set('de', de)
    if (ate) q.set('ate', ate)
    if (forcar) q.set('atualizar', '1')
    return fetch(`/api/ga/relatorio?${q.toString()}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) { setRelatorio(null); setErro(body.error ?? 'Falha ao consultar o Analytics.'); return }
        setErro(null)
        setRelatorio(body)
      })
      .catch(() => { setRelatorio(null); setErro('Falha de conexão ao consultar o Analytics.') })
      .finally(() => setCarregando(false))
  }, [propriedade, periodo, trafego, mes, ano, de, ate])

  useEffect(() => { carregarRelatorio() }, [carregarRelatorio])

  async function desvincular(id: string) {
    if (!confirm('Desvincular esta propriedade do Analytics? A conexão com o Google continua ativa para o Search Console.')) return
    setOcupado(true)
    try {
      const res = await fetch(`/api/ga/propriedades?id=${id}`, { method: 'DELETE' })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(b.error ?? 'Falha ao desvincular.'); return }
      setAviso('Propriedade desvinculada. A autorização do Google foi preservada.')
      setRelatorio(null)
      carregarStatus()
    } finally { setOcupado(false) }
  }

  /* ------------------------------- estados ------------------------------- */

  if (!status) {
    return <div className="h-32 bg-secondary rounded-[24px] animate-pulse" />
  }

  if (!status.connected) {
    return (
      <div className="bg-card border border-border rounded-[24px] p-10 text-center">
        <Plug className="w-8 h-8 text-subtle mx-auto mb-2" />
        <p className="text-sm font-semibold text-foreground">Conecte a conta do Google primeiro</p>
        <p className="text-xs text-muted-foreground mt-1">Use a aba Search Console para conectar. O Analytics usa a mesma conta.</p>
      </div>
    )
  }

  if (!status.hasAnalyticsScope) {
    return (
      <div className="bg-card border border-warning/30 rounded-[24px] p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-warning mx-auto mb-2" />
        <p className="text-sm font-semibold text-foreground">Falta autorizar a leitura do Analytics</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          A conta {status.googleEmail} está conectada, mas só concedeu acesso ao Search Console.
          Autorize o Analytics: o acesso já concedido continua valendo.
        </p>
        <a
          href="/api/gsc/oauth/start?escopos=analytics"
          className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary-hover"
        >
          <Plug className="w-3.5 h-3.5" /> Autorizar Analytics
        </a>
      </div>
    )
  }

  const totals = relatorio?.report.totals
  const anterior = relatorio?.report.previousTotals
  const contatos = relatorio?.report.contatos

  return (
    <div className="space-y-4">
      {erro && (
        <p className="flex items-start gap-2 text-xs font-medium text-destructive-texto bg-destructive-suave border border-destructive/30 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {erro}
        </p>
      )}
      {aviso && (
        <p className="flex items-start gap-2 text-xs font-medium text-success bg-success-suave border border-success/30 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> {aviso}
        </p>
      )}

      {/* Barra compacta */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={propriedade?.id ?? ''}
          onChange={(e) => setPropId(e.target.value)}
          className="h-9 px-2 text-xs border border-border rounded-lg bg-card text-foreground max-w-[240px]"
          aria-label="Propriedade do Analytics"
        >
          {status.properties.length === 0 && <option value="">Nenhuma propriedade vinculada</option>}
          {status.properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName} · {p.isVexSite ? 'VEX' : p.client?.name ?? 'sem cliente'}
            </option>
          ))}
        </select>

        <Pilulas rotulo="Período" valor={periodo} aoMudar={(k) => onPeriodo({ periodo: k })} opcoes={PERIODOS} />

        {periodo === 'mes' && (
          <input type="month" value={mes || new Date().toISOString().slice(0, 7)} onChange={(e) => onPeriodo({ mes: e.target.value })} className="h-9 px-2 text-xs border border-border rounded-lg bg-card text-foreground" aria-label="Mês" />
        )}
        {periodo === 'ano' && (
          <input type="number" min={2015} max={2100} value={ano || new Date().getFullYear()} onChange={(e) => onPeriodo({ ano: e.target.value })} className="h-9 w-24 px-2 text-xs border border-border rounded-lg bg-card text-foreground" aria-label="Ano" />
        )}
        {periodo === 'custom' && (
          <>
            <input type="date" value={de} onChange={(e) => onPeriodo({ de: e.target.value })} className="h-9 px-2 text-xs border border-border rounded-lg bg-card text-foreground" aria-label="Data inicial" />
            <input type="date" value={ate} onChange={(e) => onPeriodo({ ate: e.target.value })} className="h-9 px-2 text-xs border border-border rounded-lg bg-card text-foreground" aria-label="Data final" />
          </>
        )}

        <select
          value={trafego}
          onChange={(e) => setTrafego(e.target.value as TrafficFilter)}
          className="h-9 px-2 text-xs border border-border rounded-lg bg-card text-foreground"
          aria-label="Origem do tráfego"
        >
          {TRAFFIC_FILTERS.map((f) => <option key={f} value={f}>{TRAFFIC_LABEL[f]}</option>)}
        </select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => { setCarregando(true); carregarRelatorio(true) }}
          disabled={carregando || !propriedade}
          className="ml-auto"
        >
          <RefreshCw className={carregando ? 'animate-spin' : ''} /> Atualizar
        </Button>
      </div>

      {/* Configuração recolhível */}
      <section className="rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <button
          onClick={() => setConfig((v) => !v)}
          aria-expanded={config}
          className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left"
        >
          <span className="flex items-center gap-3 min-w-0">
            <Chip icone={Plug} tom="sucesso" />
            <span className="min-w-0">
              <span className="block t-secao text-foreground">Configurações da integração</span>
              <span className="block t-legenda truncate">
                {status.googleEmail} · {status.properties.length} propriedade(s)
                {propriedade?.timeZone ? ` · fuso ${propriedade.timeZone}` : ''}
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground shrink-0">
            {config ? 'Recolher' : 'Gerenciar'}
            <ChevronDown className={`w-4 h-4 transition-transform ${config ? 'rotate-180' : ''}`} />
          </span>
        </button>
        {config && (
          <div className="px-6 pb-5 space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              {status.properties.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1 rounded-full border border-border text-[11.5px] text-foreground">
                  {p.displayName}
                  <span className="text-muted-foreground">{p.propertyId}</span>
                  <button onClick={() => desvincular(p.id)} disabled={ocupado} aria-label={`Desvincular ${p.displayName}`} className="p-1 rounded-full hover:bg-secondary text-muted-foreground">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button
                onClick={() => setVincular(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border text-[11.5px] font-semibold text-foreground hover:border-marca hover:text-marca-texto"
              >
                <Link2 className="w-3 h-3" /> Vincular propriedade
              </button>
            </div>
            {propriedade && (
              <MapeamentoEventos
                propriedade={propriedade}
                onSalvo={(msg) => { setAviso(msg); carregarStatus(); carregarRelatorio(true) }}
              />
            )}
          </div>
        )}
      </section>

      {/* Conteúdo */}
      {!propriedade ? (
        <Painel className="text-center py-10">
          <Chip icone={Activity} tom="neutro" tamanho="lg" className="mx-auto" />
          <p className="t-secao text-foreground mt-3">Nenhuma propriedade do Analytics vinculada</p>
          <button onClick={() => setVincular(true)} className="t-rotulo font-semibold text-marca-texto hover:underline mt-1">
            Vincular agora
          </button>
        </Painel>
      ) : !relatorio ? (
        carregando || !erro ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-secondary rounded-[20px] animate-pulse" />)}
          </div>
        ) : (
          <Painel className="text-center py-10">
            <Chip icone={AlertTriangle} tom="atencao" tamanho="lg" className="mx-auto" />
            <p className="t-secao text-foreground mt-3">Sem resposta do Analytics</p>
            <p className="t-legenda mt-1">{erro}</p>
          </Painel>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              { label: 'Usuários totais', valor: formatCount(num(totals, 0)), icon: Users, tom: 'marca', atual: num(totals, 0), ant: num(anterior, 0) },
              { label: 'Sessões', valor: formatCount(num(totals, 1)), icon: MousePointerClick, tom: 'info', atual: num(totals, 1), ant: num(anterior, 1) },
              { label: 'Visualizações', valor: formatCount(num(totals, 2)), icon: Eye, tom: 'sucesso', atual: num(totals, 2), ant: num(anterior, 2) },
              { label: 'Taxa de engajamento', valor: formatRate(num(totals, 3)), icon: Activity, tom: 'atencao', atual: num(totals, 3), ant: num(anterior, 3) },
            ] as const).map((c) => {
              const v = variation(c.atual, c.ant)
              const sobe = (v ?? 0) >= 0
              return (
                <Kpi
                  key={c.label}
                  icone={c.icon}
                  tom={c.tom}
                  rotulo={c.label}
                  valor={c.valor}
                  tendencia={v == null ? undefined : { texto: `${v > 0 ? '+' : ''}${v.toFixed(0)}%`, bom: v === 0 || sobe }}
                  nota={v == null ? 'Sem base de comparação' : (
                    <span className="inline-flex items-center gap-1">
                      {sobe ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} vs período anterior
                    </span>
                  )}
                />
              )
            })}
          </div>

          <p className="t-legenda">
            {relatorio.range.label} · {br(relatorio.range.startDate)} a {br(relatorio.range.endDate)} ·
            {' '}{TRAFFIC_LABEL[relatorio.filtro]} · fuso {relatorio.timeZone ?? 'não informado'} ·
            {' '}consulta de {new Date(relatorio.fetchedAt).toLocaleString('pt-BR')}{relatorio.cached ? ', do cache' : ''}
            {relatorio.range.emAndamento ? ' · período em andamento, números ainda em formação' : ''}
          </p>

          <Contatos contatos={contatos!} mapping={propriedade.mapping} onAbrirConfig={() => setConfig(true)} />

          <Evolucao linhas={relatorio.report.byDate} periodo={relatorio.range.label} trafego={TRAFFIC_LABEL[relatorio.filtro]} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TabelaGa titulo="Páginas de entrada com mais sessões" linhas={relatorio.report.landingPages} coluna="Página" />
            <TabelaGa titulo="Sessões por canal" linhas={relatorio.report.channels} coluna="Canal" semUsuarios />
          </div>
        </>
      )}

      {vincular && (
        <VincularGaModal
          clientes={clientes}
          onClose={() => setVincular(false)}
          onDone={(msg) => { setVincular(false); setAviso(msg); carregarStatus() }}
        />
      )}
    </div>
  )
}

/* -------------------------------- contatos -------------------------------- */

function Contatos({
  contatos, mapping, onAbrirConfig,
}: {
  contatos: RelatorioGa['report']['contatos']
  mapping: Mapping | null
  onAbrirConfig: () => void
}) {
  const leadStatus = eventStatus({
    mapeado: !!contatos.leadEvent,
    ocorrenciasNoPeriodo: contatos.leadCount,
    existeEmAlgumaJanela: contatos.leadEverSeen,
  })
  const whatsappStatus = eventStatus({
    mapeado: contatos.whatsappMode !== 'indefinido',
    ocorrenciasNoPeriodo: contatos.whatsappCount,
    existeEmAlgumaJanela: contatos.whatsappEverSeen,
  })

  return (
    <section className="rounded-[24px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Analytics</p><h2 className="mt-1 font-display text-[21px] font-semibold tracking-[-0.01em] text-foreground">Contatos e pedidos de orçamento</h2></div>
        <button onClick={onAbrirConfig} className="text-[11px] font-semibold text-marca-texto hover:underline">
          Mapear eventos
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-secondary/60 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Formulários enviados</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLS[leadStatus]}`}>
              {EVENT_STATUS_LABEL[leadStatus]}
            </span>
          </div>
          <p className="font-display text-[26px] font-semibold tracking-[-0.02em] tabular text-foreground mt-1">
            {leadStatus === 'NAO_VERIFICADO' ? '—' : formatCount(contatos.leadCount)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {contatos.leadEvent ? `evento ${contatos.leadEvent}` : `mapeie o evento (padrão do GA4: ${LEAD_EVENT_DEFAULT})`}
          </p>
        </div>

        <div className="rounded-2xl bg-secondary/60 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> Cliques no WhatsApp</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLS[whatsappStatus]}`}>
              {EVENT_STATUS_LABEL[whatsappStatus]}
            </span>
          </div>
          <p className="font-display text-[26px] font-semibold tracking-[-0.02em] tabular text-foreground mt-1">
            {whatsappStatus === 'NAO_VERIFICADO' ? '—' : formatCount(contatos.whatsappCount)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {contatos.whatsappMode === 'evento' ? `evento ${mapping?.whatsappEvent}`
              : contatos.whatsappMode === 'click' ? `clique com destino contendo "${mapping?.whatsappUrlContains}"`
              : 'mapeie o evento ou o destino do link'}
          </p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2">
        Clique no WhatsApp é clique, não conversa iniciada nem lead confirmado. Nada aqui cria contato no Pipeline.
      </p>
    </section>
  )
}

/* ------------------------------- mapeamento ------------------------------- */

function MapeamentoEventos({
  propriedade, onSalvo,
}: {
  propriedade: PropriedadeGa
  onSalvo: (msg: string) => void
}) {
  const [eventos, setEventos] = useState<Array<{ name: string; count: number }> | null>(null)
  const [sugestoes, setSugestoes] = useState<{ lead: string | null; whatsapp: string[]; temClickGenerico: boolean } | null>(null)
  const [leadEvent, setLeadEvent] = useState(propriedade.mapping?.leadEvent ?? '')
  const [whatsappEvent, setWhatsappEvent] = useState(propriedade.mapping?.whatsappEvent ?? '')
  const [whatsappUrl, setWhatsappUrl] = useState(propriedade.mapping?.whatsappUrlContains ?? 'wa.me')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/ga/eventos?propriedade=${propriedade.id}`)
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b.error)
        setEventos(b.eventos)
        setSugestoes(b.sugestoes)
      })
      .catch((e) => setErro(e.message ?? 'Falha ao listar eventos.'))
  }, [propriedade.id])

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const res = await fetch('/api/ga/eventos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propriedade: propriedade.id,
          leadEvent: leadEvent || null,
          whatsappEvent: whatsappEvent || null,
          whatsappUrlContains: whatsappUrl || null,
        }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(b.error ?? 'Não foi possível salvar.'); return }
      onSalvo('Mapeamento de eventos salvo.')
    } finally { setSalvando(false) }
  }

  return (
    <div className="border border-border rounded-2xl p-4 space-y-3">
      <p className="text-xs font-semibold text-foreground">Eventos de contato desta propriedade</p>
      {erro && <p className="text-xs text-destructive-texto">{erro}</p>}
      {eventos === null && !erro ? (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Lendo eventos dos últimos 90 dias…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Formulário enviado (lead)</label>
              <select value={leadEvent} onChange={(e) => setLeadEvent(e.target.value)} className="w-full h-9 px-2 text-xs border border-border rounded-lg bg-card">
                <option value="">Não mapeado</option>
                {(eventos ?? []).map((e) => <option key={e.name} value={e.name}>{e.name} ({formatCount(e.count)})</option>)}
              </select>
              {sugestoes?.lead && leadEvent !== sugestoes.lead && (
                <button onClick={() => setLeadEvent(sugestoes.lead!)} className="text-[10px] text-marca-texto hover:underline mt-1">
                  usar {sugestoes.lead}
                </button>
              )}
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Clique no WhatsApp</label>
              <select value={whatsappEvent} onChange={(e) => setWhatsappEvent(e.target.value)} className="w-full h-9 px-2 text-xs border border-border rounded-lg bg-card">
                <option value="">Usar clique com destino</option>
                {(eventos ?? []).map((e) => <option key={e.name} value={e.name}>{e.name} ({formatCount(e.count)})</option>)}
              </select>
              {!whatsappEvent && (
                <input
                  value={whatsappUrl}
                  onChange={(e) => setWhatsappUrl(e.target.value)}
                  placeholder="destino contém: wa.me"
                  className="w-full h-9 px-2 text-xs border border-border rounded-lg bg-card mt-1"
                />
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Abrir formulário ou clicar em enviar não é lead. Use o evento que confirma o envio.
            {sugestoes?.temClickGenerico ? ' Esta propriedade registra "click" genérico: com evento próprio de WhatsApp, o click não é somado junto.' : ''}
          </p>
          <div className="flex justify-end">
            <button
              onClick={salvar}
              disabled={salvando}
              className="flex items-center gap-1.5 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary-hover disabled:opacity-40"
            >
              {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar mapeamento
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* -------------------------------- gráficos -------------------------------- */

function Evolucao({ linhas, periodo, trafego }: { linhas: Row[]; periodo: string; trafego: string }) {
  if (linhas.length === 0) return null
  const dia = (l: Row) => {
    const v = l.dimensionValues?.[0]?.value ?? ''
    return v.length === 8 ? `${v.slice(6, 8)}/${v.slice(4, 6)}` : v
  }
  return (
    <Painel rotulo="Analytics" titulo="Evolução de sessões" sub={`Sessões por dia · ${periodo} · ${trafego}`}>
      <GraficoDiario
        metrica="Sessões"
        unidade="sessões por dia"
        pontos={linhas.map((l, i) => {
          const valor = Number(l.metricValues?.[0]?.value ?? 0) || 0
          return { chave: l.dimensionValues?.[0]?.value ?? String(i), rotulo: dia(l), valor, dica: `${dia(l)} · ${formatCount(valor)} sessões` }
        })}
      />
    </Painel>
  )
}

function TabelaGa({
  titulo, linhas, coluna, semUsuarios,
}: {
  titulo: string
  linhas: Row[]
  coluna: string
  semUsuarios?: boolean
}) {
  const [pagina, setPagina] = useState(0)
  const porPagina = 10
  const total = Math.ceil(linhas.length / porPagina)
  const visiveis = linhas.slice(pagina * porPagina, (pagina + 1) * porPagina)

  return (
    <Painel rotulo="Analytics" titulo={titulo} semPadding className="overflow-hidden">
      {linhas.length === 0 ? (
        <p className="t-legenda text-center py-6 border-t border-border">Nada no período</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[360px]">
              <thead className="bg-secondary/60 border-y border-border">
                <tr className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                  <th className="px-6 py-2.5">{coluna}</th>
                  <th className="px-3 py-2.5">Sessões</th>
                  {!semUsuarios && <th className="px-3 py-2.5 pr-6">Usuários</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visiveis.map((l, i) => (
                  <tr key={(l.dimensionValues?.[0]?.value ?? '') + i} className="hover:bg-secondary/40">
                    <td className="px-6 py-2.5 max-w-[240px] truncate text-foreground" title={l.dimensionValues?.[0]?.value}>
                      {l.dimensionValues?.[0]?.value || '(não definido)'}
                    </td>
                    <td className="px-3 py-2.5 text-foreground font-semibold tabular">{formatCount(Number(l.metricValues?.[0]?.value ?? 0) || 0)}</td>
                    {!semUsuarios && <td className="px-3 py-2.5 pr-6 text-muted-foreground tabular">{formatCount(Number(l.metricValues?.[1]?.value ?? 0) || 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 1 && (
            <div className="flex items-center justify-center gap-2 py-3 text-[11px] border-t border-border">
              <button onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} className="h-7 px-2.5 border border-border rounded-lg hover:bg-secondary disabled:opacity-40">Anterior</button>
              <span className="text-muted-foreground tabular">{pagina + 1} / {total}</span>
              <button onClick={() => setPagina((p) => Math.min(total - 1, p + 1))} disabled={pagina === total - 1} className="h-7 px-2.5 border border-border rounded-lg hover:bg-secondary disabled:opacity-40">Próxima</button>
            </div>
          )}
        </>
      )}
    </Painel>
  )
}

/* ------------------------------ vincular ------------------------------ */

function VincularGaModal({
  clientes, onClose, onDone,
}: {
  clientes: Array<{ id: string; name: string }>
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [lista, setLista] = useState<Array<{ propertyId: string; displayName: string; accountName: string; linked: boolean }> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [escolhida, setEscolhida] = useState('')
  const [destino, setDestino] = useState<'cliente' | 'vex'>('vex')
  const [clienteId, setClienteId] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    fetch('/api/ga/propriedades')
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b.error ?? 'Falha ao listar propriedades.')
        setLista(b.properties)
      })
      .catch((e) => setErro(e.message))
  }, [])

  const filtradas = (lista ?? []).filter((p) =>
    `${p.displayName} ${p.accountName} ${p.propertyId}`.toLowerCase().includes(busca.trim().toLowerCase()))

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const res = await fetch('/api/ga/propriedades', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: escolhida,
          isVexSite: destino === 'vex',
          clientId: destino === 'cliente' ? clienteId : null,
        }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(b.error ?? 'Não foi possível vincular.'); return }
      onDone('Propriedade do Analytics vinculada.')
    } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-veu flex items-end sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-lg rounded-t-[24px] sm:rounded-[24px] shadow-xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border sticky top-0 bg-card">
          <h3 className="font-bold text-foreground">Vincular propriedade do Analytics</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-secondary rounded-lg"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          {erro && <p className="text-xs text-destructive-texto bg-destructive-suave border border-destructive/30 rounded-lg px-3 py-2">{erro}</p>}
          {lista === null && !erro ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Consultando contas e propriedades…</p>
          ) : lista && lista.length === 0 ? (
            <p className="text-xs text-warning bg-warning-suave border border-warning/20 rounded-lg px-3 py-2">
              A conta conectada não tem nenhuma propriedade do GA4. Confira o acesso dela no Google Analytics.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por conta, propriedade ou ID" className="w-full h-10 pl-9 pr-3 text-xs border border-border rounded-lg" />
              </div>
              <div className="max-h-56 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {filtradas.map((p) => (
                  <button
                    key={p.propertyId}
                    onClick={() => setEscolhida(p.propertyId)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 ${escolhida === p.propertyId ? 'bg-marca/5' : 'hover:bg-secondary/60'}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground truncate">{p.displayName}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {p.accountName} · ID {p.propertyId}{p.linked ? ' · já vinculada' : ''}
                      </span>
                    </span>
                    {escolhida === p.propertyId && <CheckCircle2 className="w-4 h-4 text-marca-texto shrink-0" />}
                  </button>
                ))}
                {filtradas.length === 0 && <p className="px-3 py-3 text-[11px] text-muted-foreground">Nada com esse termo.</p>}
              </div>

              <div className="flex items-center gap-3 text-xs text-foreground pt-1">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={destino === 'vex'} onChange={() => setDestino('vex')} /> Site da VEX
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={destino === 'cliente'} onChange={() => setDestino('cliente')} /> Cliente
                </label>
              </div>
              {destino === 'cliente' && (
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="input text-sm">
                  <option value="">Selecione o cliente…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <p className="text-[10px] text-muted-foreground">
                O vínculo usa o ID numérico da propriedade. O ID de medição (G-...) identifica o fluxo do site e não serve para relatório.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 sm:p-5 border-t border-border sticky bottom-0 bg-card">
          <button onClick={onClose} disabled={salvando} className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">Cancelar</button>
          <button
            onClick={salvar}
            disabled={salvando || !escolhida || (destino === 'cliente' && !clienteId)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary-hover disabled:opacity-40"
          >
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Vincular
          </button>
        </div>
      </div>
    </div>
  )
}
