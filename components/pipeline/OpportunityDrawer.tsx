'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2, ExternalLink, History } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import CurrencyInput from '@/components/ui/CurrencyInput'
import TierBadge from '@/components/ui/TierBadge'
import {
  STAGES, STAGE_LABEL, opportunityTotals, contractBasis, validateStageMove, type Stage,
} from '@/lib/pipeline-core'

export interface CatalogOption {
  id: string
  name: string
  category: string | null
  billingType: string
  minCents: number | null
  maxCents: number | null
  defaultCents: number | null
}

export interface OpportunityItem {
  id: string
  catalogId: string | null
  name: string
  scope: string | null
  contractType: string
  quantity: number
  unitCents: number
  discountCents: number
  months: number | null
  startDate: string | null
  competence: string | null
  clientServiceId: string | null
  catalog?: { id: string; name: string; minCents: number | null; maxCents: number | null } | null
}

export interface Opportunity {
  id: string
  title: string
  stage: string
  ownerId: string
  source: string | null
  estimateCents: number
  estimateNote: string | null
  expectedCloseDate: string | null
  closedAt: string | null
  lossReason: string | null
  nextAction: string | null
  nextActionAt: string | null
  notes: string | null
  stageChangedAt: string
  convertedClientId: string | null
  items: OpportunityItem[]
  owner?: { id: string; name: string } | null
  client?: { id: string; name: string; tier: string | null; cnpj: string | null } | null
  prospect?: { id: string; name: string; tradeName: string | null; document: string | null; email: string | null; phone: string | null; interestServices?: string[] } | null
  proposal?: { id: string; number: string; status: string; monthlyCents: number; setupCents: number; totalCents: number } | null
  events?: Array<{ id: string; type: string; message: string; createdAt: string; user?: { name: string } | null }>
}

const TYPE_LABEL: Record<string, string> = {
  RECORRENTE: 'Recorrente', AVULSO: 'Avulso', PROJETO: 'Projeto',
  QUANTIDADE: 'Por quantidade', PERSONALIZADO: 'Personalizado',
}

const brl = (cents: number) => formatCurrency(cents / 100)
const hoje = () => new Date().toISOString().slice(0, 10)

/**
 * Detalhe da negociação: campos comerciais, serviços orçados a partir do
 * catálogo, histórico e a conferência de fechamento que converte em cliente.
 */
