'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Download, Send, FileText, Check, X, Loader2, AlertTriangle, History,
  UserPlus, FilePlus2, Eye,
} from 'lucide-react'
import { STATUS_LABEL } from './ProposalsList'

interface Item {
  id: string; name: string; description: string | null; scope: string | null; deliverables: string[]
  quantity: number; monthlyCents: number; setupCents: number; discountCents: number; months: number
  periodicity: string; changeType: string | null; previousMonthlyCents: number | null
}

interface Detail {
  id: string; number: string; kind: string; status: string; currentVersion: number
  issueDate: string; validUntil: string; startDate: string | null
  paymentTerms: string | null; paymentDay: number | null; notes: string | null
  expired: boolean; missing: string[]
  monthlyCents: number; setupCents: number; totalCents: number; months: number
  recipient: {
    kind: string; name: string; tradeName: string | null; documentFormatted: string
    contactName: string | null; email: string | null; phone: string | null
    city: string | null; state: string | null
  }
  totals: { monthlyLabel: string; setupLabel: string; totalLabel: string; months: number }
  items: Item[]
  parent: { id: string; number: string } | null
  addendums: Array<{ id: string; number: string; status: string; issueDate: string }>
  versions: Array<{ version: number; note: string | null; createdAt: string }>
  documents: Array<{ id: string; version: number; format: string; size: number; fileName: string; createdAt: string; downloads: number }>
  events: Array<{ id: string; kind: string; detail: string; createdAt: string }>
  prospect: { id: string; name: string; convertedClientId: string | null } | null
  client: { id: string; name: string } | null
}

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmt(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

/** Tela da proposta: prévia, documentos, envio, versões e histórico. */
export default function ProposalDetail({ id }: { id: string }) {
  const router = useRouter()
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendMessage, setSendMessage] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/propostas/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b?.proposal) return
        setData(b.proposal)
        setSendTo(b.proposal.recipient?.email ?? '')
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  async function act(payload: Record<string, unknown>, okMsg: string) {
    setBusy(String(payload.action))
    setMsg(null)
    try {
      const res = await fetch(`/api/propostas/${id}/acoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: body.error || 'Falha na operação.' }); return }
      setMsg({ ok: true, text: body.message || okMsg })
      if (payload.action === 'duplicar' && body.id) { router.push(`/propostas/${body.id}`); return }
      if (payload.action === 'converter' && body.clientId) {
        setMsg({ ok: true, text: body.created ? 'Prospect convertido em cliente.' : 'Este prospect já era cliente.' })
      }
      setSendOpen(false)
      load()
    } finally {
      setBusy(null)
    }
  }

  async function generate(format: 'PDF' | 'DOCX', open = true) {
    setBusy(format)
    setMsg(null)
    try {
      const res = await fetch(`/api/propostas/${id}/documento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: body.error || 'Não foi possível gerar.' }); return }
      if (open) window.open(`/api/propostas/${id}/documento?format=${format}`, '_blank', 'noopener')
      load()
    } finally {
      setBusy(null)
    }
  }

  if (loading && !data) {
    return <div className="space-y-3 animate-pulse max-w-4xl">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}</div>
  }
  if (!data) return <p className="text-sm text-gray-500">Proposta não encontrada.</p>

  const st = STATUS_LABEL[data.status] ?? { label: data.status, cls: 'bg-gray-100 text-gray-600' }
  const canConvert = data.prospect && !data.prospect.convertedClientId && data.status === 'APROVADA'

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link href="/propostas" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Voltar para Propostas
        </Link>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${st.cls}`}>{st.label}</span>
      </div>

      {msg && (
        <p className={`text-xs font-medium rounded-lg px-3 py-2 border ${msg.ok ? 'text-green-700 bg-green-50 border-green-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
          {msg.text}
        </p>
      )}

      {data.missing.length > 0 && (
        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Falta para gerar o documento: {data.missing.join(', ')}.
        </p>
      )}

      {/* Cabeçalho */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900">
              {data.number}
              {data.kind === 'ADITIVO' && <span className="ml-2 text-[11px] font-bold text-purple-700">aditivo</span>}
              <span className="ml-2 text-[11px] font-normal text-gray-400">versão {data.currentVersion}</span>
            </h1>
            <p className="text-sm text-gray-700 mt-0.5">{data.recipient.name}</p>
            <p className="text-[11px] text-gray-500">
              {data.recipient.documentFormatted} · {data.recipient.kind === 'PROSPECT' ? 'prospect' : 'cliente'}
              {data.recipient.email ? ` · ${data.recipient.email}` : ''}
            </p>
            {data.parent && (
              <p className="text-[11px] text-gray-500 mt-1">
                Aditivo ao documento{' '}
                <Link href={`/propostas/${data.parent.id}`} className="font-semibold text-[#030A8C] hover:underline">{data.parent.number}</Link>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400">Total</p>
            <p className="text-xl font-bold text-gray-900">{data.totals.totalLabel}</p>
            <p className="text-[11px] text-gray-500">
              {data.monthlyCents > 0 && `${data.totals.monthlyLabel}/mês`}
              {data.months > 0 && ` · ${data.months} meses`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
          <div><p className="text-gray-400">Emissão</p><p className="text-gray-900 font-medium">{fmt(data.issueDate)}</p></div>
          <div><p className="text-gray-400">Validade</p><p className={`font-medium ${data.expired ? 'text-orange-700' : 'text-gray-900'}`}>{fmt(data.validUntil)}</p></div>
          <div><p className="text-gray-400">Início previsto</p><p className="text-gray-900 font-medium">{fmt(data.startDate)}</p></div>
          <div><p className="text-gray-400">Pagamento</p><p className="text-gray-900 font-medium truncate">{data.paymentTerms || '—'}</p></div>
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button
            onClick={() => generate('PDF')}
            disabled={busy != null || data.missing.length > 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40 transition-colors"
          >
            {busy === 'PDF' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            Visualizar / gerar PDF
          </button>
          <button
            onClick={() => generate('DOCX')}
            disabled={busy != null || data.missing.length > 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] disabled:opacity-40 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> DOCX
          </button>
          <button
            onClick={() => setSendOpen((v) => !v)}
            disabled={busy != null || data.missing.length > 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] disabled:opacity-40 transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Enviar por e-mail
          </button>
          <Link
            href={`/propostas/${id}/editar`}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors"
          >
            Editar
          </Link>
          <button
            onClick={() => act({ action: 'versao' }, 'Nova versão aberta.')}
            disabled={busy != null}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] disabled:opacity-40 transition-colors"
          >
            <FilePlus2 className="w-3.5 h-3.5" /> Nova versão
          </button>
          {data.kind === 'PROPOSTA' && (
            <Link
              href={`/propostas/nova?parentId=${id}&kind=ADITIVO${data.client ? `&clientId=${data.client.id}` : ''}`}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors"
            >
              Criar aditivo
            </Link>
          )}
        </div>

        {sendOpen && (
          <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-700 mb-1">Destinatário</label>
                <input value={sendTo} onChange={(e) => setSendTo(e.target.value)} className="input text-xs" placeholder="cliente@empresa.com.br" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-700 mb-1">Remetente</label>
                <input value="VEX Growth Financeiro <financeiro@vexgrowth.com.br>" readOnly className="input text-xs opacity-70" />
              </div>
            </div>
            <textarea
              value={sendMessage}
              onChange={(e) => setSendMessage(e.target.value)}
              rows={3} className="input text-xs resize-none"
              placeholder="Mensagem curta que vai no corpo do e-mail (opcional)"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSendOpen(false)} className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900">Cancelar</button>
              <button
                onClick={() => act({ action: 'enviar', to: sendTo, message: sendMessage }, 'Proposta enviada.')}
                disabled={busy != null || !sendTo}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40"
              >
                {busy === 'enviar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enviar agora
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              O PDF vai anexado. O mesmo e-mail não é enviado duas vezes para a mesma versão.
            </p>
          </div>
        )}
      </div>

      {/* Serviços */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
        <p className="font-bold text-gray-900 text-sm mb-3">Serviços</p>
        <div className="space-y-2">
          {data.items.map((i) => (
            <div key={i.id} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {i.name}
                    {i.changeType && <span className="ml-2 text-[10px] font-bold text-purple-700">{i.changeType}</span>}
                  </p>
                  {i.scope && <p className="text-[11px] text-gray-500 mt-0.5">{i.scope}</p>}
                  {i.deliverables.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {i.deliverables.map((d, idx) => <li key={idx} className="text-[11px] text-gray-500">• {d}</li>)}
                    </ul>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {i.periodicity === 'UNICO' ? brl(i.setupCents) : `${brl(i.monthlyCents)}/mês`}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {i.periodicity === 'UNICO' ? 'pagamento único' : `${i.months} meses`}
                    {i.quantity > 1 && ` · ${i.quantity}x`}
                  </p>
                  {i.previousMonthlyCents ? (
                    <p className="text-[11px] text-gray-400">antes: {brl(i.previousMonthlyCents)}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-4 mt-3 pt-3 border-t border-gray-100 text-xs">
          <span className="text-gray-500">Mensal <b className="text-gray-900">{data.totals.monthlyLabel}</b></span>
          {data.setupCents > 0 && <span className="text-gray-500">Único <b className="text-gray-900">{data.totals.setupLabel}</b></span>}
          <span className="text-gray-500">Total <b className="text-[#030A8C]">{data.totals.totalLabel}</b></span>
        </div>
      </div>

      {/* Status e conversão */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
        <p className="font-bold text-gray-900 text-sm mb-3">Situação</p>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => act({ action: 'status', status: 'APROVADA' }, 'Marcada como aprovada.')} disabled={busy != null}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-100 disabled:opacity-40">
            <Check className="w-3.5 h-3.5" /> Aprovada
          </button>
          <button onClick={() => act({ action: 'status', status: 'RECUSADA' }, 'Marcada como recusada.')} disabled={busy != null}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-40">
            <X className="w-3.5 h-3.5" /> Recusada
          </button>
          <button onClick={() => act({ action: 'status', status: 'CANCELADA' }, 'Proposta cancelada.')} disabled={busy != null}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-red-600 hover:border-red-200 disabled:opacity-40">
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
          {canConvert && (
            <button onClick={() => act({ action: 'converter' }, 'Prospect convertido.')} disabled={busy != null}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40">
              <UserPlus className="w-3.5 h-3.5" /> Converter em cliente
            </button>
          )}
          {data.prospect?.convertedClientId && (
            <Link href={`/clientes/${data.prospect.convertedClientId}`} className="text-xs font-semibold text-[#030A8C] hover:underline">
              Ver cliente criado
            </Link>
          )}
        </div>
        {canConvert && (
          <p className="text-[11px] text-gray-400 mt-2">
            A conversão cria o cliente e os serviços com os valores desta proposta. Cobrança, nota fiscal e demandas
            continuam sendo ativadas separadamente por você.
          </p>
        )}
      </div>

      {/* Documentos e versões */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="font-bold text-gray-900 text-sm mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4 text-gray-400" /> Documentos</p>
          {data.documents.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum documento gerado ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {data.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-gray-700 truncate">{d.format} · versão {d.version} · {(d.size / 1024).toFixed(0)} KB</span>
                  <a
                    href={`/api/propostas/${id}/documento?format=${d.format}&version=${d.version}`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-semibold text-[#030A8C] hover:underline shrink-0"
                  >
                    abrir
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="font-bold text-gray-900 text-sm mb-2 flex items-center gap-1.5"><History className="w-4 h-4 text-gray-400" /> Versões</p>
          {data.versions.length === 0 ? (
            <p className="text-xs text-gray-400">Somente a versão atual ({data.currentVersion}).</p>
          ) : (
            <div className="space-y-1.5">
              {data.versions.map((v) => (
                <p key={v.version} className="text-xs text-gray-600">
                  Versão {v.version} · {new Date(v.createdAt).toLocaleDateString('pt-BR')}
                  {v.note ? ` — ${v.note}` : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Aditivos */}
      {data.addendums.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="font-bold text-gray-900 text-sm mb-2">Aditivos</p>
          <div className="space-y-1.5">
            {data.addendums.map((a) => (
              <Link key={a.id} href={`/propostas/${a.id}`} className="flex items-center justify-between gap-2 text-xs hover:text-[#030A8C]">
                <span className="font-medium">{a.number}</span>
                <span className="text-gray-500">{fmt(a.issueDate)} · {STATUS_LABEL[a.status]?.label ?? a.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Auditoria */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="font-bold text-gray-900 text-sm mb-2">Histórico</p>
        <div className="space-y-1">
          {data.events.map((e) => (
            <p key={e.id} className="text-[11px] text-gray-500">
              {new Date(e.createdAt).toLocaleString('pt-BR')} · {e.detail}
            </p>
          ))}
          {data.events.length === 0 && <p className="text-xs text-gray-400">Sem eventos ainda.</p>}
        </div>
      </div>
    </div>
  )
}
