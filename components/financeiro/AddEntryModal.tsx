'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import CurrencyInput from '@/components/ui/CurrencyInput'
import { formatCurrency } from '@/lib/utils'

interface ClientOption { id: string; name: string; paymentDay?: number | null }
interface CatalogOption { id: string; name: string; category: string | null; billingType: string; minCents: number | null; maxCents: number | null; defaultCents: number | null; isActive: boolean }

/**
 * "Adicionar lançamento" do Financeiro. Duas naturezas, um único endpoint:
 * - Receita avulsa: vira serviço AVULSO do cliente na competência escolhida,
 *   com parcela única (e cobrança no Asaas quando pedido).
 * - Ajuste: lançamento manual solto (positivo = receita, negativo = custo).
 * Custos recorrentes e salários continuam nas abas próprias.
 */
export default function AddEntryModal({
  period, onClose, onSaved,
}: {
  period: { year: number; month: number }
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const competenceDefault = `${period.year}-${String(period.month).padStart(2, '0')}`
  const [kind, setKind] = useState<'RECEITA_AVULSA' | 'AJUSTE'>('RECEITA_AVULSA')
  const [clients, setClients] = useState<ClientOption[]>([])
  const [catalog, setCatalog] = useState<CatalogOption[]>([])
  const [clientId, setClientId] = useState('')
  const [catalogId, setCatalogId] = useState('')
  const [description, setDescription] = useState('')
  const [value, setValue] = useState<number | null>(null)
  const [competence, setCompetence] = useState(competenceDefault)
  const [dueDay, setDueDay] = useState('')
  const [generateCharge, setGenerateCharge] = useState(true)
  const [createChargeNow, setCreateChargeNow] = useState(false)
  const [emitNfse, setEmitNfse] = useState(false)
  const [notes, setNotes] = useState('')
  const [adjustSign, setAdjustSign] = useState<'RECEITA' | 'CUSTO'>('CUSTO')
  const [date, setDate] = useState(`${competenceDefault}-05`)
  const [paid, setPaid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/clientes')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => setClients((Array.isArray(b) ? b : b.clients ?? []).map((c: ClientOption) => ({ id: c.id, name: c.name, paymentDay: c.paymentDay }))))
      .catch(() => setClients([]))
    fetch('/api/servicos')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => setCatalog((b.catalog ?? []).filter((c: CatalogOption) => c.isActive)))
      .catch(() => setCatalog([]))
  }, [])

  const item = catalog.find((c) => c.id === catalogId) ?? null
  const cents = value != null ? Math.round(value * 100) : null
  const outOfRange = item && cents != null
    ? (item.minCents != null && cents < item.minCents ? 'abaixo' : item.maxCents != null && cents > item.maxCents ? 'acima' : null)
    : null

  function pickCatalog(id: string) {
    setCatalogId(id)
    const c = catalog.find((x) => x.id === id)
    if (c) {
      if (!description) setDescription(c.name)
      if (value == null && c.defaultCents != null) setValue(c.defaultCents / 100)
    }
  }

  async function submit() {
    if (cents == null) return
    setSaving(true); setError(null)
    try {
      const payload = kind === 'RECEITA_AVULSA'
        ? {
            kind, clientId, catalogId: catalogId || undefined,
            description: description || undefined,
            cents, competence, dueDay: dueDay || undefined,
            generateCharge, createChargeNow: generateCharge && createChargeNow, emitNfse,
            notes: notes || undefined,
          }
        : {
            kind, competence, description,
            cents: adjustSign === 'CUSTO' ? -Math.abs(cents) : Math.abs(cents),
            date, paid,
          }
      const res = await fetch('/api/financeiro/lancamentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível lançar.'); return }
      onSaved(
        kind === 'RECEITA_AVULSA'
          ? body.chargeError
            ? `Receita avulsa lançada, mas a cobrança falhou: ${body.chargeError}`
            : body.charge?.created ? 'Receita avulsa lançada e cobrança gerada no Asaas.' : 'Receita avulsa lançada.'
          : 'Ajuste registrado.',
      )
    } catch {
      setError('Falha de conexão. Tente de novo.')
    } finally { setSaving(false) }
  }

  const canSave = cents != null && cents !== 0 && (kind === 'AJUSTE' ? !!description.trim() : !!clientId && (!!catalogId || !!description.trim()))

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900">Adicionar lançamento</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2">
            {([['RECEITA_AVULSA', 'Receita avulsa'], ['AJUSTE', 'Ajuste manual']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setKind(k)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${kind === k ? 'bg-[#030A8C] text-white border-[#030A8C]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#030A8C]'}`}>
                {l}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">
            {kind === 'RECEITA_AVULSA'
              ? 'Serviço extra de um cliente numa competência específica. Não entra no MRR nem muda o grupo.'
              : 'Acerto pontual fora dos serviços. Positivo entra como receita extra; negativo como custo.'}
          </p>

          {kind === 'RECEITA_AVULSA' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Cliente *</label>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input text-sm">
                  <option value="">Selecione…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Serviço do catálogo</label>
                <select value={catalogId} onChange={(e) => pickCatalog(e.target.value)} className="input text-sm">
                  <option value="">Sem catálogo (descrever abaixo)</option>
                  {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}{c.category ? ` · ${c.category}` : ''}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição {catalogId ? '' : '*'}</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className="input text-sm" placeholder="Ex: Landing page campanha Black Friday" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Valor *</label>
                <CurrencyInput value={value} onChange={setValue} className="input text-sm" ariaLabel="Valor da receita avulsa" />
                {outOfRange && <p className="text-[11px] text-orange-700 mt-1">Valor {outOfRange} da faixa do catálogo ({formatCurrency((item?.minCents ?? 0) / 100)} a {formatCurrency((item?.maxCents ?? 0) / 100)}).</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Competência *</label>
                <input type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} className="input text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Dia de vencimento</label>
                <input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} className="input text-sm" placeholder="Padrão do cliente" />
              </div>
              <div className="sm:col-span-2 space-y-1.5 text-sm text-gray-700">
                <label className="flex items-center gap-2"><input type="checkbox" checked={generateCharge} onChange={(e) => setGenerateCharge(e.target.checked)} /> Gerar cobrança para este serviço</label>
                {generateCharge && (
                  <label className="flex items-center gap-2 pl-5 text-xs"><input type="checkbox" checked={createChargeNow} onChange={(e) => setCreateChargeNow(e.target.checked)} /> Criar/atualizar a cobrança no Asaas agora</label>
                )}
                <label className="flex items-center gap-2"><input type="checkbox" checked={emitNfse} onChange={(e) => setEmitNfse(e.target.checked)} /> Marcar para emissão de NFS-e</label>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Observações</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input text-sm resize-none" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição *</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className="input text-sm" placeholder="Ex: Reembolso de anúncio" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Natureza</label>
                <select value={adjustSign} onChange={(e) => setAdjustSign(e.target.value as 'RECEITA' | 'CUSTO')} className="input text-sm">
                  <option value="CUSTO">Custo (saída)</option>
                  <option value="RECEITA">Receita extra (entrada)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Valor *</label>
                <CurrencyInput value={value} onChange={setValue} className="input text-sm" ariaLabel="Valor do ajuste" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Competência *</label>
                <input type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} className="input text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Data</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input text-sm" />
              </div>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Já quitado
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 sm:p-5 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} disabled={saving} className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50">Cancelar</button>
          <button onClick={submit} disabled={saving || !canSave} className="px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40">
            {saving ? 'Salvando…' : 'Lançar'}
          </button>
        </div>
      </div>
    </div>
  )
}
