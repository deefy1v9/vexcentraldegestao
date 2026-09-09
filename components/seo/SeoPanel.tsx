'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Search, Link2, RefreshCw, Unlink, Plug, AlertTriangle, CheckCircle2, Loader2,
  MousePointerClick, Eye, Percent, Gauge, X, Globe, TrendingUp, TrendingDown, Trash2,
} from 'lucide-react'
import {
  formatCount, formatCtr, formatPosition, variation, br, PERMISSION_LABEL,
  type RangeKind,
} from '@/lib/gsc-core'

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
  ATIVA: { texto: 'Conectado', cls: 'bg-green-100 text-green-700' },
  SEM_REFRESH: { texto: 'Sem renovação automática', cls: 'bg-orange-100 text-orange-700' },
  REVOGADA: { texto: 'Autorização expirada', cls: 'bg-red-100 text-red-700' },
  ERRO: { texto: 'Erro na conexão', cls: 'bg-red-100 text-red-700' },
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

  /* -------------------------------- render -------------------------------- */

  if (carregandoStatus) {
    return (
      <div className="space-y-3">
        <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {erro && (
        <p className="flex items-start gap-2 text-xs font-medium text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {erro}
        </p>
      )}
      {aviso && (
        <p className="flex items-start gap-2 text-xs font-medium text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> {aviso}
        </p>
      )}

      {/* Credenciais ausentes: pendência de configuração, não erro do usuário */}
      {!status?.configured && (
        <div className="bg-white border border-orange-200 rounded-xl p-5">
          <p className="font-semibold text-gray-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /> Configuração pendente</p>
          <p className="text-sm text-gray-600 mt-1">
            Falta preencher no servidor: <span className="font-mono text-xs">{status?.missingEnv.join(', ')}</span>.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            URI de retorno que precisa estar cadastrada no Google Cloud:{' '}
            <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded">{status?.redirectUri}</span>
          </p>
        </div>
      )}

      {/* Conexão */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 flex items-center gap-2">
              <Plug className="w-4 h-4 text-[#030A8C]" /> Google Search Console
            </p>
            {status?.connection ? (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                <span className="truncate">{status.connection.googleEmail}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CONEXAO[status.connection.status]?.cls ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_CONEXAO[status.connection.status]?.texto ?? status.connection.status}
                </span>
                {status.connection.lastSyncAt && (
                  <span className="text-gray-400">última consulta {new Date(status.connection.lastSyncAt).toLocaleString('pt-BR')}</span>
                )}
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">Nenhuma conta conectada.</p>
            )}
            {status?.connection?.lastError && (
              <p className="text-xs text-red-600 mt-1">{status.connection.lastError}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {status?.connection && (
              <>
                <button
                  onClick={() => setVincular(true)}
                  disabled={ocupado}
                  className="h-9 px-3 inline-flex items-center gap-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] disabled:opacity-50"
                >
                  <Link2 className="w-3.5 h-3.5" /> Vincular propriedade
                </button>
                <button
                  onClick={desconectar}
                  disabled={ocupado}
                  className="h-9 px-3 inline-flex items-center gap-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                >
                  <Unlink className="w-3.5 h-3.5" /> Desconectar
                </button>
              </>
            )}
            <a
              href="/api/gsc/oauth/start"
              className={`h-9 px-4 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-white ${
                status?.configured ? 'bg-[#030A8C] hover:bg-[#02077a]' : 'bg-gray-300 pointer-events-none'
              }`}
            >
              <Plug className="w-3.5 h-3.5" />
              {status?.connection ? 'Reconectar' : 'Conectar Google Search Console'}
            </a>
          </div>
        </div>

        {/* Propriedades vinculadas */}
        {status?.connection && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            {status.properties.length === 0 ? (
              <p className="text-xs text-gray-500">
                Nenhuma propriedade vinculada ainda. Use “Vincular propriedade” para escolher um site do Search Console.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {status.properties.map((p) => {
                  const ativa = propriedade?.id === p.id
                  return (
                    <span
                      key={p.id}
                      className={`inline-flex items-center gap-1.5 h-8 pl-3 pr-1 rounded-full border text-[11px] font-medium ${
                        ativa ? 'border-[#030A8C] bg-[#030A8C]/5 text-[#030A8C]' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <button onClick={() => setParams({ propriedade: p.id })} className="inline-flex items-center gap-1.5">
                        <Globe className="w-3 h-3" />
                        {p.label}
                        <span className="text-gray-400">
                          {p.isVexSite ? 'VEX' : p.client?.name ?? 'sem cliente'}
                        </span>
                      </button>
                      <button
                        onClick={() => desvincular(p.id)}
                        aria-label={`Desvincular ${p.label}`}
                        className="p-1 rounded-full hover:bg-gray-100 text-gray-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Período e atualização */}
      {propriedade && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 h-10">
            {([['28d', '28 dias'], ['mes', 'Mensal'], ['ano', 'Anual'], ['custom', 'Período']] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setParams({ periodo: k })}
                aria-pressed={periodo === k}
                className={`px-3 h-9 rounded-md text-xs font-semibold ${periodo === k ? 'bg-white text-[#030A8C] shadow-sm' : 'text-gray-500'}`}
              >
                {l}
              </button>
            ))}
          </div>

          {periodo === 'mes' && (
            <input
              type="month"
              value={mes || new Date().toISOString().slice(0, 7)}
              onChange={(e) => setParams({ mes: e.target.value })}
              className="h-10 px-2 text-xs border border-gray-200 rounded-lg bg-white"
              aria-label="Mês"
            />
          )}
          {periodo === 'ano' && (
            <input
              type="number" min={2015} max={2100}
              value={ano || new Date().getFullYear()}
              onChange={(e) => setParams({ ano: e.target.value })}
              className="h-10 w-24 px-2 text-xs border border-gray-200 rounded-lg bg-white"
              aria-label="Ano"
            />
          )}
          {periodo === 'custom' && (
            <>
              <input type="date" value={de} onChange={(e) => setParams({ de: e.target.value })} className="h-10 px-2 text-xs border border-gray-200 rounded-lg bg-white" aria-label="Data inicial" />
              <input type="date" value={ate} onChange={(e) => setParams({ ate: e.target.value })} className="h-10 px-2 text-xs border border-gray-200 rounded-lg bg-white" aria-label="Data final" />
            </>
          )}

          <button
            onClick={() => { setCarregandoRelatorio(true); carregarRelatorio(true) }}
            disabled={carregandoRelatorio}
            className="ml-auto h-10 px-3 inline-flex items-center gap-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:border-[#030A8C] hover:text-[#030A8C] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregandoRelatorio ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      )}

      {/* Estados */}
      {!status?.connection ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <Plug className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-900">Conecte a conta do Google</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            A conexão pede apenas leitura do Search Console. Depois de autorizar, escolha as propriedades e vincule a cada cliente ou ao site da VEX.
          </p>
        </div>
      ) : !propriedade ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <Globe className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-900">Nenhuma propriedade vinculada</p>
          <p className="text-xs text-gray-500 mt-1">Vincule um site do Search Console para ver os indicadores.</p>
        </div>
      ) : carregandoRelatorio && !relatorio ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : !relatorio ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-orange-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-900">Sem resposta do Search Console</p>
          <p className="text-xs text-gray-500 mt-1">{erro ?? 'Tente atualizar em instantes.'}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Cliques', valor: formatCount(Math.round(totals?.clicks ?? 0)), icon: MousePointerClick, cor: '#030A8C', atual: totals?.clicks ?? 0, ant: anterior?.clicks ?? 0 },
              { label: 'Impressões', valor: formatCount(Math.round(totals?.impressions ?? 0)), icon: Eye, cor: '#6366f1', atual: totals?.impressions ?? 0, ant: anterior?.impressions ?? 0 },
              { label: 'CTR', valor: formatCtr(totals?.ctr ?? 0), icon: Percent, cor: '#10b981', atual: totals?.ctr ?? 0, ant: anterior?.ctr ?? 0 },
              { label: 'Posição média', valor: formatPosition(totals?.position ?? 0), icon: Gauge, cor: '#F74A13', atual: totals?.position ?? 0, ant: anterior?.position ?? 0, inverso: true },
            ].map((c) => {
              const v = variation(c.atual, c.ant)
              const sobe = (v ?? 0) >= 0
              const bom = c.inverso ? !sobe : sobe
              return (
                <div key={c.label} className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-xs font-medium text-gray-500">{c.label}</p>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: c.cor + '1f' }}>
                      <c.icon className="w-3.5 h-3.5" style={{ color: c.cor }} />
                    </div>
                  </div>
                  <p className="text-xl font-bold text-gray-900 leading-tight">{c.valor}</p>
                  {v == null ? (
                    <p className="text-[11px] text-gray-400 mt-1">Sem base de comparação</p>
                  ) : (
                    <p className={`text-[11px] font-semibold mt-1 inline-flex items-center gap-1 ${v === 0 ? 'text-gray-400' : bom ? 'text-green-600' : 'text-red-600'}`}>
                      {sobe ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {v > 0 ? '+' : ''}{v.toFixed(0)}% vs período anterior
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-gray-400">
            {relatorio.range.label} · {br(relatorio.range.startDate)} a {br(relatorio.range.endDate)} ·
            {' '}dados disponíveis até {br(relatorio.dataAvailableUntil)} (fuso {relatorio.timeZone}) ·
            {' '}consulta de {new Date(relatorio.fetchedAt).toLocaleString('pt-BR')}{relatorio.cached ? ', do cache' : ''}
          </p>

          {semDados ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-900">Sem dados neste período</p>
              <p className="text-xs text-gray-500 mt-1">
                A propriedade respondeu, mas não há cliques nem impressões entre {br(relatorio.range.startDate)} e {br(relatorio.range.endDate)}.
              </p>
            </div>
          ) : (
            <>
              <EvolucaoPorData linhas={relatorio.report.byDate} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Tabela titulo="Principais consultas" linhas={relatorio.report.queries} />
                <Tabela titulo="Principais páginas" linhas={relatorio.report.pages} />
              </div>
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

/* ------------------------------ evolução ------------------------------ */

function EvolucaoPorData({ linhas }: { linhas: Linha[] }) {
  if (linhas.length === 0) return null
  const max = Math.max(...linhas.map((l) => l.clicks ?? 0), 1)
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-gray-900 mb-3">Evolução por data</p>
      <div className="flex items-end gap-0.5 h-32 overflow-x-auto">
        {linhas.map((l) => {
          const dia = l.keys?.[0] ?? ''
          const altura = Math.max(2, Math.round(((l.clicks ?? 0) / max) * 100))
          return (
            <div
              key={dia}
              title={`${br(dia)} · ${formatCount(Math.round(l.clicks ?? 0))} clique(s) · ${formatCount(Math.round(l.impressions ?? 0))} impressões`}
              className="flex-1 min-w-[3px] bg-[#030A8C] rounded-t hover:bg-[#F74A13] transition-colors"
              style={{ height: `${altura}%` }}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>{br(linhas[0]?.keys?.[0] ?? '')}</span>
        <span>{br(linhas[linhas.length - 1]?.keys?.[0] ?? '')}</span>
      </div>
    </div>
  )
}

/* ------------------------------- tabelas ------------------------------- */

function Tabela({ titulo, linhas }: { titulo: string; linhas: Linha[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900">{titulo}</p>
        <p className="text-[10px] text-gray-400">Principais resultados: o Google não devolve todas as linhas.</p>
      </div>
      {linhas.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">Nada no período</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[420px]">
            <thead className="bg-gray-50">
              <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase">
                <th className="px-4 py-2">Item</th>
                <th className="px-3 py-2">Cliques</th>
                <th className="px-3 py-2">Impressões</th>
                <th className="px-3 py-2">CTR</th>
                <th className="px-3 py-2">Posição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {linhas.map((l) => (
                <tr key={l.keys?.[0]} className="hover:bg-gray-50">
                  <td className="px-4 py-2 max-w-[260px] truncate text-gray-900" title={l.keys?.[0]}>{l.keys?.[0]}</td>
                  <td className="px-3 py-2 text-gray-900">{formatCount(Math.round(l.clicks ?? 0))}</td>
                  <td className="px-3 py-2 text-gray-600">{formatCount(Math.round(l.impressions ?? 0))}</td>
                  <td className="px-3 py-2 text-gray-600">{formatCtr(l.ctr ?? 0)}</td>
                  <td className="px-3 py-2 text-gray-600">{formatPosition(l.position ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-bold text-gray-900">Vincular propriedade</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

          {sites === null && !erro ? (
            <p className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Consultando o Search Console…</p>
          ) : sites && sites.length === 0 ? (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
              A conta conectada não tem nenhuma propriedade no Search Console. Adicione o site à conta no Search Console e tente de novo.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar propriedade"
                  className="w-full h-10 pl-9 pr-3 text-xs border border-gray-200 rounded-lg"
                />
              </div>
              <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                {filtrados.map((s) => (
                  <button
                    key={s.siteUrl}
                    onClick={() => setEscolhido(s.siteUrl)}
                    disabled={!s.canRead}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 disabled:opacity-40 ${escolhido === s.siteUrl ? 'bg-[#030A8C]/5' : 'hover:bg-gray-50'}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-900 truncate">{s.label}</span>
                      <span className="block text-[10px] text-gray-400">
                        {s.isDomain ? 'propriedade de domínio' : 'prefixo de URL'}
                        {s.permissionLabel ? ` · ${s.permissionLabel}` : ''}
                        {s.linked ? ' · já vinculada' : ''}
                      </span>
                    </span>
                    {escolhido === s.siteUrl && <CheckCircle2 className="w-4 h-4 text-[#030A8C] shrink-0" />}
                  </button>
                ))}
                {filtrados.length === 0 && <p className="px-3 py-3 text-[11px] text-gray-400">Nada com esse nome.</p>}
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-700 pt-1">
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

        <div className="flex justify-end gap-2 p-4 sm:p-5 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} disabled={salvando} className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900">Cancelar</button>
          <button
            onClick={salvar}
            disabled={salvando || !escolhido || (destino === 'cliente' && !clienteId)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40"
          >
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Vincular
          </button>
        </div>
      </div>
    </div>
  )
}

export { PERMISSION_LABEL }
