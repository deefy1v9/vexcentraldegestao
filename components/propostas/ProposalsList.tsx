'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileText, Filter, Search, Download, Send, Copy, MoreHorizontal, Check, X, Loader2, FilePlus2,
  PencilLine, CircleCheck, CalendarX2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Kpi, TOM, type Tom } from '@/components/vex/vireo'

interface Row {
  id: string
  number: string
  kind: string
  status: string
  recipientName: string
  recipientKind: string
  documentMasked: string
  issueDate: string
  validUntil: string
  monthly: string
  total: string
  months: number
  services: string[]
  owner: string
  updatedAt: string
  validLabel: string
}

/** Rótulo e cor de cada status (tokens de estado; navy fica para a seleção). */
export const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  RASCUNHO: { label: 'Rascunho', cls: 'bg-secondary text-muted-foreground' },
  GERADA: { label: 'Gerada', cls: 'bg-secondary text-foreground' },
  ENVIADA: { label: 'Enviada', cls: 'bg-info-suave text-info' },
  VISUALIZADA: { label: 'Visualizada', cls: 'bg-info-suave text-info' },
  APROVADA: { label: 'Aprovada', cls: 'bg-success-suave text-success' },
  RECUSADA: { label: 'Recusada', cls: 'bg-destructive-suave text-destructive-texto' },
  EXPIRADA: { label: 'Expirada', cls: 'bg-warning-suave text-warning' },
  CANCELADA: { label: 'Cancelada', cls: 'bg-secondary text-muted-foreground' },
  SUBSTITUIDA: { label: 'Substituída', cls: 'bg-secondary text-muted-foreground' },
}

/** As abas do topo da tabela (modelo Vireo); os demais status ficam no filtro. */
const ABAS: Array<{ status: string; label: string }> = [
  { status: '', label: 'Todas' },
  { status: 'RASCUNHO', label: 'Rascunho' },
  { status: 'ENVIADA', label: 'Enviadas' },
  { status: 'VISUALIZADA', label: 'Visualizadas' },
  { status: 'APROVADA', label: 'Aprovadas' },
  { status: 'RECUSADA', label: 'Recusadas' },
]

const ABERTAS = ['GERADA', 'ENVIADA', 'VISUALIZADA']
const TONS: Tom[] = ['marca', 'info', 'sucesso', 'atencao', 'neutro']
function tomDe(nome: string): Tom {
  let h = 0
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TONS[h % TONS.length]
}
const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'

function fmt(d: string) {
  const iso = d.slice(0, 10)
  const [y, m, day] = iso.split('-')
  return `${day}/${m}/${y}`
}

/** Selo de status: a cor nunca vem sozinha, sempre com o rótulo. */
function StatusPill({ status }: { status: string }) {
  const st = STATUS_LABEL[status] ?? { label: status, cls: 'bg-secondary text-muted-foreground' }
  return (
    <span className={cn('inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-[11.5px] font-semibold whitespace-nowrap', st.cls)}>
      <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {st.label}
    </span>
  )
}

/**
 * Lista de propostas e aditivos. Documento sempre mascarado; exclusão
 * destrutiva não aparece na tabela (cancelar preserva o histórico).
 */