export default function OpportunityDrawer({
  id, isAdmin, owners, catalog, onClose, onChanged,
}: {
  id: string
  isAdmin: boolean
  owners: Array<{ id: string; name: string }>
  catalog: CatalogOption[]
  onClose: () => void
  onChanged: (msg?: string) => void
}) {
  const [opp, setOpp] = useState<Opportunity | null>(null)
  const [projected, setProjected] = useState<{ ticketCents: number; tier: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'negociacao' | 'servicos' | 'historico'>('negociacao')
  const [showClose, setShowClose] = useState(false)
  const [reopen, setReopen] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/pipeline/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => { setOpp(b.opportunity); setProjected(b.projected) })
      .catch(() => setError('Não foi possível carregar a negociação.'))
  }, [id])

  useEffect(() => { load() }, [load])

  const totals = opp ? opportunityTotals(opp.items, opp.estimateCents) : null
  const basis = totals ? contractBasis(totals) : null
  const convertida = !!opp?.convertedClientId

  async function patch(data: Record<string, unknown>, aviso?: string) {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/pipeline/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível salvar.'); return }
      load(); onChanged()
      if (aviso) setMsg(aviso)
    } finally { setSaving(false) }
  }

  async function changeStage(stage: Stage) {
    if (!opp) return
    if (stage === 'GANHO') { setShowClose(true); return }
    const erros = validateStageMove({ from: opp.stage, to: stage, items: opp.items, converted: convertida })
    if (stage !== 'PERDIDO' && erros.length > 0) { setError(erros.join(' ')); return }
    if (stage === 'PERDIDO') {
      const motivo = prompt('Motivo da perda:')
      if (!motivo?.trim()) return
      await postStage(stage, { lossReason: motivo })
      return
    }
    await postStage(stage)
  }

  async function postStage(stage: Stage, extra: Record<string, unknown> = {}) {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/pipeline/${id}/etapa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, ...extra }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível mover.'); return }
      load(); onChanged('Etapa atualizada.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[94dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {!opp ? (
          <div className="p-10 text-center text-sm text-gray-400">
            {error ?? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</span>}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 truncate">{opp.title}</h3>
                <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                  {opp.client ? (
                    <Link href={`/clientes/${opp.client.id}`} className="text-[#030A8C] hover:underline">{opp.client.name}</Link>
                  ) : (opp.prospect?.tradeName ?? opp.prospect?.name ?? 'Lead sem nome')}
                  {opp.client && <TierBadge tier={opp.client.tier} />}
                  {opp.source && <span className="text-gray-400">· {opp.source}</span>}
                </p>
                {/* Serviços que o lead pediu, antes de existir orçamento */}
                {(opp.prospect?.interestServices?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className="text-[10px] text-gray-400 mr-0.5">Interesse:</span>
                    {opp.prospect!.interestServices!.map((s) => (
                      <span key={s} className="text-[10px] font-medium text-[#030A8C] bg-[#030A8C]/5 border border-[#030A8C]/15 rounded-full px-2 py-0.5">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg shrink-0"><X className="w-4 h-4 text-gray-400" /></button>
            </div>

            {/* Valores: recorrente, avulso e projeto sempre separados */}
            <div className="px-4 sm:px-5 py-3 border-b border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {totals?.usandoEstimativa ? (
                <div className="col-span-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Valor estimado</p>
                  <p className="text-lg font-bold text-gray-900">{brl(totals.totalContratoCents)}</p>
                  <p className="text-[10px] text-amber-700">Estimativa. Detalhe os serviços antes de fechar.</p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Recorrente orçado</p>
                    <p className="text-lg font-bold text-[#030A8C]">{brl(totals?.recorrenteCents ?? 0)}<span className="text-[10px] text-gray-400 font-normal">/mês</span></p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Avulso orçado</p>
                    <p className="text-lg font-bold text-purple-700">{brl(totals?.avulsoCents ?? 0)}</p>
                  </div>
                  {(totals?.projetoMensalCents ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Projeto</p>
                      <p className="text-lg font-bold text-amber-700">{brl(totals?.projetoMensalCents ?? 0)}<span className="text-[10px] text-gray-400 font-normal">/mês</span></p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total do contrato</p>
                    <p className="text-sm font-bold text-gray-900">{brl(totals?.totalContratoCents ?? 0)}</p>
                    <p className="text-[10px] text-gray-400">{basis ?? 'sem prazo definido'}</p>
                  </div>
                </>
              )}
            </div>

            {projected?.tier && !convertida && (
              <p className="mx-4 sm:mx-5 mt-3 text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                Grupo previsto se fechar: <span className="font-semibold">{projected.tier}</span> com ticket de {brl(projected.ticketCents)}. Indicação apenas; não altera a classificação atual.
              </p>
            )}
            {error && <p className="mx-4 sm:mx-5 mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            {msg && <p className="mx-4 sm:mx-5 mt-3 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{msg}</p>}

            {/* Etapa */}
            <div className="px-4 sm:px-5 pt-3 flex flex-wrap items-center gap-2">
              <select
                value={opp.stage}
                onChange={(e) => changeStage(e.target.value as Stage)}
                disabled={saving || (convertida && opp.stage === 'GANHO')}
                className="input text-xs w-auto"
                aria-label="Etapa da negociação"
              >
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
              {!convertida && opp.stage !== 'PERDIDO' && (
                <button onClick={() => setShowClose(true)} disabled={saving} className="px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                  Fechar como ganho
                </button>
              )}
              {convertida && (
                <>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Convertida em cliente</span>
                  <Link href={`/clientes/${opp.convertedClientId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#030A8C] hover:underline">
                    Abrir cliente <ExternalLink className="w-3 h-3" />
                  </Link>
                  {isAdmin && <button onClick={() => setReopen(true)} className="text-xs text-gray-500 hover:text-gray-900">Reabrir</button>}
                </>
              )}
              {opp.stage === 'PERDIDO' && opp.lossReason && (
                <span className="text-xs text-red-600">Perdida: {opp.lossReason}</span>
              )}
            </div>

            {/* Abas */}
            <div className="flex border-b border-gray-100 mt-3 px-4 sm:px-5">
              {([['negociacao', 'Negociação'], ['servicos', `Serviços orçados (${opp.items.length})`], ['historico', 'Histórico']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-3 py-2 text-xs font-semibold ${tab === k ? 'text-[#030A8C] border-b-2 border-[#030A8C]' : 'text-gray-500 hover:text-gray-900'}`}>
                  {l}
                </button>
              ))}
            </div>

            <div className="p-4 sm:p-5">
              {tab === 'negociacao' && <NegotiationTab opp={opp} owners={owners} onSave={patch} saving={saving} />}
              {tab === 'servicos' && (
                <ItemsTab
                  opp={opp} catalog={catalog} readOnly={convertida}
                  onChanged={(m) => { load(); onChanged(); if (m) setMsg(m) }}
                  onError={setError}
                />
              )}
              {tab === 'historico' && <HistoryTab opp={opp} />}
            </div>
          </>
        )}

        {showClose && opp && (
          <CloseWonModal
            opp={opp}
            onClose={() => setShowClose(false)}
            onDone={(m) => { setShowClose(false); load(); onChanged(m) }}
          />
        )}
        {reopen && opp && (
          <ReopenModal
            id={opp.id}
            onClose={() => setReopen(false)}
            onDone={(m) => { setReopen(false); load(); onChanged(m) }}
          />
        )}
      </div>
    </div>
  )
}

/* ------------------------------- negociação ------------------------------- */

function NegotiationTab({
  opp, owners, onSave, saving,
}: {
  opp: Opportunity
  owners: Array<{ id: string; name: string }>
  onSave: (data: Record<string, unknown>, aviso?: string) => void
  saving: boolean
}) {
  const [form, setForm] = useState({
    title: opp.title,
    ownerId: opp.ownerId,
    source: opp.source ?? '',
    expectedCloseDate: opp.expectedCloseDate?.slice(0, 10) ?? '',
    nextAction: opp.nextAction ?? '',
    nextActionAt: opp.nextActionAt?.slice(0, 10) ?? '',
    notes: opp.notes ?? '',
    estimateNote: opp.estimateNote ?? '',
  })
  const [estimate, setEstimate] = useState<number | null>(opp.estimateCents > 0 ? opp.estimateCents / 100 : null)
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className="text-xs font-medium text-gray-600 mb-1 block">Título</label><input value={form.title} onChange={(e) => set('title', e.target.value)} className="input text-sm" /></div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Responsável</label>
          <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)} className="input text-sm">
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div><label className="text-xs font-medium text-gray-600 mb-1 block">Origem</label><input value={form.source} onChange={(e) => set('source', e.target.value)} className="input text-sm" /></div>
        <div><label className="text-xs font-medium text-gray-600 mb-1 block">Previsão de fechamento</label><input type="date" value={form.expectedCloseDate} onChange={(e) => set('expectedCloseDate', e.target.value)} className="input text-sm" /></div>
        <div><label className="text-xs font-medium text-gray-600 mb-1 block">Data real do fechamento</label><input type="date" value={opp.closedAt?.slice(0, 10) ?? ''} className="input text-sm bg-gray-50" readOnly /></div>
        <div><label className="text-xs font-medium text-gray-600 mb-1 block">Próxima ação</label><input value={form.nextAction} onChange={(e) => set('nextAction', e.target.value)} className="input text-sm" /></div>
        <div><label className="text-xs font-medium text-gray-600 mb-1 block">Prazo da próxima ação</label><input type="date" value={form.nextActionAt} onChange={(e) => set('nextActionAt', e.target.value)} className="input text-sm" /></div>
        {opp.items.length === 0 && (
          <>
            <div><label className="text-xs font-medium text-gray-600 mb-1 block">Valor estimado</label><CurrencyInput value={estimate} onChange={setEstimate} className="input text-sm" ariaLabel="Valor estimado" /></div>
            <div><label className="text-xs font-medium text-gray-600 mb-1 block">Base da estimativa</label><input value={form.estimateNote} onChange={(e) => set('estimateNote', e.target.value)} className="input text-sm" placeholder="Ex: conversa inicial" /></div>
          </>
        )}
        <div className="sm:col-span-2"><label className="text-xs font-medium text-gray-600 mb-1 block">Observações comerciais</label><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="input text-sm resize-none" /></div>
      </div>
      {opp.proposal && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          Proposta vigente <Link href={`/propostas/${opp.proposal.id}`} className="text-[#030A8C] font-semibold hover:underline">{opp.proposal.number}</Link> · {opp.proposal.status} · mensal {brl(opp.proposal.monthlyCents)}. Os valores da negociação são os dos serviços orçados; a proposta não soma em dobro.
        </p>
      )}
      <div className="flex justify-end">
        <button
          onClick={() => onSave({ ...form, estimateCents: estimate != null ? Math.round(estimate * 100) : 0 }, 'Negociação atualizada.')}
          disabled={saving}
          className="px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40"
        >
          Salvar
        </button>
      </div>
    </div>
  )
}

