'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileText, Filter, Search, Download, Send, Copy, MoreVertical, Check, X, Loader2, FilePlus2,
} from 'lucide-react'

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

export const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  RASCUNHO: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-600' },
  GERADA: { label: 'Gerada', cls: 'bg-blue-50 text-blue-700' },
  ENVIADA: { label: 'Enviada', cls: 'bg-purple-50 text-purple-700' },
  VISUALIZADA: { label: 'Visualizada', cls: 'bg-teal-50 text-teal-700' },
  APROVADA: { label: 'Aprovada', cls: 'bg-green-100 text-green-700' },
  RECUSADA: { label: 'Recusada', cls: 'bg-red-50 text-red-700' },
  EXPIRADA: { label: 'Expirada', cls: 'bg-orange-50 text-orange-700' },
  CANCELADA: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500' },
  SUBSTITUIDA: { label: 'Substituída', cls: 'bg-gray-100 text-gray-500' },
}

function fmt(d: string) {
  const iso = d.slice(0, 10)
  const [y, m, day] = iso.split('-')
  return `${day}/${m}/${y}`
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

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (clientId) params.set('clientId', clientId)
    if (filters.q) params.set('q', filters.q)
    if (filters.status) params.set('status', filters.status)
    if (filters.kind) params.set('kind', filters.kind)
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    fetch(`/api/propostas?${params}`)
      .then((r) => (r.ok ? r.json() : { proposals: [] }))
      .then((b) => setRows(b.proposals ?? []))
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

  return (
    <div className="space-y-3">
      {/* Busca e filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Número, cliente ou documento"
            className="input"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-medium transition-colors ${
            showFilters ? 'border-[#030A8C] text-[#030A8C]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          <Filter className="w-3.5 h-3.5" /> Filtros
        </button>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 bg-gray-50 border border-gray-100 rounded-xl p-3">
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
          <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="input text-xs" />
          <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="input text-xs" />
        </div>
      )}

      {msg && <p className="text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{msg}</p>}

      {loading ? (
        <div className="space-y-2 animate-pulse">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Nenhuma proposta ainda.</p>
          <Link href={clientId ? `/propostas/nova?clientId=${clientId}` : '/propostas/nova'} className="text-xs font-semibold text-[#030A8C] hover:underline mt-1 inline-block">
            Criar a primeira
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop: tabela. Mobile: cards (sem rolagem horizontal). */}
          <div className="hidden lg:block bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5">Número</th>
                  <th className="px-4 py-2.5">Cliente</th>
                  <th className="px-4 py-2.5">Emissão</th>
                  <th className="px-4 py-2.5">Validade</th>
                  <th className="px-4 py-2.5">Mensal</th>
                  <th className="px-4 py-2.5">Total</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((r) => {
                  const st = STATUS_LABEL[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/propostas/${r.id}`} className="font-semibold text-gray-900 hover:text-[#030A8C]">
                          {r.number}
                        </Link>
                        {r.kind === 'ADITIVO' && <span className="ml-1.5 text-[10px] font-bold text-purple-700">aditivo</span>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-900 truncate max-w-[220px]">{r.recipientName}</p>
                        <p className="text-[11px] text-gray-400">{r.documentMasked} · {r.recipientKind === 'PROSPECT' ? 'prospect' : 'cliente'}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fmt(r.issueDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{r.validLabel}</td>
                      <td className="px-4 py-3 text-gray-900">{r.monthly}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{r.total}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right relative">
                        <button
                          onClick={() => setMenu(menu === r.id ? null : r.id)}
                          aria-label={`Ações de ${r.number}`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                        >
                          {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
                        </button>
                        {menu === r.id && <RowMenu row={r} onAct={act} onDownload={download} onClose={() => setMenu(null)} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-2">
            {visible.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-600' }
              return (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/propostas/${r.id}`} className="font-semibold text-gray-900 text-sm">
                        {r.number}
                      </Link>
                      <p className="text-xs text-gray-600 truncate">{r.recipientName}</p>
                      <p className="text-[11px] text-gray-400">{r.documentMasked}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-500">
                    <span>Emissão: {fmt(r.issueDate)}</span>
                    <span>Validade: {r.validLabel}</span>
                    <span>Mensal: <b className="text-gray-900">{r.monthly}</b></span>
                    <span>Total: <b className="text-gray-900">{r.total}</b></span>
                  </div>
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    <Link href={`/propostas/${r.id}`} className="text-[11px] font-semibold text-[#030A8C]">Abrir</Link>
                    <button onClick={() => download(r.id, 'PDF')} disabled={busy === r.id} className="text-[11px] font-medium text-gray-600 disabled:opacity-50">PDF</button>
                    <button onClick={() => act(r.id, { action: 'duplicar' }, 'Proposta duplicada.')} disabled={busy === r.id} className="text-[11px] font-medium text-gray-600 disabled:opacity-50">Duplicar</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {!compact && (
        <p className="text-[11px] text-gray-400">
          {visible.length} documento(s). O CPF/CNPJ aparece mascarado nesta lista.
        </p>
      )}
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
      <div className="absolute right-4 top-full mt-1 w-52 bg-white border border-gray-100 rounded-xl shadow-lg z-30 py-1 text-left">
        <Link href={`/propostas/${row.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          <FileText className="w-4 h-4 text-gray-400" /> Visualizar
        </Link>
        <button onClick={() => onDownload(row.id, 'PDF')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
          <Download className="w-4 h-4 text-gray-400" /> Baixar PDF
        </button>
        <button onClick={() => onDownload(row.id, 'DOCX')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
          <Download className="w-4 h-4 text-gray-400" /> Baixar DOCX
        </button>
        <button onClick={() => onAct(row.id, { action: 'duplicar' }, 'Proposta duplicada.')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
          <Copy className="w-4 h-4 text-gray-400" /> Duplicar
        </button>
        <button onClick={() => onAct(row.id, { action: 'versao' }, 'Nova versão aberta.')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
          <FilePlus2 className="w-4 h-4 text-gray-400" /> Gerar nova versão
        </button>
        {row.kind === 'PROPOSTA' && (
          <Link href={`/propostas/nova?parentId=${row.id}&kind=ADITIVO`} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Send className="w-4 h-4 text-gray-400" /> Criar aditivo
          </Link>
        )}
        <div className="border-t border-gray-100 my-1" />
        <button onClick={() => onAct(row.id, { action: 'status', status: 'APROVADA' }, 'Marcada como aprovada.')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50 text-left">
          <Check className="w-4 h-4" /> Marcar como aprovada
        </button>
        <button onClick={() => onAct(row.id, { action: 'status', status: 'RECUSADA' }, 'Marcada como recusada.')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
          <X className="w-4 h-4 text-gray-400" /> Marcar como recusada
        </button>
        <button onClick={() => onAct(row.id, { action: 'status', status: 'CANCELADA' }, 'Proposta cancelada.')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left">
          <X className="w-4 h-4" /> Cancelar
        </button>
      </div>
    </>
  )
}
