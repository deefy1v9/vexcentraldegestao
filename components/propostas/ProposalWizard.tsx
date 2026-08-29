'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Building2, UserPlus, Search, Plus, Trash2, Copy, RotateCcw,
  ChevronDown, ChevronUp, Loader2, AlertTriangle, Check,
} from 'lucide-react'

/* ---------------------------------- tipos ---------------------------------- */

interface ClientOption { id: string; name: string }
interface CatalogItem {
  key: string; name: string; description: string | null; scope: string | null
  deliverables: string[]; monthlyCents: number; setupCents: number; months: number; periodicity: string
}
interface ItemForm {
  uid: string
  serviceId?: string | null
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
  notes: string
  open: boolean
  changeType?: string
  previousMonthlyValue?: string
}

const EMPTY_PROSPECT = {
  personType: 'PJ', document: '', name: '', tradeName: '', contactName: '', email: '', phone: '',
  zipCode: '', street: '', addressNumber: '', complement: '', district: '', city: '', state: '',
}

/* --------------------------------- máscaras --------------------------------- */

function maskDoc(v: string, type: string): string {
  const d = v.replace(/\D/g, '').slice(0, type === 'PF' ? 11 : 14)
  if (type === 'PF') {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}
function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}
function maskZip(v: string): string {
  return v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d{1,3})$/, '$1-$2')
}
function maskMoney(v: string): string {
  const digits = v.replace(/\D/g, '')
  if (!digits) return ''
  const cents = Number(digits)
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function toCents(v: string): number {
  const digits = (v ?? '').replace(/\D/g, '')
  return digits ? Number(digits) : 0
}
function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10)
}

let uidSeq = 0
const newUid = () => `i${++uidSeq}`

/* -------------------------------- componente -------------------------------- */

/**
 * Nova proposta em três etapas: destinatário → serviços → revisão.
 * Cliente existente não exige redigitação; prospect não vira cliente aqui.
 */
