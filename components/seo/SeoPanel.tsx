'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Search, Link2, RefreshCw, Unlink, Plug, AlertTriangle, CheckCircle2, Loader2,
  MousePointerClick, Eye, Percent, Gauge, X, Globe, TrendingUp, TrendingDown, Trash2, ChevronDown,
} from 'lucide-react'
import {
  formatCount, formatCtr, formatPosition, variation, br, PERMISSION_LABEL,
  type RangeKind,
} from '@/lib/gsc-core'
import AnalyticsPanel from '@/components/seo/AnalyticsPanel'
import GraficoDiario from '@/components/seo/GraficoDiario'
import { Button } from '@/components/vex/button'
import { Chip, Kpi, Painel, Pilulas, type Tom } from '@/components/vex/vireo'
import { PERIODOS } from '@/components/seo/periodos'

/* ---------------------------------- tipos ---------------------------------- */

interface PropriedadeVinculada {
  id: string
  siteUrl: string
  label: string
  isDomain: boolean
  permissionLevel: string | null
  isVexSite: boolean
  client: { id: string; name: string } | null
}

interface Status {
  configured: boolean
  missingEnv: string[]
  redirectUri: string
  connection: {
    id: string
    googleEmail: string
    status: string
    lastError: string | null
    lastSyncAt: string | null
    connectedAt: string
  } | null
  properties: PropriedadeVinculada[]
}

interface SiteDisponivel {
  siteUrl: string
  label: string
  isDomain: boolean
  permissionLevel: string | null
  permissionLabel: string | null
  canRead: boolean
  linked: boolean
}

interface Linha { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }

interface Relatorio {
  range: { startDate: string; endDate: string; kind: RangeKind; label: string }
  dataAvailableUntil: string
  timeZone: string
  cached: boolean
  fetchedAt: string
  report: {
    totals?: Linha
    previousTotals?: Linha
    byDate: Linha[]
    queries: Linha[]
    pages: Linha[]
  }
}

const STATUS_CONEXAO: Record<string, { texto: string; cls: string }> = {
  ATIVA: { texto: 'Conectado', cls: 'bg-success-suave text-success' },
  SEM_REFRESH: { texto: 'Sem renovação automática', cls: 'bg-warning-suave text-warning' },
  REVOGADA: { texto: 'Autorização expirada', cls: 'bg-destructive-suave text-destructive-texto' },
  ERRO: { texto: 'Erro na conexão', cls: 'bg-destructive-suave text-destructive-texto' },
}

/**
 * SEO: conecta a conta do Google, vincula propriedades do Search Console a
 * clientes ou ao site da VEX e mostra os indicadores reais do período.
 * Nada é estimado: sem conexão, sem propriedade ou sem dado, a tela diz o
 * que falta em vez de exibir zero.
 */