/* ---------------------------- serviços orçados ---------------------------- */

function ItemsTab({
  opp, catalog, readOnly, onChanged, onError,
}: {
  opp: Opportunity
  catalog: CatalogOption[]
  readOnly: boolean
  onChanged: (msg?: string) => void
  onError: (msg: string | null) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    catalogId: '', name: '', scope: '', contractType: 'RECORRENTE',
    quantity: '1', months: '', startDate: '', competence: hoje().slice(0, 7),
  })
  const [unit, setUnit] = useState<number | null>(null)
  const [discount, setDiscount] = useState<number | null>(null)
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))

  function pick(catalogId: string) {
    const c = catalog.find((x) => x.id === catalogId)
    setForm((p) => ({
      ...p, catalogId,
      name: c?.name ?? p.name,
      contractType: c?.billingType ?? p.contractType,
    }))
    if (c?.defaultCents != null) setUnit(c.defaultCents / 100)
  }

  async function add() {
    setSaving(true); onError(null)
    try {
      const res = await fetch(`/api/pipeline/${opp.id}/itens`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity) || 1,
          months: form.months ? Number(form.months) : null,
          unitCents: unit != null ? Math.round(unit * 100) : 0,
          discountCents: discount != null ? Math.round(discount * 100) : 0,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { onError(body.error || 'Não foi possível adicionar.'); return }
      setShowForm(false)
      setForm({ catalogId: '', name: '', scope: '', contractType: 'RECORRENTE', quantity: '1', months: '', startDate: '', competence: hoje().slice(0, 7) })
      setUnit(null); setDiscount(null)
      onChanged((body.warnings ?? []).join(' ') || 'Serviço adicionado ao orçamento.')
    } finally { setSaving(false) }
  }

  async function remove(itemId: string) {
    if (!confirm('Remover este serviço do orçamento?')) return
    const res = await fetch(`/api/pipeline/${opp.id}/itens?itemId=${itemId}`, { method: 'DELETE' })
    if (!res.ok) { const b = await res.json().catch(() => ({})); onError(b.error || 'Falha ao remover.'); return }
    onChanged('Serviço removido do orçamento.')
  }

  const item = catalog.find((c) => c.id === form.catalogId)

  return (
    <div className="space-y-3">
      {opp.items.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">Nenhum serviço orçado. Enquanto não houver itens, vale o valor estimado.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {opp.items.map((i) => {
            const cents = Math.max(0, i.unitCents * Math.max(1, i.quantity) - i.discountCents)
            const fora = i.catalog && ((i.catalog.minCents != null && i.unitCents < i.catalog.minCents) || (i.catalog.maxCents != null && i.unitCents > i.catalog.maxCents))
            return (
              <div key={i.id} className="flex items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{i.name}</p>
                  <p className="text-[11px] text-gray-500">
                    {TYPE_LABEL[i.contractType] ?? i.contractType}
                    {i.quantity > 1 ? ` · ${i.quantity}×` : ''}
                    {i.competence ? ` · ${i.competence.split('-').reverse().join('/')}` : ''}
                    {i.months ? ` · ${i.months} meses` : ''}
                    {i.startDate ? ` · início ${formatDate(i.startDate)}` : ''}
                  </p>
                  {fora && <p className="text-[11px] text-orange-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> fora da faixa do catálogo</p>}
                  {i.clientServiceId && <p className="text-[11px] text-green-700">virou serviço contratado</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-gray-900">{brl(cents)}</span>
                  {!readOnly && (
                    <button onClick={() => remove(i.id)} aria-label="Remover" className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {readOnly ? (
        <p className="text-[11px] text-gray-500">Negociação convertida: os serviços agora são editados no cadastro do cliente.</p>
      ) : showForm ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Serviço do catálogo</label>
              <select value={form.catalogId} onChange={(e) => pick(e.target.value)} className="input text-sm">
                <option value="">Sem catálogo (descrever)</option>
                {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}{c.category ? ` · ${c.category}` : ''}</option>)}
              </select>
              {item && (item.minCents != null || item.maxCents != null) && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Faixa de referência: {item.minCents != null ? brl(item.minCents) : '—'} a {item.maxCents != null ? brl(item.maxCents) : '—'}
                </p>
              )}
            </div>
            <div className="sm:col-span-2"><label className="text-xs font-medium text-gray-600 mb-1 block">Nome *</label><input value={form.name} onChange={(e) => set('name', e.target.value)} className="input text-sm" /></div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo de contratação</label>
              <select value={form.contractType} onChange={(e) => set('contractType', e.target.value)} className="input text-sm">
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium text-gray-600 mb-1 block">Valor negociado *</label><CurrencyInput value={unit} onChange={setUnit} className="input text-sm" ariaLabel="Valor negociado" /></div>
            <div><label className="text-xs font-medium text-gray-600 mb-1 block">Quantidade</label><input type="number" min={1} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} className="input text-sm" /></div>
            <div><label className="text-xs font-medium text-gray-600 mb-1 block">Desconto</label><CurrencyInput value={discount} onChange={setDiscount} className="input text-sm" ariaLabel="Desconto" /></div>
            {form.contractType === 'AVULSO' ? (
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">Competência prevista *</label><input type="month" value={form.competence} onChange={(e) => set('competence', e.target.value)} className="input text-sm" /></div>
            ) : (
              <div><label className="text-xs font-medium text-gray-600 mb-1 block">Início previsto</label><input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className="input text-sm" /></div>
            )}
            <div><label className="text-xs font-medium text-gray-600 mb-1 block">Prazo contratual (meses)</label><input type="number" min={0} value={form.months} onChange={(e) => set('months', e.target.value)} className="input text-sm" /></div>
            <div className="sm:col-span-2"><label className="text-xs font-medium text-gray-600 mb-1 block">Escopo negociado</label><textarea value={form.scope} onChange={(e) => set('scope', e.target.value)} rows={2} className="input text-sm resize-none" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 text-xs text-gray-600">Cancelar</button>
            <button onClick={add} disabled={saving || !form.name.trim() || unit == null} className="px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold disabled:opacity-40">
              {saving ? 'Salvando…' : 'Adicionar'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs font-semibold text-[#030A8C] hover:underline">
          <Plus className="w-3.5 h-3.5" /> Adicionar serviço orçado
        </button>
      )}
    </div>
  )
}

/* -------------------------------- histórico -------------------------------- */

function HistoryTab({ opp }: { opp: Opportunity }) {
  if (!opp.events || opp.events.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">Sem histórico registrado.</p>
  }
  return (
    <div className="space-y-2">
      {opp.events.map((e) => (
        <div key={e.id} className="flex items-start gap-2 text-xs">
          <History className="w-3 h-3 text-gray-300 mt-0.5 shrink-0" />
          <div>
            <p className="text-gray-700">{e.message}</p>
            <p className="text-[10px] text-gray-400">
              {e.type} · {new Date(e.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              {e.user?.name ? ` · ${e.user.name}` : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

/* --------------------- conferência de fechamento (ganho) --------------------- */

function CloseWonModal({ opp, onClose, onDone }: { opp: Opportunity; onClose: () => void; onDone: (msg: string) => void }) {
  const [clientName, setClientName] = useState(opp.client?.name ?? opp.prospect?.tradeName ?? opp.prospect?.name ?? opp.title)
  const [legalName, setLegalName] = useState(opp.prospect?.name ?? '')
  const [document, setDocument] = useState(opp.client?.cnpj ?? opp.prospect?.document ?? '')
  const [email, setEmail] = useState(opp.prospect?.email ?? '')
  const [phone, setPhone] = useState(opp.prospect?.phone ?? '')
  const [paymentDay, setPaymentDay] = useState('')
  const [contractStart, setContractStart] = useState(hoje())
  const [contractMonths, setContractMonths] = useState('')
  const [items, setItems] = useState(opp.items.map((i) => ({
    id: i.id, name: i.name, contractType: i.contractType, unitCents: i.unitCents,
    quantity: i.quantity, discountCents: i.discountCents,
    startDate: i.startDate?.slice(0, 10) ?? '', competence: i.competence ?? hoje().slice(0, 7),
    months: i.months ?? null, dueDay: '',
  })))
  const [matches, setMatches] = useState<{ exact: { id: string; name: string } | null; suggestions: Array<{ id: string; name: string; reason: string }> } | null>(null)
  const [clientId, setClientId] = useState<string | null>(opp.client?.id ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ clientId: string; clientName: string; created: boolean } | null>(null)

  useEffect(() => {
    if (clientId) return
    const params = new URLSearchParams({ document, name: clientName, email, phone })
    fetch(`/api/pipeline/duplicados?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setMatches(b))
      .catch(() => {})
  }, [clientId, document, clientName, email, phone])

  const erros = validateStageMove({
    from: opp.stage, to: 'GANHO',
    items: items.map((i) => ({ ...i, competence: i.contractType === 'AVULSO' ? i.competence : null })),
  })

  async function confirm() {
    if (saving) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/pipeline/${opp.id}/etapa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'GANHO',
          conversion: {
            clientId: clientId ?? matches?.exact?.id ?? null,
            clientData: {
              name: clientName, legalName: legalName || null, document: document || null,
              email: email || null, phone: phone || null,
              paymentDay: paymentDay ? Number(paymentDay) : null,
              contractStart, contractMonths: contractMonths ? Number(contractMonths) : null,
              billingEmail: email || null,
            },
            items: items.map((i) => ({
              id: i.id, unitCents: i.unitCents, quantity: i.quantity, discountCents: i.discountCents,
              contractType: i.contractType, startDate: i.startDate || null,
              competence: i.contractType === 'AVULSO' ? i.competence : null,
              months: i.months, dueDay: i.dueDay ? Number(i.dueDay) : null,
            })),
          },
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível concluir a conversão.'); return }
      setDone(body.conversion)
    } catch {
      setError('Falha de conexão. A negociação segue na etapa anterior.')
    } finally { setSaving(false) }
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-sm p-5 shadow-xl text-center">
          <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2" />
          <p className="font-bold text-gray-900">Negociação ganha</p>
          <p className="text-xs text-gray-500 mt-1">
            {done.created ? 'Cliente criado' : 'Cliente vinculado'}: {done.clientName}. Serviços contratados e classificação atualizados.
          </p>
          <p className="text-[11px] text-gray-400 mt-2">Nenhuma cobrança foi emitida e nenhum pagamento foi registrado.</p>
          <div className="flex gap-2 mt-4">
            <button onClick={() => onDone('Negociação convertida em cliente.')} className="flex-1 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg">Ficar no pipeline</button>
            <Link href={`/clientes/${done.clientId}`} className="flex-1 px-3 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold text-center">Abrir cliente</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[94dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-bold text-gray-900">Conferência de fechamento</h3>
            <p className="text-xs text-gray-500">Confirme os dados antes de criar a contratação.</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          {erros.length > 0 && (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">{erros.join(' ')}</p>
          )}

          {/* Cliente */}
          <div>
            <p className="text-xs font-bold text-gray-900 mb-2">Cliente</p>
            {clientId ? (
              <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                Vinculado ao cliente já cadastrado. Só os serviços desta negociação serão adicionados.
                <button onClick={() => setClientId(null)} className="ml-2 text-[#030A8C] font-semibold">trocar</button>
              </p>
            ) : (
              <>
                {matches?.exact && (
                  <div className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-2">
                    Já existe cliente com este CPF/CNPJ: <span className="font-semibold">{matches.exact.name}</span>.
                    <button onClick={() => setClientId(matches.exact!.id)} className="ml-2 font-semibold underline">usar este cadastro</button>
                  </div>
                )}
                {(matches?.suggestions.length ?? 0) > 0 && (
                  <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-2 space-y-1">
                    <p className="font-semibold">Pode ser um destes cadastros:</p>
                    {matches!.suggestions.map((s) => (
                      <p key={s.id}>
                        {s.name} <span className="text-gray-400">({s.reason})</span>
                        <button onClick={() => setClientId(s.id)} className="ml-2 text-[#030A8C] font-semibold">usar</button>
                      </p>
                    ))}
                    <p className="text-[11px] text-gray-400">Nada é fundido automaticamente.</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-gray-600 mb-1 block">Nome *</label><input value={clientName} onChange={(e) => setClientName(e.target.value)} className="input text-sm" /></div>
                  <div><label className="text-xs font-medium text-gray-600 mb-1 block">Razão social</label><input value={legalName} onChange={(e) => setLegalName(e.target.value)} className="input text-sm" /></div>
                  <div><label className="text-xs font-medium text-gray-600 mb-1 block">CPF/CNPJ</label><input value={document} onChange={(e) => setDocument(e.target.value)} className="input text-sm" /></div>
                  <div><label className="text-xs font-medium text-gray-600 mb-1 block">E-mail</label><input value={email} onChange={(e) => setEmail(e.target.value)} className="input text-sm" /></div>
                  <div><label className="text-xs font-medium text-gray-600 mb-1 block">Telefone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input text-sm" /></div>
                  <div><label className="text-xs font-medium text-gray-600 mb-1 block">Dia de vencimento</label><input type="number" min={1} max={31} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} className="input text-sm" /></div>
                  <div><label className="text-xs font-medium text-gray-600 mb-1 block">Início da prestação</label><input type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} className="input text-sm" /></div>
                  <div><label className="text-xs font-medium text-gray-600 mb-1 block">Duração (meses)</label><input type="number" min={0} value={contractMonths} onChange={(e) => setContractMonths(e.target.value)} className="input text-sm" /></div>
                </div>
              </>
            )}
          </div>

          {/* Serviços finais */}
          <div>
            <p className="text-xs font-bold text-gray-900 mb-2">Serviços contratados</p>
            <div className="space-y-2">
              {items.map((i, idx) => (
                <div key={i.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{i.name}</p>
                    <span className="text-sm font-semibold text-gray-900">{brl(Math.max(0, i.unitCents * Math.max(1, i.quantity) - i.discountCents))}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 block">Tipo</label>
                      <select value={i.contractType} onChange={(e) => setItems((p) => p.map((x, k) => (k === idx ? { ...x, contractType: e.target.value } : x)))} className="input text-xs">
                        {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    {i.contractType === 'AVULSO' ? (
                      <div>
                        <label className="text-[10px] text-gray-500 block">Competência</label>
                        <input type="month" value={i.competence} onChange={(e) => setItems((p) => p.map((x, k) => (k === idx ? { ...x, competence: e.target.value } : x)))} className="input text-xs" />
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] text-gray-500 block">Início</label>
                        <input type="date" value={i.startDate} onChange={(e) => setItems((p) => p.map((x, k) => (k === idx ? { ...x, startDate: e.target.value } : x)))} className="input text-xs" />
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] text-gray-500 block">Vencimento</label>
                      <input type="number" min={1} max={31} value={i.dueDay} onChange={(e) => setItems((p) => p.map((x, k) => (k === idx ? { ...x, dueDay: e.target.value } : x)))} className="input text-xs" placeholder="cliente" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block">Meses</label>
                      <input type="number" min={0} value={i.months ?? ''} onChange={(e) => setItems((p) => p.map((x, k) => (k === idx ? { ...x, months: e.target.value ? Number(e.target.value) : null } : x)))} className="input text-xs" />
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && <p className="text-xs text-orange-700">Sem serviços: detalhe o orçamento antes de fechar.</p>}
            </div>
          </div>

          <p className="text-[11px] text-gray-400">
            Ao confirmar: o cliente é criado ou vinculado, os serviços entram com as regras financeiras atuais e a classificação é recalculada.
            Nenhuma cobrança é emitida, nenhuma nota é gerada e nenhum pagamento é registrado.
          </p>
        </div>

        <div className="flex justify-end gap-2 p-4 sm:p-5 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} disabled={saving} className="px-3 py-2 text-xs font-medium text-gray-600">Cancelar</button>
          <button onClick={confirm} disabled={saving || erros.length > 0 || items.length === 0} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-40">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar fechamento
          </button>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------- reabertura -------------------------------- */

function ReopenModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/pipeline/${id}/reabrir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível reabrir.'); return }
      onDone('Negociação reaberta. Cliente, serviços e pagamentos foram preservados.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-sm p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-gray-900 mb-1">Reabrir negociação convertida</p>
        <p className="text-xs text-gray-500 mb-3">O cliente, os serviços, os pagamentos e os documentos continuam como estão. Fica registrado no histórico.</p>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">{error}</p>}
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="input text-sm" placeholder="Motivo da reabertura" autoFocus />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={saving} className="px-3 py-2 text-xs font-medium text-gray-600">Cancelar</button>
          <button onClick={submit} disabled={saving || !reason.trim()} className="px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold disabled:opacity-40">Reabrir</button>
        </div>
      </div>
    </div>
  )
}