export default function ProposalsList({ clientId, compact = false }: { clientId?: string; compact?: boolean }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ q: '', status: '', kind: '', from: '', to: '', validity: '' })
  // Contagem por status: guardada da última busca sem status, para as abas
  // e os indicadores não sumirem quando uma aba filtra a lista
  const [contagem, setContagem] = useState<Record<string, number> | null>(null)
  const [vencidas, setVencidas] = useState(0)

  const load = useCallback(() => {
    const params = new URLSearchParams()
    if (clientId) params.set('clientId', clientId)
    if (filters.q) params.set('q', filters.q)
    if (filters.status) params.set('status', filters.status)
    if (filters.kind) params.set('kind', filters.kind)
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    fetch(`/api/propostas?${params}`)
      .then((r) => (r.ok ? r.json() : { proposals: [] }))
      .then((b) => {
        const lista: Row[] = b.proposals ?? []
        setRows(lista)
        if (!filters.status) {
          const c: Record<string, number> = {}
          for (const r of lista) c[r.status] = (c[r.status] ?? 0) + 1
          setContagem({ ...c, '': lista.length })
          const today = new Date().toISOString().slice(0, 10)
          setVencidas(lista.filter((r) => ABERTAS.includes(r.status) && r.validUntil.slice(0, 10) < today).length)
        }
      })
      .finally(() => setLoading(false))
  }, [clientId, filters])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    if (!filters.validity) return rows
    const today = new Date().toISOString().slice(0, 10)
    return rows.filter((r) => (filters.validity === 'valida'
      ? r.validUntil.slice(0, 10) >= today
      : r.validUntil.slice(0, 10) < today))
  }, [rows, filters.validity])

  async function act(id: string, payload: Record<string, unknown>, okMsg: string) {
    setBusy(id)
    setMsg(null)
    try {
      const res = await fetch(`/api/propostas/${id}/acoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(body.error || 'Falha na operação.'); return }
      setMsg(body.message || okMsg)
      if (payload.action === 'duplicar' && body.id) router.push(`/propostas/${body.id}`)
      else load()
    } finally {
      setBusy(null)
      setMenu(null)
    }
  }

  async function download(id: string, format: 'PDF' | 'DOCX') {
    setBusy(id)
    try {
      const gen = await fetch(`/api/propostas/${id}/documento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      })
      const body = await gen.json().catch(() => ({}))
      if (!gen.ok) { setMsg(body.error || 'Não foi possível gerar o documento.'); return }
      window.open(`/api/propostas/${id}/documento?format=${format}`, '_blank', 'noopener')
      load()
    } finally {
      setBusy(null)
      setMenu(null)
    }
  }

  const n = (status: string) => contagem?.[status] ?? 0
  const emAberto = ABERTAS.reduce((a, s) => a + n(s), 0)
  const comIndicadores = !compact && !clientId

  return (
    <div className="space-y-5">
      {/* Indicadores do topo (modelo Vireo de faturas): só na lista geral */}
      {comIndicadores && contagem && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <Kpi icone={Send} tom="info" rotulo="Em aberto" valor={emAberto} nota="geradas, enviadas e visualizadas" />
          <Kpi icone={CalendarX2} tom="atencao" rotulo="Validade vencida" valor={vencidas} nota="em aberto e fora do prazo" alerta={vencidas > 0} />
          <Kpi icone={CircleCheck} tom="sucesso" rotulo="Aprovadas" valor={n('APROVADA')} nota={`${n('RECUSADA')} recusada(s)`} />
          <Kpi icone={PencilLine} tom="neutro" rotulo="Rascunhos" valor={n('RASCUNHO')} nota="ainda não geradas" />
        </div>
      )}

      <section className={cn('rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]', compact && 'rounded-[20px]')}>
        {/* Abas de status com a contagem */}
        <div className="px-4 sm:px-6 pt-3 border-b border-border flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Status das propostas">
          {ABAS.map((a) => {
            const ativa = filters.status === a.status
            return (
              <button
                key={a.status || 'todas'}
                role="tab"
                aria-selected={ativa}
                onClick={() => setFilters((f) => ({ ...f, status: a.status }))}
                className={cn(
                  'relative h-11 px-3 inline-flex items-center gap-2 text-[13px] font-semibold whitespace-nowrap transition-colors',
                  ativa ? 'text-marca-texto' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {a.label}
                {contagem && (
                  <span className={cn('rounded-md px-1.5 text-[11px] font-semibold tabular', ativa ? 'bg-marca-suave text-marca-texto' : 'bg-secondary text-muted-foreground')}>
                    {n(a.status)}
                  </span>
                )}
                {ativa && <span aria-hidden className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-marca" />}
              </button>
            )
          })}
        </div>

        {/* Busca e filtros */}
        <div className="px-4 sm:px-6 py-4 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-[380px]">
            <Search className="w-4 h-4 text-subtle absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Número, cliente ou documento"
              aria-label="Buscar proposta"
              className="w-full h-10 pl-10 pr-3 text-[13px] border border-border rounded-xl bg-card text-foreground placeholder:text-subtle focus:outline-none focus:border-marca focus:ring-2 focus:ring-marca/15"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={cn(
              'h-10 px-3.5 inline-flex items-center gap-1.5 rounded-xl border text-[13px] font-medium transition-colors',
              showFilters ? 'border-marca text-marca-texto bg-marca-suave' : 'border-border text-foreground bg-card hover:border-subtle/60',
            )}
          >
            <Filter className="w-3.5 h-3.5" /> Filtros
          </button>
          {!compact && (
            <p className="ml-auto t-meta">O CPF/CNPJ aparece mascarado nesta lista.</p>
          )}
        </div>

        {showFilters && (
          <div className="mx-4 sm:mx-6 mb-4 grid grid-cols-2 lg:grid-cols-5 gap-2 bg-secondary/60 border border-border rounded-2xl p-3">
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input text-xs">
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))} className="input text-xs">
              <option value="">Propostas e aditivos</option>
              <option value="PROPOSTA">Somente propostas</option>
              <option value="ADITIVO">Somente aditivos</option>
            </select>
            <select value={filters.validity} onChange={(e) => setFilters((f) => ({ ...f, validity: e.target.value }))} className="input text-xs">
              <option value="">Válidas e vencidas</option>
              <option value="valida">Somente válidas</option>
              <option value="vencida">Somente vencidas</option>
            </select>
            <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input text-xs" aria-label="Emitidas a partir de" />
            <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input text-xs" aria-label="Emitidas até" />
          </div>
        )}

        {msg && <p className="mx-4 sm:mx-6 mb-4 text-xs font-medium text-foreground bg-marca-suave border border-marca/15 rounded-xl px-3 py-2">{msg}</p>}

        {loading ? (
          <div className="px-4 sm:px-6 pb-6 space-y-2 animate-pulse">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-secondary rounded-xl" />)}</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-14 border-t border-border">
            <span className={cn('mx-auto mb-3 w-11 h-11 rounded-xl grid place-items-center', TOM.marca)}><FileText className="w-5 h-5" /></span>
            <p className="text-sm text-muted-foreground">Nenhuma proposta ainda.</p>
            <Link href={clientId ? `/propostas/nova?clientId=${clientId}` : '/propostas/nova'} className="text-xs font-semibold text-primary hover:underline mt-1 inline-block">
              Criar a primeira
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop: tabela. Mobile: cards (sem rolagem horizontal). */}
            <div className="hidden lg:block">
              <table className="w-full text-[13px]">
                <thead className="bg-secondary/60 border-y border-border">
                  <tr className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                    <th className="pl-6 pr-4 py-3">Número</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Emissão</th>
                    <th className="px-4 py-3">Validade</th>
                    <th className="px-4 py-3 text-right">Mensal</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="pr-6 pl-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((r) => (
                    <tr key={r.id} className="hover:bg-secondary/40 transition-colors">
                      <td className="pl-6 pr-4 py-3.5 whitespace-nowrap">
                        <Link href={`/propostas/${r.id}`} className="font-semibold text-marca-texto tabular hover:underline">
                          #{r.number}
                        </Link>
                        {r.kind === 'ADITIVO' && <span className="ml-1.5 rounded-md bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">aditivo</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={cn('shrink-0 w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold', TOM[tomDe(r.recipientName)])}>{iniciais(r.recipientName)}</span>
                          <div className="min-w-0">
                            <p className="text-foreground font-medium truncate max-w-[240px]">{r.recipientName}</p>
                            <p className="text-[11.5px] text-muted-foreground">{r.documentMasked} · {r.recipientKind === 'PROSPECT' ? 'prospect' : 'cliente'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground tabular whitespace-nowrap">{fmt(r.issueDate)}</td>
                      <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{r.validLabel}</td>
                      <td className="px-4 py-3.5 text-right text-foreground tabular whitespace-nowrap">{r.monthly}</td>
                      <td className="px-4 py-3.5 text-right font-display font-semibold text-foreground tabular whitespace-nowrap">{r.total}</td>
                      <td className="px-4 py-3.5"><StatusPill status={r.status} /></td>
                      <td className="pr-6 pl-2 py-3.5 text-right relative">
                        <button
                          onClick={() => setMenu(menu === r.id ? null : r.id)}
                          aria-label={`Ações de ${r.number}`}
                          className="p-1.5 rounded-lg text-subtle hover:text-foreground hover:bg-secondary"
                        >
                          {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                        </button>
                        {menu === r.id && <RowMenu row={r} onAct={act} onDownload={download} onClose={() => setMenu(null)} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden divide-y divide-border border-t border-border">
              {visible.map((r) => (
                <div key={r.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className={cn('shrink-0 w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold', TOM[tomDe(r.recipientName)])}>{iniciais(r.recipientName)}</span>
                      <div className="min-w-0">
                        <Link href={`/propostas/${r.id}`} className="font-semibold text-marca-texto text-sm tabular">
                          #{r.number}
                        </Link>
                        <p className="text-xs text-foreground truncate">{r.recipientName}</p>
                        <p className="text-[11px] text-subtle">{r.documentMasked}</p>
                      </div>
                    </div>
                    <StatusPill status={r.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11.5px] text-muted-foreground">
                    <span>Emissão: {fmt(r.issueDate)}</span>
                    <span>Validade: {r.validLabel}</span>
                    <span>Mensal: <b className="text-foreground">{r.monthly}</b></span>
                    <span>Total: <b className="text-foreground">{r.total}</b></span>
                  </div>
                  <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                    <Link href={`/propostas/${r.id}`} className="text-[12px] font-semibold text-marca-texto">Abrir</Link>
                    <button onClick={() => download(r.id, 'PDF')} disabled={busy === r.id} className="text-[12px] font-medium text-muted-foreground disabled:opacity-50">PDF</button>
                    <button onClick={() => act(r.id, { action: 'duplicar' }, 'Proposta duplicada.')} disabled={busy === r.id} className="text-[12px] font-medium text-muted-foreground disabled:opacity-50">Duplicar</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!compact && !loading && visible.length > 0 && (
          <p className="px-6 py-3 border-t border-border t-meta">
            {visible.length} documento(s).
          </p>
        )}
      </section>
    </div>
  )
}

function RowMenu({
  row, onAct, onDownload, onClose,
}: {
  row: Row
  onAct: (id: string, payload: Record<string, unknown>, okMsg: string) => void
  onDownload: (id: string, format: 'PDF' | 'DOCX') => void
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute right-4 top-full mt-1 w-56 bg-popover border border-border rounded-2xl shadow-[var(--sombra-flutuante)] z-30 py-1.5 text-left">
        <Link href={`/propostas/${row.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60">
          <FileText className="w-4 h-4 text-subtle" /> Visualizar
        </Link>
        <button onClick={() => onDownload(row.id, 'PDF')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60 text-left">
          <Download className="w-4 h-4 text-subtle" /> Baixar PDF
        </button>
        <button onClick={() => onDownload(row.id, 'DOCX')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60 text-left">
          <Download className="w-4 h-4 text-subtle" /> Baixar DOCX
        </button>
        <button onClick={() => onAct(row.id, { action: 'duplicar' }, 'Proposta duplicada.')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60 text-left">
          <Copy className="w-4 h-4 text-subtle" /> Duplicar
        </button>
        <button onClick={() => onAct(row.id, { action: 'versao' }, 'Nova versão aberta.')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60 text-left">
          <FilePlus2 className="w-4 h-4 text-subtle" /> Gerar nova versão
        </button>
        {row.kind === 'PROPOSTA' && (
          <Link href={`/propostas/nova?parentId=${row.id}&kind=ADITIVO`} className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60">
            <Send className="w-4 h-4 text-subtle" /> Criar aditivo
          </Link>
        )}
        <div className="border-t border-border my-1" />
        <button onClick={() => onAct(row.id, { action: 'status', status: 'APROVADA' }, 'Marcada como aprovada.')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-success hover:bg-success-suave text-left">
          <Check className="w-4 h-4" /> Marcar como aprovada
        </button>
        <button onClick={() => onAct(row.id, { action: 'status', status: 'RECUSADA' }, 'Marcada como recusada.')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60 text-left">
          <X className="w-4 h-4 text-subtle" /> Marcar como recusada
        </button>
        <button onClick={() => onAct(row.id, { action: 'status', status: 'CANCELADA' }, 'Proposta cancelada.')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive-texto hover:bg-destructive-suave text-left">
          <X className="w-4 h-4" /> Cancelar
        </button>
      </div>
    </>
  )
}