export default function SeoPanel({ clientes }: { clientes: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [status, setStatus] = useState<Status | null>(null)
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null)
  const [carregandoStatus, setCarregandoStatus] = useState(true)
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [vincular, setVincular] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [conexaoAberta, setConexaoAberta] = useState(false)

  const aba = params.get('aba') === 'analytics' ? 'analytics' : 'search-console'
  const propriedadeUrl = params.get('propriedade') ?? ''
  const periodo = (params.get('periodo') ?? '28d') as RangeKind
  const mes = params.get('mes') ?? ''
  const ano = params.get('ano') ?? ''
  const de = params.get('de') ?? ''
  const ate = params.get('ate') ?? ''

  const setParams = useCallback((next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') q.delete(k)
      else q.set(k, v)
    }
    q.delete('conectado'); q.delete('erro'); q.delete('aviso')
    router.replace(`${pathname}?${q.toString()}`, { scroll: false })
  }, [params, pathname, router])

  /* --------------------------- avisos do retorno --------------------------- */
  const retornoErro = params.get('erro')
  const retornoAviso = params.get('aviso')
  const conectado = params.get('conectado')
  const [retornoLido, setRetornoLido] = useState(false)
  if (!retornoLido && (retornoErro || retornoAviso || conectado)) {
    setRetornoLido(true)
    if (retornoErro) setErro(retornoErro)
    else if (retornoAviso) setAviso(retornoAviso)
    else setAviso('Conta do Google conectada.')
  }

  /* -------------------------------- dados -------------------------------- */
  // Sem setState síncrono: o estado só muda depois da resposta
  const carregarStatus = useCallback(() => fetch('/api/gsc/status')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
    .then(setStatus)
    .catch(() => setErro('Não foi possível carregar a integração.'))
    .finally(() => setCarregandoStatus(false)), [])

  useEffect(() => { carregarStatus() }, [carregarStatus])

  const propriedade = useMemo(
    () => status?.properties.find((p) => p.id === propriedadeUrl) ?? status?.properties[0] ?? null,
    [status, propriedadeUrl],
  )

  const carregarRelatorio = useCallback((forcar = false) => {
    if (!propriedade) return Promise.resolve()
    const q = new URLSearchParams({ propriedade: propriedade.id, periodo })
    if (mes) q.set('mes', mes)
    if (ano) q.set('ano', ano)
    if (de) q.set('de', de)
    if (ate) q.set('ate', ate)
    if (forcar) q.set('atualizar', '1')
    return fetch(`/api/gsc/relatorio?${q.toString()}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) {
          setRelatorio(null)
          setErro(body.error ?? 'Falha ao consultar o Search Console.')
          return
        }
        setErro(null)
        setRelatorio(body)
      })
      .catch(() => {
        setRelatorio(null)
        setErro('Falha de conexão ao consultar o Search Console.')
      })
      .finally(() => setCarregandoRelatorio(false))
  }, [propriedade, periodo, mes, ano, de, ate])

  useEffect(() => { carregarRelatorio() }, [carregarRelatorio])

  /* -------------------------------- ações -------------------------------- */
  async function desconectar() {
    if (!confirm('Desconectar a conta do Google? As propriedades vinculadas e o cache são removidos. O acesso é revogado no Google.')) return
    setOcupado(true)
    try {
      const res = await fetch('/api/gsc/desconectar', { method: 'POST' })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(b.error ?? 'Falha ao desconectar.'); return }
      setAviso('Conta desconectada.')
      setRelatorio(null)
      carregarStatus()
    } finally { setOcupado(false) }
  }

  async function desvincular(id: string) {
    if (!confirm('Desvincular esta propriedade? A conta do Google continua conectada.')) return
    setOcupado(true)
    try {
      const res = await fetch(`/api/gsc/propriedades?id=${id}`, { method: 'DELETE' })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(b.error ?? 'Falha ao desvincular.'); return }
      setAviso('Propriedade desvinculada.')
      carregarStatus()
    } finally { setOcupado(false) }
  }

  const totals = relatorio?.report.totals
  const anterior = relatorio?.report.previousTotals
  const semDados = !!relatorio && (totals?.impressions ?? 0) === 0 && (totals?.clicks ?? 0) === 0

  // Conexão em dia: a configuração some numa linha e abre em "Gerenciar"
  const conexaoOk = !!status?.connection && status.connection.status === 'ATIVA' && !status.connection.lastError && status.properties.length > 0
  const acoesConexao = (
    <div className="flex flex-wrap items-center gap-2">
      {status?.connection && (
        <>
          <Button variant="outline" size="sm" onClick={() => setVincular(true)} disabled={ocupado}>
            <Link2 /> Vincular propriedade
          </Button>
          <Button variant="outline" size="sm" onClick={desconectar} disabled={ocupado} className="hover:border-destructive/30 hover:text-destructive-texto">
            <Unlink /> Desconectar
          </Button>
        </>
      )}
      <a
        href="/api/gsc/oauth/start"
        className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium ${
          status?.configured ? 'bg-primary text-primary-foreground hover:bg-primary-hover' : 'bg-secondary text-muted-foreground pointer-events-none'
        }`}
      >
        <Plug className="w-4 h-4" />
        {status?.connection ? 'Reconectar' : 'Conectar Google Search Console'}
      </a>
    </div>
  )

  /* -------------------------------- render -------------------------------- */

  if (carregandoStatus) {
    return (
      <div className="space-y-3">
        <div className="h-24 bg-secondary rounded-[24px] animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-secondary rounded-[20px] animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {erro && (
        <p className="flex items-start gap-2 t-rotulo text-destructive-texto bg-destructive-suave border border-destructive/30 rounded-xl px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {erro}
        </p>
      )}
      {aviso && (
        <p className="flex items-start gap-2 t-rotulo text-success bg-success-suave border border-success/30 rounded-xl px-4 py-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> {aviso}
        </p>
      )}

      {/* Search Console e Analytics: cada um com suas definições */}
      <Pilulas
        rotulo="Fonte dos dados"
        valor={aba}
        aoMudar={(k) => setParams({ aba: k === 'search-console' ? null : k })}
        opcoes={[{ valor: 'search-console', rotulo: 'Search Console' }, { valor: 'analytics', rotulo: 'Analytics' }]}
      />

      {aba === 'analytics' ? (
        <AnalyticsPanel
          clientes={clientes}
          periodo={periodo}
          mes={mes}
          ano={ano}
          de={de}
          ate={ate}
          onPeriodo={setParams}
        />
      ) : (
      <>

      {/* Credenciais ausentes: pendência de configuração, não erro do usuário */}
      {!status?.configured && (
        <CredenciaisCard
          missingEnv={status?.missingEnv ?? []}
          redirectUri={status?.redirectUri ?? ''}
          onSalvo={() => { setAviso('Credenciais salvas. Já pode conectar a conta do Google.'); carregarStatus() }}
        />
      )}

      {/* Conexão: já ligada e sem erro, fica recolhida numa linha */}
      <section className="rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="min-w-0 flex items-center gap-3">
            <Chip icone={Plug} tom={conexaoOk ? 'sucesso' : status?.connection ? 'atencao' : 'neutro'} />
            <div className="min-w-0">
              <p className="t-secao text-foreground">Google Search Console</p>
              {status?.connection ? (
                <p className="t-legenda mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="truncate">{status.connection.googleEmail}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${STATUS_CONEXAO[status.connection.status]?.cls ?? 'bg-secondary text-muted-foreground'}`}>
                    {STATUS_CONEXAO[status.connection.status]?.texto ?? status.connection.status}
                  </span>
                  <span>{status.properties.length} propriedade(s)</span>
                  {status.connection.lastSyncAt && (
                    <span>· última consulta {new Date(status.connection.lastSyncAt).toLocaleString('pt-BR')}</span>
                  )}
                </p>
              ) : (
                <p className="t-legenda mt-0.5">Nenhuma conta conectada.</p>
              )}
              {status?.connection?.lastError && (
                <p className="t-legenda text-destructive-texto mt-1">{status.connection.lastError}</p>
              )}
            </div>
          </div>

          {conexaoOk ? (
            <button
              onClick={() => setConexaoAberta((v) => !v)}
              aria-expanded={conexaoAberta}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {conexaoAberta ? 'Recolher' : 'Gerenciar conexão'}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${conexaoAberta ? 'rotate-180' : ''}`} />
            </button>
          ) : acoesConexao}
        </div>

        {conexaoOk && conexaoAberta && (
          <div className="px-6 pb-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {acoesConexao}
          </div>
        )}

        {/* Propriedades vinculadas: escolhem o que o painel mostra */}
        {status?.connection && (
          <div className="px-6 pb-5 pt-4 border-t border-border">
            {status.properties.length === 0 ? (
              <p className="t-legenda">
                Nenhuma propriedade vinculada ainda. Use “Vincular propriedade” para escolher um site do Search Console.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {status.properties.map((p) => {
                  const ativa = propriedade?.id === p.id
                  return (
                    <span
                      key={p.id}
                      className={`inline-flex items-center gap-1.5 h-8 pl-3 pr-1 rounded-full border text-[11.5px] font-medium ${
                        ativa ? 'border-marca bg-marca-suave text-marca-texto' : 'border-border text-muted-foreground'
                      }`}
                    >
                      <button onClick={() => setParams({ propriedade: p.id })} className="inline-flex items-center gap-1.5">
                        <Globe className="w-3 h-3" />
                        {p.label}
                        <span className="text-muted-foreground">
                          {p.isVexSite ? 'VEX' : p.client?.name ?? 'sem cliente'}
                        </span>
                      </button>
                      {(!conexaoOk || conexaoAberta) && (
                        <button
                          onClick={() => desvincular(p.id)}
                          aria-label={`Desvincular ${p.label}`}
                          className="p-1 rounded-full hover:bg-secondary text-muted-foreground"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Período e atualização */}
      {propriedade && (
        <div className="flex flex-wrap items-center gap-2">
          <Pilulas
            rotulo="Período"
            valor={periodo}
            aoMudar={(k) => setParams({ periodo: k })}
            opcoes={PERIODOS}
          />

          {periodo === 'mes' && (
            <input
              type="month"
              value={mes || new Date().toISOString().slice(0, 7)}
              onChange={(e) => setParams({ mes: e.target.value })}
              className="h-9 px-2 text-xs border border-border rounded-lg bg-card text-foreground"
              aria-label="Mês"
            />
          )}
          {periodo === 'ano' && (
            <input
              type="number" min={2015} max={2100}
              value={ano || new Date().getFullYear()}
              onChange={(e) => setParams({ ano: e.target.value })}
              className="h-9 w-24 px-2 text-xs border border-border rounded-lg bg-card text-foreground"
              aria-label="Ano"
            />
          )}
          {periodo === 'custom' && (
            <>
              <input type="date" value={de} onChange={(e) => setParams({ de: e.target.value })} className="h-9 px-2 text-xs border border-border rounded-lg bg-card text-foreground" aria-label="Data inicial" />
              <input type="date" value={ate} onChange={(e) => setParams({ ate: e.target.value })} className="h-9 px-2 text-xs border border-border rounded-lg bg-card text-foreground" aria-label="Data final" />
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => { setCarregandoRelatorio(true); carregarRelatorio(true) }}
            disabled={carregandoRelatorio}
            className="ml-auto"
          >
            <RefreshCw className={carregandoRelatorio ? 'animate-spin' : ''} /> Atualizar
          </Button>
        </div>
      )}

      {/* Estados */}
      {!status?.connection ? (
        <Vazio icone={Plug} titulo="Conecte a conta do Google">
          A conexão pede apenas leitura do Search Console. Depois de autorizar, escolha as propriedades e vincule a cada cliente ou ao site da VEX.
        </Vazio>
      ) : !propriedade ? (
        <Vazio icone={Globe} titulo="Nenhuma propriedade vinculada">
          Vincule um site do Search Console para ver os indicadores.
        </Vazio>
      ) : carregandoRelatorio && !relatorio ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-secondary rounded-[20px] animate-pulse" />)}
        </div>
      ) : !relatorio ? (
        <Vazio icone={AlertTriangle} tom="atencao" titulo="Sem resposta do Search Console">
          {erro ?? 'Tente atualizar em instantes.'}
        </Vazio>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              { label: 'Cliques', valor: formatCount(Math.round(totals?.clicks ?? 0)), icon: MousePointerClick, tom: 'marca', atual: totals?.clicks ?? 0, ant: anterior?.clicks ?? 0 },
              { label: 'Impressões', valor: formatCount(Math.round(totals?.impressions ?? 0)), icon: Eye, tom: 'info', atual: totals?.impressions ?? 0, ant: anterior?.impressions ?? 0 },
              { label: 'CTR', valor: formatCtr(totals?.ctr ?? 0), icon: Percent, tom: 'sucesso', atual: totals?.ctr ?? 0, ant: anterior?.ctr ?? 0 },
              { label: 'Posição média', valor: formatPosition(totals?.position ?? 0), icon: Gauge, tom: 'atencao', atual: totals?.position ?? 0, ant: anterior?.position ?? 0, inverso: true },
            ] as const).map((c) => {
              const v = variation(c.atual, c.ant)
              const sobe = (v ?? 0) >= 0
              const bom = 'inverso' in c ? !sobe : sobe
              return (
                <Kpi
                  key={c.label}
                  icone={c.icon}
                  tom={c.tom}
                  rotulo={c.label}
                  valor={c.valor}
                  tendencia={v == null ? undefined : { texto: `${v > 0 ? '+' : ''}${v.toFixed(0)}%`, bom: v === 0 || bom }}
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
            {' '}dados disponíveis até {br(relatorio.dataAvailableUntil)} (fuso {relatorio.timeZone}) ·
            {' '}consulta de {new Date(relatorio.fetchedAt).toLocaleString('pt-BR')}{relatorio.cached ? ', do cache' : ''}
          </p>

          {semDados ? (
            <Vazio icone={Search} titulo="Sem dados neste período">
              A propriedade respondeu, mas não há cliques nem impressões entre {br(relatorio.range.startDate)} e {br(relatorio.range.endDate)}.
            </Vazio>
          ) : (
            <>
              <EvolucaoPorData linhas={relatorio.report.byDate} periodo={relatorio.range.label} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Tabela titulo="Principais consultas" linhas={relatorio.report.queries} />
                <Tabela titulo="Principais páginas" linhas={relatorio.report.pages} />
              </div>
            </>
          )}
        </>
      )}

      </>
      )}

      {vincular && status?.connection && (
        <VincularModal
          clientes={clientes}
          onClose={() => setVincular(false)}
          onDone={(msg) => { setVincular(false); setAviso(msg); carregarStatus() }}
        />
      )}
    </div>
  )
}

/* ------------------------------ estado vazio ------------------------------ */

/** Cartão de estado (sem conexão, sem propriedade, sem dado). */
export function Vazio({ icone, titulo, tom = 'neutro', children }: { icone: React.ElementType; titulo: string; tom?: Tom; children?: React.ReactNode }) {
  return (
    <Painel className="text-center py-10">
      <Chip icone={icone} tom={tom} tamanho="lg" className="mx-auto" />
      <p className="t-secao text-foreground mt-3">{titulo}</p>
      {children && <p className="t-legenda mt-1 max-w-md mx-auto">{children}</p>}
    </Painel>
  )
}

/* ------------------------------ evolução ------------------------------ */

function EvolucaoPorData({ linhas, periodo }: { linhas: Linha[]; periodo: string }) {
  if (linhas.length === 0) return null
  return (
    <Painel rotulo="Search Console" titulo="Evolução por data" sub={`Cliques por dia · ${periodo}`}>
      <GraficoDiario
        metrica="Cliques"
        unidade="cliques por dia"
        pontos={linhas.map((l) => {
          const dia = l.keys?.[0] ?? ''
          return {
            chave: dia,
            rotulo: br(dia).slice(0, 5),
            valor: l.clicks ?? 0,
            dica: `${br(dia)} · ${formatCount(Math.round(l.clicks ?? 0))} clique(s) · ${formatCount(Math.round(l.impressions ?? 0))} impressões`,
          }
        })}
      />
    </Painel>
  )
}

/* ------------------------------- tabelas ------------------------------- */

function Tabela({ titulo, linhas }: { titulo: string; linhas: Linha[] }) {
  return (
    <Painel rotulo="Search Console" titulo={titulo} sub="Principais resultados: o Google não devolve todas as linhas." semPadding className="overflow-hidden">
      {linhas.length === 0 ? (
        <p className="t-legenda text-center py-6 border-t border-border">Nada no período</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[420px]">
            <thead className="bg-secondary/60 border-y border-border">
              <tr className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                <th className="px-6 py-2.5">Item</th>
                <th className="px-3 py-2.5">Cliques</th>
                <th className="px-3 py-2.5">Impressões</th>
                <th className="px-3 py-2.5">CTR</th>
                <th className="px-3 py-2.5 pr-6">Posição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((l) => (
                <tr key={l.keys?.[0]} className="hover:bg-secondary/40">
                  <td className="px-6 py-2.5 max-w-[260px] truncate text-foreground" title={l.keys?.[0]}>{l.keys?.[0]}</td>
                  <td className="px-3 py-2.5 text-foreground font-semibold tabular">{formatCount(Math.round(l.clicks ?? 0))}</td>
                  <td className="px-3 py-2.5 text-muted-foreground tabular">{formatCount(Math.round(l.impressions ?? 0))}</td>
                  <td className="px-3 py-2.5 text-muted-foreground tabular">{formatCtr(l.ctr ?? 0)}</td>
                  <td className="px-3 py-2.5 pr-6 text-muted-foreground tabular">{formatPosition(l.position ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Painel>
  )
}

/* ---------------------------- vincular propriedade ---------------------------- */

function VincularModal({
  clientes, onClose, onDone,
}: {
  clientes: Array<{ id: string; name: string }>
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [sites, setSites] = useState<SiteDisponivel[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<string>('')
  const [destino, setDestino] = useState<'cliente' | 'vex'>('cliente')
  const [clienteId, setClienteId] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    fetch('/api/gsc/sites')
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b.error ?? 'Falha ao listar propriedades.')
        setSites(b.sites)
      })
      .catch((e) => setErro(e.message))
  }, [])

  const filtrados = (sites ?? []).filter((s) => s.label.toLowerCase().includes(busca.trim().toLowerCase()))

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const res = await fetch('/api/gsc/propriedades', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl: escolhido,
          isVexSite: destino === 'vex',
          clientId: destino === 'cliente' ? clienteId : null,
        }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(b.error ?? 'Não foi possível vincular.'); return }
      onDone('Propriedade vinculada.')
    } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-veu flex items-end sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-lg rounded-t-[24px] sm:rounded-[24px] shadow-xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border sticky top-0 bg-card">
          <h3 className="font-bold text-foreground">Vincular propriedade</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-secondary rounded-lg"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          {erro && <p className="text-xs text-destructive-texto bg-destructive-suave border border-destructive/30 rounded-lg px-3 py-2">{erro}</p>}

          {sites === null && !erro ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Consultando o Search Console…</p>
          ) : sites && sites.length === 0 ? (
            <p className="text-xs text-warning bg-warning-suave border border-warning/20 rounded-lg px-3 py-2">
              A conta conectada não tem nenhuma propriedade no Search Console. Adicione o site à conta no Search Console e tente de novo.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar propriedade"
                  className="w-full h-10 pl-9 pr-3 text-xs border border-border rounded-lg"
                />
              </div>
              <div className="max-h-56 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {filtrados.map((s) => (
                  <button
                    key={s.siteUrl}
                    onClick={() => setEscolhido(s.siteUrl)}
                    disabled={!s.canRead}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 disabled:opacity-40 ${escolhido === s.siteUrl ? 'bg-marca/5' : 'hover:bg-secondary/60'}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground truncate">{s.label}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {s.isDomain ? 'propriedade de domínio' : 'prefixo de URL'}
                        {s.permissionLabel ? ` · ${s.permissionLabel}` : ''}
                        {s.linked ? ' · já vinculada' : ''}
                      </span>
                    </span>
                    {escolhido === s.siteUrl && <CheckCircle2 className="w-4 h-4 text-marca-texto shrink-0" />}
                  </button>
                ))}
                {filtrados.length === 0 && <p className="px-3 py-3 text-[11px] text-muted-foreground">Nada com esse nome.</p>}
              </div>

              <div className="flex items-center gap-3 text-xs text-foreground pt-1">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={destino === 'cliente'} onChange={() => setDestino('cliente')} /> Cliente
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={destino === 'vex'} onChange={() => setDestino('vex')} /> Site da VEX
                </label>
              </div>
              {destino === 'cliente' && (
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="input text-sm">
                  <option value="">Selecione o cliente…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 sm:p-5 border-t border-border sticky bottom-0 bg-card">
          <button onClick={onClose} disabled={salvando} className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">Cancelar</button>
          <button
            onClick={salvar}
            disabled={salvando || !escolhido || (destino === 'cliente' && !clienteId)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary-hover disabled:opacity-40"
          >
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Vincular
          </button>
        </div>
      </div>
    </div>
  )
}

export { PERMISSION_LABEL }

/* ----------------------------- credenciais ----------------------------- */

/**
 * Formulário das credenciais do cliente OAuth. Existe para o segredo ir
 * direto do Google Cloud para o servidor, cifrado, sem passar por chat,
 * e-mail ou repositório. Variável de ambiente, se houver, tem prioridade.
 */
function CredenciaisCard({
  missingEnv, redirectUri, onSalvo,
}: {
  missingEnv: string[]
  redirectUri: string
  onSalvo: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const res = await fetch('/api/gsc/credenciais', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(b.error ?? 'Não foi possível salvar.'); return }
      setClientSecret('')
      onSalvo()
    } finally { setSalvando(false) }
  }

  return (
    <div className="bg-card border border-warning/30 rounded-[24px] p-6 space-y-3">
      <div>
        <p className="font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" /> Configuração pendente
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Falta no servidor: <span className="font-mono text-xs">{missingEnv.join(', ')}</span>.
          Cole abaixo as credenciais do cliente OAuth. O segredo é gravado cifrado e nunca volta para a tela.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs bg-secondary/60 border border-border rounded-lg px-3 py-2">
        <span className="text-muted-foreground shrink-0">URI de retorno:</span>
        <span className="font-mono text-[11px] text-foreground truncate">{redirectUri}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(redirectUri); setCopiado(true) }}
          className="ml-auto text-[11px] font-semibold text-marca-texto hover:underline shrink-0"
        >
          {copiado ? 'copiado' : 'copiar'}
        </button>
      </div>

      {erro && <p className="text-xs text-destructive-texto bg-destructive-suave border border-destructive/30 rounded-lg px-3 py-2">{erro}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Client ID</label>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="000000000000-xxxxx.apps.googleusercontent.com"
            className="input text-sm font-mono"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Client secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="GOCSPX-..."
            className="input text-sm font-mono"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          O Google não mostra o segredo depois de criado. Se você não tem mais o valor, gere um novo em “Add secret”.
        </p>
        <button
          onClick={salvar}
          disabled={salvando || !clientId.trim() || !clientSecret.trim()}
          className="shrink-0 flex items-center gap-1.5 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary-hover disabled:opacity-40"
        >
          {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar credenciais
        </button>
      </div>
    </div>
  )
}
