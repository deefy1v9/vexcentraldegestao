'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Copy, Loader2, Check, ChevronDown, ChevronUp } from 'lucide-react'

interface ItemForm {
  uid: string
  name: string
  description: string
  scope: string
  deliverables: string
  quantity: number
  monthlyValue: string
  setupValue: string
  discountValue: string
  discountPercent: string
  months: number
  periodicity: 'MENSAL' | 'UNICO'
  changeType?: string
  previousMonthlyValue?: string
  open: boolean
}

function maskMoney(v: string): string {
  const digits = v.replace(/\D/g, '')
  if (!digits) return ''
  return (Number(digits) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function centsToMask(cents: number): string {
  return cents ? maskMoney(String(cents)) : ''
}
function toCents(v: string): number {
  const d = (v ?? '').replace(/\D/g, '')
  return d ? Number(d) : 0
}
function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

let uid = 0
const newUid = () => `e${++uid}`

/**
 * Edição da proposta. Alterar uma proposta já enviada não sobrescreve o
 * documento anterior: abra uma nova versão pela tela de detalhe.
 */
export default function ProposalEditor({ id }: { id: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [kind, setKind] = useState<'PROPOSTA' | 'ADITIVO'>('PROPOSTA')
  const [number, setNumber] = useState('')
  const [meta, setMeta] = useState({
    issueDate: '', validUntil: '', startDate: '', paymentTerms: '', paymentDay: '',
    notes: '', discountValue: '', discountPercent: '',
  })
  const [items, setItems] = useState<ItemForm[]>([])

  const load = useCallback(() => {
    fetch(`/api/propostas/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        const p = b?.proposal
        if (!p) return
        setNumber(p.number)
        setKind(p.kind === 'ADITIVO' ? 'ADITIVO' : 'PROPOSTA')
        setMeta({
          issueDate: p.issueDate.slice(0, 10),
          validUntil: p.validUntil.slice(0, 10),
          startDate: p.startDate ? p.startDate.slice(0, 10) : '',
          paymentTerms: p.paymentTerms ?? '',
          paymentDay: p.paymentDay ? String(p.paymentDay) : '',
          notes: p.notes ?? '',
          discountValue: centsToMask(p.discountCents ?? 0),
          discountPercent: p.discountPercent != null ? String(p.discountPercent) : '',
        })
        setItems((p.items ?? []).map((i: Record<string, unknown>) => ({
          uid: newUid(),
          name: String(i.name ?? ''),
          description: (i.description as string) ?? '',
          scope: (i.scope as string) ?? '',
          deliverables: ((i.deliverables as string[]) ?? []).join('\n'),
          quantity: Number(i.quantity ?? 1),
          monthlyValue: centsToMask(Number(i.monthlyCents ?? 0)),
          setupValue: centsToMask(Number(i.setupCents ?? 0)),
          discountValue: centsToMask(Number(i.discountCents ?? 0)),
          discountPercent: i.discountPercent != null ? String(i.discountPercent) : '',
          months: Number(i.months ?? 0),
          periodicity: i.periodicity === 'UNICO' ? 'UNICO' : 'MENSAL',
          changeType: (i.changeType as string) ?? undefined,
          previousMonthlyValue: centsToMask(Number(i.previousMonthlyCents ?? 0)),
          open: false,
        })))
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  function update(u: string, patch: Partial<ItemForm>) {
    setItems((prev) => prev.map((i) => (i.uid === u ? { ...i, ...patch } : i)))
  }

  const totals = useMemo(() => {
    let monthly = 0, setup = 0, months = 0
    for (const i of items) {
      const qty = Math.max(1, i.quantity || 1)
      const grossMonthly = i.periodicity === 'UNICO' ? 0 : toCents(i.monthlyValue) * qty
      const grossSetup = toCents(i.setupValue) * (i.periodicity === 'UNICO' ? qty : 1)
      const gross = grossMonthly + grossSetup
      const pct = Number(i.discountPercent) || 0
      const discount = Math.min(gross, toCents(i.discountValue) + Math.round((gross * pct) / 100))
      const setupDiscount = Math.min(grossSetup, discount)
      monthly += Math.max(0, grossMonthly - (discount - setupDiscount))
      setup += Math.max(0, grossSetup - setupDiscount)
      if (i.periodicity !== 'UNICO') months = Math.max(months, i.months || 0)
    }
    const base = monthly * months + setup
    const pct = Number(meta.discountPercent) || 0
    const general = Math.min(base, toCents(meta.discountValue) + Math.round((base * pct) / 100))
    return { monthly, setup, months, total: Math.max(0, base - general) }
  }, [items, meta.discountValue, meta.discountPercent])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/propostas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...meta,
          paymentDay: meta.paymentDay || null,
          startDate: meta.startDate || null,
          discountValue: toCents(meta.discountValue) / 100,
          discountPercent: meta.discountPercent ? Number(meta.discountPercent) : null,
          items: items.map((i) => ({
            name: i.name,
            description: i.description || null,
            scope: i.scope || null,
            deliverables: i.deliverables.split('\n').map((d) => d.trim()).filter(Boolean),
            quantity: i.quantity,
            monthlyValue: toCents(i.monthlyValue) / 100,
            setupValue: toCents(i.setupValue) / 100,
            discountValue: toCents(i.discountValue) / 100,
            discountPercent: i.discountPercent ? Number(i.discountPercent) : null,
            months: i.months,
            periodicity: i.periodicity,
            changeType: i.changeType ?? null,
            previousMonthlyValue: i.previousMonthlyValue ? toCents(i.previousMonthlyValue) / 100 : null,
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível salvar.'); return }
      setSaved(true)
      setTimeout(() => router.push(`/propostas/${id}`), 600)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="max-w-4xl space-y-3 animate-pulse">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}</div>
  }

  return (
    <div className="max-w-4xl space-y-4 pb-28 lg:pb-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link href={`/propostas/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <span className="text-xs font-semibold text-gray-500">{number}</span>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Data da proposta</label>
          <input type="date" value={meta.issueDate} onChange={(e) => setMeta((m) => ({ ...m, issueDate: e.target.value }))} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Validade</label>
          <input type="date" value={meta.validUntil} onChange={(e) => setMeta((m) => ({ ...m, validUntil: e.target.value }))} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Início previsto</label>
          <input type="date" value={meta.startDate} onChange={(e) => setMeta((m) => ({ ...m, startDate: e.target.value }))} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Dia de vencimento</label>
          <input type="number" min={1} max={28} value={meta.paymentDay} onChange={(e) => setMeta((m) => ({ ...m, paymentDay: e.target.value }))} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Condições de pagamento</label>
          <input value={meta.paymentTerms} onChange={(e) => setMeta((m) => ({ ...m, paymentTerms: e.target.value }))} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Desconto geral (R$)</label>
          <input value={meta.discountValue} onChange={(e) => setMeta((m) => ({ ...m, discountValue: maskMoney(e.target.value) }))} className="input" inputMode="numeric" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Desconto geral (%)</label>
          <input type="number" min={0} max={100} step="0.01" value={meta.discountPercent} onChange={(e) => setMeta((m) => ({ ...m, discountPercent: e.target.value }))} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Observações</label>
          <textarea value={meta.notes} onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))} rows={3} className="input resize-none" />
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.uid} className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0 space-y-2">
                <input value={item.name} onChange={(e) => update(item.uid, { name: e.target.value })} className="input font-medium" placeholder="Nome do serviço" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select value={item.periodicity} onChange={(e) => update(item.uid, { periodicity: e.target.value as 'MENSAL' | 'UNICO' })} className="input text-xs">
                    <option value="MENSAL">Mensal</option>
                    <option value="UNICO">Único</option>
                  </select>
                  <input
                    value={item.periodicity === 'UNICO' ? item.setupValue : item.monthlyValue}
                    onChange={(e) => update(item.uid, item.periodicity === 'UNICO' ? { setupValue: maskMoney(e.target.value) } : { monthlyValue: maskMoney(e.target.value) })}
                    className="input text-xs" placeholder="Valor" inputMode="numeric"
                  />
                  <input type="number" min={0} value={item.months} disabled={item.periodicity === 'UNICO'} onChange={(e) => update(item.uid, { months: Number(e.target.value) })} className="input text-xs disabled:opacity-50" placeholder="Meses" />
                  <input type="number" min={0} max={100} step="0.01" value={item.discountPercent} onChange={(e) => update(item.uid, { discountPercent: e.target.value })} className="input text-xs" placeholder="Desc. %" />
                </div>
                <button onClick={() => update(item.uid, { open: !item.open })} className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-[#030A8C]">
                  {item.open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Mais opções
                </button>
                {item.open && (
                  <div className="space-y-2">
                    <textarea value={item.scope} onChange={(e) => update(item.uid, { scope: e.target.value })} rows={2} className="input text-xs resize-none" placeholder="Escopo" />
                    <textarea value={item.deliverables} onChange={(e) => update(item.uid, { deliverables: e.target.value })} rows={3} className="input text-xs resize-none" placeholder="Entregáveis — um por linha" />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <input type="number" min={1} value={item.quantity} onChange={(e) => update(item.uid, { quantity: Number(e.target.value) })} className="input text-xs" placeholder="Quantidade" />
                      <input value={item.setupValue} onChange={(e) => update(item.uid, { setupValue: maskMoney(e.target.value) })} className="input text-xs" placeholder="Setup" inputMode="numeric" />
                      <input value={item.discountValue} onChange={(e) => update(item.uid, { discountValue: maskMoney(e.target.value) })} className="input text-xs" placeholder="Desconto R$" inputMode="numeric" />
                      {kind === 'ADITIVO' && (
                        <>
                          <select value={item.changeType} onChange={(e) => update(item.uid, { changeType: e.target.value })} className="input text-xs">
                            <option value="ADICIONA">Inclusão</option>
                            <option value="ALTERA">Alteração</option>
                            <option value="REMOVE">Exclusão</option>
                            <option value="MANTEM">Mantido</option>
                          </select>
                          <input value={item.previousMonthlyValue ?? ''} onChange={(e) => update(item.uid, { previousMonthlyValue: maskMoney(e.target.value) })} className="input text-xs" placeholder="Valor anterior" inputMode="numeric" />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => setItems((prev) => [...prev, { ...item, uid: newUid() }])} aria-label="Duplicar" className="p-1 text-gray-300 hover:text-[#030A8C]"><Copy className="w-3.5 h-3.5" /></button>
                <button onClick={() => setItems((prev) => prev.filter((i) => i.uid !== item.uid))} aria-label="Remover" className="p-1 text-gray-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={() => setItems((prev) => [...prev, {
            uid: newUid(), name: '', description: '', scope: '', deliverables: '', quantity: 1,
            monthlyValue: '', setupValue: '', discountValue: '', discountPercent: '', months: 12,
            periodicity: 'MENSAL', open: true, ...(kind === 'ADITIVO' ? { changeType: 'ADICIONA' } : {}),
          }])}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#030A8C] hover:underline"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar serviço
        </button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 lg:static bg-white border-t lg:border border-gray-200 lg:rounded-xl p-3 lg:p-4 z-30 lg:z-auto">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-500">Mensal <b className="text-gray-900 block">{brl(totals.monthly)}</b></span>
            {totals.setup > 0 && <span className="text-gray-500">Único <b className="text-gray-900 block">{brl(totals.setup)}</b></span>}
            <span className="text-gray-500">Total <b className="text-[#030A8C] block">{brl(totals.total)}</b></span>
          </div>
          <button
            onClick={save}
            disabled={saving || items.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
            {saving ? 'Salvando…' : saved ? 'Salvo' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