export default function ProposalWizard({
  clients,
  initialClientId,
  kind = 'PROPOSTA',
  parentId,
}: {
  clients: ClientOption[]
  initialClientId?: string
  kind?: 'PROPOSTA' | 'ADITIVO'
  parentId?: string
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'cliente' | 'prospect'>(initialClientId ? 'cliente' : 'cliente')
  const [clientId, setClientId] = useState(initialClientId ?? '')
  const [prospect, setProspect] = useState({ ...EMPTY_PROSPECT })
  const [prospectId, setProspectId] = useState<string | null>(null)
  const [docCheck, setDocCheck] = useState<{ valid?: boolean; clientId?: string; clientName?: string; prospectId?: string } | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [items, setItems] = useState<ItemForm[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState({
    issueDate: todayISO(),
    validUntil: addDays(todayISO(), 15),
    startDate: '',
    paymentTerms: '',
    paymentDay: '',
    notes: '',
    discountValue: '',
    discountPercent: '',
  })

  /* --------------------------- dados do sistema --------------------------- */

  const loadCatalog = useCallback((cid?: string) => {
    const params = cid ? `?clientId=${cid}` : ''
    fetch(`/api/servicos/catalogo${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b) return
        setCatalog(b.catalog ?? [])
        // Serviços atuais do cliente entram como sugestão inicial
        if (cid && Array.isArray(b.clientServices) && b.clientServices.length > 0) {
          setItems((prev) => (prev.length > 0 ? prev : b.clientServices.map((s: CatalogItem & { serviceId: string }) => ({
            uid: newUid(),
            serviceId: s.serviceId,
            name: s.name,
            description: s.description ?? '',
            scope: s.scope ?? '',
            deliverables: (s.deliverables ?? []).join('\n'),
            quantity: 1,
            monthlyValue: s.monthlyCents ? maskMoney(String(s.monthlyCents)) : '',
            setupValue: s.setupCents ? maskMoney(String(s.setupCents)) : '',
            discountValue: '',
            discountPercent: '',
            months: s.months || 12,
            periodicity: s.periodicity === 'UNICO' ? 'UNICO' : 'MENSAL',
            notes: '',
            open: false,
            ...(kind === 'ADITIVO'
              ? { changeType: 'ALTERA', previousMonthlyValue: s.monthlyCents ? maskMoney(String(s.monthlyCents)) : '' }
              : {}),
          }))))
        }
      })
      .catch(() => {})
  }, [kind])

  useEffect(() => { loadCatalog(clientId || undefined) }, [clientId, loadCatalog])

  // Verifica o documento enquanto o admin digita (evita cadastro duplicado)
  useEffect(() => {
    const digits = prospect.document.replace(/\D/g, '')
    if (mode !== 'prospect' || digits.length < 11) { setDocCheck(null); return }
    const t = setTimeout(() => {
      fetch(`/api/prospects?document=${digits}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => b && setDocCheck({
          valid: b.valid,
          clientId: b.client?.id,
          clientName: b.client?.name,
          prospectId: b.prospect?.id,
        }))
        .catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [prospect.document, mode])

  /* --------------------------------- itens --------------------------------- */

  function addFromCatalog(c: CatalogItem) {
    setItems((prev) => [...prev, {
      uid: newUid(),
      name: c.name,
      description: c.description ?? '',
      scope: c.scope ?? '',
      deliverables: (c.deliverables ?? []).join('\n'),
      quantity: 1,
      monthlyValue: c.monthlyCents ? maskMoney(String(c.monthlyCents)) : '',
      setupValue: c.setupCents ? maskMoney(String(c.setupCents)) : '',
      discountValue: '',
      discountPercent: '',
      months: c.months || 12,
      periodicity: c.periodicity === 'UNICO' ? 'UNICO' : 'MENSAL',
      notes: '',
      open: false,
      ...(kind === 'ADITIVO' ? { changeType: 'ADICIONA', previousMonthlyValue: '' } : {}),
    }])
    setSearch('')
  }

  function addBlank() {
    setItems((prev) => [...prev, {
      uid: newUid(), name: '', description: '', scope: '', deliverables: '', quantity: 1,
      monthlyValue: '', setupValue: '', discountValue: '', discountPercent: '', months: 12,
      periodicity: 'MENSAL', notes: '', open: true,
      ...(kind === 'ADITIVO' ? { changeType: 'ADICIONA', previousMonthlyValue: '' } : {}),
    }])
  }

  function update(uid: string, patch: Partial<ItemForm>) {
    setItems((prev) => prev.map((i) => (i.uid === uid ? { ...i, ...patch } : i)))
  }
  function remove(uid: string) { setItems((prev) => prev.filter((i) => i.uid !== uid)) }
  function duplicate(uid: string) {
    setItems((prev) => {
      const found = prev.find((i) => i.uid === uid)
      return found ? [...prev, { ...found, uid: newUid(), serviceId: null }] : prev
    })
  }
  function move(uid: string, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.uid === uid)
      const next = idx + dir
      if (idx < 0 || next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
      return copy
    })
  }
  function applyMonths(months: number) { setItems((prev) => prev.map((i) => (i.periodicity === 'UNICO' ? i : { ...i, months }))) }
  function applyDiscount(percent: string) { setItems((prev) => prev.map((i) => ({ ...i, discountPercent: percent }))) }
  function restoreDefaults(uid: string) {
    const item = items.find((i) => i.uid === uid)
    const base = catalog.find((c) => c.name === item?.name)
    if (!item || !base) return
    update(uid, {
      monthlyValue: base.monthlyCents ? maskMoney(String(base.monthlyCents)) : '',
      setupValue: base.setupCents ? maskMoney(String(base.setupCents)) : '',
      months: base.months || 12,
      discountValue: '', discountPercent: '',
    })
  }

  /* -------------------------------- totais -------------------------------- */

  const totals = useMemo(() => {
    let monthly = 0
    let setup = 0
    let itemsDiscount = 0
    let months = 0
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
      itemsDiscount += discount
      if (i.periodicity !== 'UNICO') months = Math.max(months, i.months || 0)
    }
    const base = monthly * months + setup
    const generalPct = Number(meta.discountPercent) || 0
    const general = Math.min(base, toCents(meta.discountValue) + Math.round((base * generalPct) / 100))
    return { monthly, setup, months, itemsDiscount, general, total: Math.max(0, base - general) }
  }, [items, meta.discountValue, meta.discountPercent])

  /* -------------------------------- submit -------------------------------- */

  const canAdvanceStep0 = mode === 'cliente'
    ? !!clientId
    : !!prospect.name.trim() && prospect.document.replace(/\D/g, '').length >= 11 && docCheck?.valid !== false && !docCheck?.clientId

  async function ensureProspect(): Promise<string | null> {
    if (prospectId) return prospectId
    const res = await fetch('/api/prospects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prospect),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (body.prospectId) { setProspectId(body.prospectId); return body.prospectId }
      setError(body.error || 'Não foi possível cadastrar o prospect.')
      return null
    }
    setProspectId(body.id)
    return body.id
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      let pid: string | null = null
      if (mode === 'prospect') {
        pid = await ensureProspect()
        if (!pid) return
      }
      const res = await fetch('/api/propostas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          parentId: parentId ?? null,
          clientId: mode === 'cliente' ? clientId : null,
          prospectId: pid,
          issueDate: meta.issueDate,
          validUntil: meta.validUntil,
          startDate: meta.startDate || null,
          paymentDay: meta.paymentDay || null,
          paymentTerms: meta.paymentTerms || null,
          notes: meta.notes || null,
          discountValue: meta.discountValue || 0,
          discountPercent: meta.discountPercent || null,
          items: items.map((i) => ({
            serviceId: i.serviceId ?? null,
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
      router.push(`/propostas/${body.id}`)
    } finally {
      setBusy(false)
    }
  }

  const filteredCatalog = catalog.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
  const steps = ['Cliente', 'Serviços', 'Revisão']

  return (
    <div className="max-w-4xl space-y-4 pb-28 lg:pb-6">
      {/* Passos */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => i < step && setStep(i)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                i === step ? 'bg-[#030A8C] text-white' : i < step ? 'bg-[#030A8C]/10 text-[#030A8C]' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i + 1}. {label}
            </button>
            {i < steps.length - 1 && <span className="w-4 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </p>
      )}

      {/* ETAPA 1 */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {([['cliente', 'Cliente existente', Building2], ['prospect', 'Novo prospect', UserPlus]] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                  mode === key ? 'border-[#030A8C] text-[#030A8C] bg-[#030A8C]/5' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {mode === 'cliente' ? (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">Cliente *</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input">
                <option value="">Selecione</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-[11px] text-gray-400 mt-2">
                Nome, documento, e-mail, telefone e endereço vêm do cadastro — nada precisa ser redigitado.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                {(['PJ', 'PF'] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1.5 text-xs text-gray-700">
                    <input
                      type="radio"
                      checked={prospect.personType === t}
                      onChange={() => setProspect((p) => ({ ...p, personType: t, document: '' }))}
                    />
                    {t === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{prospect.personType === 'PJ' ? 'CNPJ' : 'CPF'} *</label>
                  <input
                    value={prospect.document}
                    onChange={(e) => setProspect((p) => ({ ...p, document: maskDoc(e.target.value, p.personType) }))}
                    className="input"
                    placeholder={prospect.personType === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                    inputMode="numeric"
                  />
                  {docCheck?.valid === false && <p className="text-[11px] text-red-600 mt-1">CPF/CNPJ inválido — confira os dígitos.</p>}
                  {docCheck?.clientId && (
                    <p className="text-[11px] text-orange-700 mt-1">
                      Já existe um cliente com este documento.{' '}
                      <button
                        type="button"
                        onClick={() => { setMode('cliente'); setClientId(docCheck.clientId!) }}
                        className="font-semibold text-[#030A8C] hover:underline"
                      >
                        Usar cliente existente
                      </button>
                    </p>
                  )}
                  {docCheck?.prospectId && !docCheck.clientId && (
                    <p className="text-[11px] text-gray-500 mt-1">Prospect já cadastrado — será reaproveitado.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{prospect.personType === 'PJ' ? 'Razão social' : 'Nome completo'} *</label>
                  <input value={prospect.name} onChange={(e) => setProspect((p) => ({ ...p, name: e.target.value }))} className="input" />
                </div>
                {prospect.personType === 'PJ' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nome fantasia</label>
                    <input value={prospect.tradeName} onChange={(e) => setProspect((p) => ({ ...p, tradeName: e.target.value }))} className="input" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Responsável</label>
                  <input value={prospect.contactName} onChange={(e) => setProspect((p) => ({ ...p, contactName: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">E-mail</label>
                  <input type="email" value={prospect.email} onChange={(e) => setProspect((p) => ({ ...p, email: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Telefone</label>
                  <input value={prospect.phone} onChange={(e) => setProspect((p) => ({ ...p, phone: maskPhone(e.target.value) }))} className="input" inputMode="numeric" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">CEP</label>
                  <input value={prospect.zipCode} onChange={(e) => setProspect((p) => ({ ...p, zipCode: maskZip(e.target.value) }))} className="input" inputMode="numeric" />
                </div>
                <div className="sm:col-span-2 grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Logradouro</label>
                    <input value={prospect.street} onChange={(e) => setProspect((p) => ({ ...p, street: e.target.value }))} className="input" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Número</label>
                    <input value={prospect.addressNumber} onChange={(e) => setProspect((p) => ({ ...p, addressNumber: e.target.value }))} className="input" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Complemento</label>
                  <input value={prospect.complement} onChange={(e) => setProspect((p) => ({ ...p, complement: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Bairro</label>
                  <input value={prospect.district} onChange={(e) => setProspect((p) => ({ ...p, district: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cidade</label>
                  <input value={prospect.city} onChange={(e) => setProspect((p) => ({ ...p, city: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">UF</label>
                  <input value={prospect.state} onChange={(e) => setProspect((p) => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }))} className="input" />
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                Cadastrar um prospect não cria cliente. A conversão é oferecida depois que a proposta for aprovada.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ETAPA 2 */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar serviço cadastrado"
                className="input"
                style={{ paddingLeft: '2.25rem' }}
              />
            </div>
            {search && (
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                {filteredCatalog.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-2">Nenhum serviço encontrado no catálogo.</p>
                ) : filteredCatalog.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => addFromCatalog(c)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-sm text-gray-900">{c.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {c.monthlyCents > 0 ? `${brl(c.monthlyCents)}/mês` : c.setupCents > 0 ? `${brl(c.setupCents)} único` : 'sem valor padrão'}
                    </p>
                  </button>
                ))}
              </div>
            )}
            <button onClick={addBlank} className="flex items-center gap-1.5 text-xs font-semibold text-[#030A8C] hover:underline">
              <Plus className="w-3.5 h-3.5" /> Adicionar serviço manualmente
            </button>
          </div>

          {items.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap text-[11px]">
              <span className="text-gray-500">Ações rápidas:</span>
              <button onClick={() => applyMonths(6)} className="font-semibold text-[#030A8C] hover:underline">6 meses para todos</button>
              <button onClick={() => applyMonths(12)} className="font-semibold text-[#030A8C] hover:underline">12 meses para todos</button>
              <button onClick={() => applyDiscount('10')} className="font-semibold text-[#030A8C] hover:underline">10% em todos</button>
              <button onClick={() => applyDiscount('')} className="font-semibold text-gray-500 hover:underline">limpar descontos</button>
            </div>
          )}

          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={item.uid} className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0 space-y-2">
                    <input
                      value={item.name}
                      onChange={(e) => update(item.uid, { name: e.target.value })}
                      placeholder="Nome do serviço *"
                      className="input font-medium"
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">Cobrança</label>
                        <select
                          value={item.periodicity}
                          onChange={(e) => update(item.uid, { periodicity: e.target.value as 'MENSAL' | 'UNICO' })}
                          className="input text-xs"
                        >
                          <option value="MENSAL">Mensal</option>
                          <option value="UNICO">Único</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">
                          {item.periodicity === 'UNICO' ? 'Valor único' : 'Valor mensal'}
                        </label>
                        <input
                          value={item.periodicity === 'UNICO' ? item.setupValue : item.monthlyValue}
                          onChange={(e) => update(item.uid, item.periodicity === 'UNICO'
                            ? { setupValue: maskMoney(e.target.value) }
                            : { monthlyValue: maskMoney(e.target.value) })}
                          className="input text-xs"
                          placeholder="0,00"
                          inputMode="numeric"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">Meses</label>
                        <input
                          type="number" min={0} max={120}
                          value={item.periodicity === 'UNICO' ? 0 : item.months}
                          disabled={item.periodicity === 'UNICO'}
                          onChange={(e) => update(item.uid, { months: Number(e.target.value) })}
                          className="input text-xs disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">Desconto %</label>
                        <input
                          type="number" min={0} max={100} step="0.01"
                          value={item.discountPercent}
                          onChange={(e) => update(item.uid, { discountPercent: e.target.value })}
                          className="input text-xs"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => update(item.uid, { open: !item.open })}
                      className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-[#030A8C]"
                    >
                      {item.open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Mais opções
                    </button>

                    {item.open && (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={item.scope}
                          onChange={(e) => update(item.uid, { scope: e.target.value })}
                          rows={2} className="input text-xs resize-none"
                          placeholder="Escopo do serviço (aparece na cláusula 2)"
                        />
                        <textarea
                          value={item.deliverables}
                          onChange={(e) => update(item.uid, { deliverables: e.target.value })}
                          rows={3} className="input text-xs resize-none"
                          placeholder="Entregáveis — um por linha"
                        />
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Quantidade</label>
                            <input type="number" min={1} value={item.quantity} onChange={(e) => update(item.uid, { quantity: Number(e.target.value) })} className="input text-xs" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Setup (R$)</label>
                            <input value={item.setupValue} onChange={(e) => update(item.uid, { setupValue: maskMoney(e.target.value) })} className="input text-xs" inputMode="numeric" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Desconto (R$)</label>
                            <input value={item.discountValue} onChange={(e) => update(item.uid, { discountValue: maskMoney(e.target.value) })} className="input text-xs" inputMode="numeric" />
                          </div>
                          {kind === 'ADITIVO' && (
                            <>
                              <div>
                                <label className="block text-[10px] font-medium text-gray-500 mb-1">Alteração</label>
                                <select value={item.changeType} onChange={(e) => update(item.uid, { changeType: e.target.value })} className="input text-xs">
                                  <option value="ADICIONA">Inclusão</option>
                                  <option value="ALTERA">Alteração</option>
                                  <option value="REMOVE">Exclusão</option>
                                  <option value="MANTEM">Mantido</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-gray-500 mb-1">Valor anterior</label>
                                <input value={item.previousMonthlyValue ?? ''} onChange={(e) => update(item.uid, { previousMonthlyValue: maskMoney(e.target.value) })} className="input text-xs" inputMode="numeric" />
                              </div>
                            </>
                          )}
                        </div>
                        <button onClick={() => restoreDefaults(item.uid)} className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-[#030A8C]">
                          <RotateCcw className="w-3 h-3" /> Restaurar valor padrão
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <button onClick={() => move(item.uid, -1)} disabled={index === 0} aria-label="Subir" className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => move(item.uid, 1)} disabled={index === items.length - 1} aria-label="Descer" className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => duplicate(item.uid)} aria-label="Duplicar" className="p-1 text-gray-300 hover:text-[#030A8C]"><Copy className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(item.uid)} aria-label="Remover" className="p-1 text-gray-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum serviço adicionado ainda.</p>
          )}
        </div>
      )}

      {/* ETAPA 3 */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data da proposta *</label>
              <input type="date" value={meta.issueDate} onChange={(e) => setMeta((m) => ({ ...m, issueDate: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Validade *</label>
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
              <input value={meta.paymentTerms} onChange={(e) => setMeta((m) => ({ ...m, paymentTerms: e.target.value }))} className="input" placeholder="Ex: Parcelado em 3x no cartão de crédito" />
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

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-900 mb-2">Serviços</p>
            <div className="space-y-1.5">
              {items.map((i) => (
                <div key={i.uid} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-gray-700 truncate">{i.name || 'Sem nome'}</span>
                  <span className="text-gray-900 font-medium shrink-0">
                    {i.periodicity === 'UNICO'
                      ? `${brl(toCents(i.setupValue))} único`
                      : `${brl(toCents(i.monthlyValue))}/mês × ${i.months}m`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Resumo financeiro fixo no mobile, inline no desktop */}
      <div className="fixed bottom-0 left-0 right-0 lg:static bg-white border-t lg:border border-gray-200 lg:rounded-xl p-3 lg:p-4 z-30 lg:z-auto">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-500">Mensal <b className="text-gray-900 block">{brl(totals.monthly)}</b></span>
            {totals.setup > 0 && <span className="text-gray-500">Único <b className="text-gray-900 block">{brl(totals.setup)}</b></span>}
            <span className="text-gray-500">Total <b className="text-[#030A8C] block">{brl(totals.total)}</b></span>
            {totals.months > 0 && <span className="text-gray-500 hidden sm:block">{totals.months} meses</span>}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar
              </button>
            )}
            {step < 2 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 0 ? !canAdvanceStep0 : items.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40 transition-colors"
              >
                Continuar <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={busy || items.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40 transition-colors"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Salvar rascunho
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
