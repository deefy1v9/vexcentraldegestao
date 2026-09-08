'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Pencil, Briefcase, CheckCircle2, Clock, XCircle, AlertCircle, PauseCircle, PlayCircle,
  History, X, AlertTriangle, Loader2,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import CurrencyInput from '@/components/ui/CurrencyInput'

/* ---------------------------------- tipos ---------------------------------- */

interface Payment {
  id: string
  status: string
  amount: number
  dueDate: string | Date
  year?: number
  month?: number
}

interface CatalogRef {
  id: string
  name: string
  category: string | null
  minCents: number | null
  maxCents: number | null
  billingType: string
}

interface Service {
  id: string
  catalogId?: string | null
  catalog?: CatalogRef | null
  serviceName: string
  customName?: string | null
  description?: string | null
  monthlyValue?: number | null
  priceCents?: number | null
  quantity?: number
  discountCents?: number
  contractType?: string
  competence?: string | null
  dueDay?: number | null
  dueRule?: string | null
  generateCharge?: boolean
  emitNfse?: boolean
  billingDescription?: string | null
  paymentType?: string | null
  contractDuration?: number | null
  firstPaymentDate?: string | Date | null
  totalContractValue?: number | null
  observations?: string | null
  startDate?: string | Date | null
  endDate?: string | Date | null
  pausedAt?: string | Date | null
  endedAt?: string | Date | null
  status: string
  payments?: Payment[]
  valueHistory?: Array<{ id: string; cents: number; effectiveFrom: string | Date; note: string | null; createdAt: string | Date }>
  statusHistory?: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; createdAt: string | Date }>
}

interface CatalogItem {
  id: string
  name: string
  category: string | null
  summary: string | null
  billingType: string
  minCents: number | null
  maxCents: number | null
  defaultCents: number | null
  isActive: boolean
}

const TYPE_LABEL: Record<string, string> = {
  RECORRENTE: 'Recorrente',
  AVULSO: 'Avulso',
  PROJETO: 'Projeto',
  QUANTIDADE: 'Por quantidade',
  PERSONALIZADO: 'Personalizado',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ATIVO: { label: 'Ativo', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  PAUSADO: { label: 'Pausado', color: 'bg-orange-100 text-orange-700', icon: PauseCircle },
  ENCERRADO: { label: 'Encerrado', color: 'bg-gray-100 text-gray-600', icon: AlertCircle },
  PENDENTE: { label: 'Pendente', color: 'bg-orange-100 text-orange-700', icon: Clock },
  CANCELADO: { label: 'Cancelado', color: 'bg-red-100 text-red-700', icon: XCircle },
  FINALIZADO: { label: 'Finalizado', color: 'bg-gray-100 text-gray-600', icon: AlertCircle },
}

const ORDINAL = ['', '1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º']
const vencimentoLabel = (dueDay?: number | null, rule?: string | null) => {
  if (!dueDay) return null
  return rule === 'DIA_UTIL' ? `${ORDINAL[dueDay] ?? `${dueDay}º`} dia útil` : `dia ${dueDay}`
}

const todayISO = () => new Date().toISOString().slice(0, 10)
const thisCompetence = () => todayISO().slice(0, 7)
const fmtCompetence = (c?: string | null) => (c ? c.split('-').reverse().join('/') : '')

function cents(s: Service): number {
  const base = s.priceCents ?? (s.monthlyValue != null ? Math.round(s.monthlyValue * 100) : 0)
  return Math.max(0, base * (s.quantity ?? 1) - (s.discountCents ?? 0))
}
function isRecurring(s: Service) {
  return (s.contractType ?? 'RECORRENTE') !== 'AVULSO'
}
function countsForMrr(s: Service) {
  const t = s.contractType ?? 'RECORRENTE'
  return t === 'RECORRENTE' || t === 'QUANTIDADE' || t === 'PERSONALIZADO'
}
function rangeText(c: { minCents: number | null; maxCents: number | null } | null | undefined) {
  if (!c) return null
  if (c.minCents != null && c.maxCents != null) return `${formatCurrency(c.minCents / 100)} a ${formatCurrency(c.maxCents / 100)}`
  if (c.minCents != null) return `a partir de ${formatCurrency(c.minCents / 100)}`
  if (c.maxCents != null) return `até ${formatCurrency(c.maxCents / 100)}`
  return null
}
function outOfRange(price: number | null, c: { minCents: number | null; maxCents: number | null } | null | undefined) {
  if (price == null || !c) return null
  if (c.minCents != null && price < c.minCents) return 'abaixo'
  if (c.maxCents != null && price > c.maxCents) return 'acima'
  return null
}

/* --------------------------------- painel --------------------------------- */

export default function ClientServicesPanel({
  clientId,
  initialServices,
  isAdmin = true,
}: {
  clientId: string
  initialServices: Service[]
  isAdmin?: boolean
}) {
  const router = useRouter()
  const [services, setServices] = useState<Service[]>(initialServices)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [history, setHistory] = useState<Service | null>(null)
  const [lifecycle, setLifecycle] = useState<{ service: Service; action: 'pausar' | 'reativar' | 'encerrar' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ATIVOS' | 'TODOS' | 'PAUSADO' | 'ENCERRADO'>('ATIVOS')
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null)

  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 3500)
    return () => clearTimeout(t)
  }, [feedback])

  // Catálogo só é carregado quando o admin abre a contratação
  useEffect(() => {
    if (!isAdmin || !showForm || catalog) return
    fetch('/api/servicos')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => setCatalog((b.catalog ?? []) as CatalogItem[]))
      .catch(() => setCatalog([]))
  }, [isAdmin, showForm, catalog])

  const comp = thisCompetence()
  const ticketCents = services.filter((s) => s.status === 'ATIVO' && countsForMrr(s)).reduce((sum, s) => sum + cents(s), 0)
  const recurringActive = services.filter((s) => s.status === 'ATIVO' && isRecurring(s)).length
  const avulsosMes = services.filter((s) => s.status === 'ATIVO' && !isRecurring(s) && s.competence === comp)
  const avulsoMesCents = avulsosMes.reduce((sum, s) => sum + cents(s), 0)

  const visible = useMemo(() => {
    const list = services.filter((s) => {
      if (filter === 'TODOS') return true
      if (filter === 'ATIVOS') return s.status === 'ATIVO'
      return s.status === filter
    })
    // Recorrentes ativos primeiro, depois avulsos por competência (mais recente), depois o resto
    return list.sort((a, b) => {
      const ra = isRecurring(a) ? 0 : 1
      const rb = isRecurring(b) ? 0 : 1
      if (ra !== rb) return ra - rb
      if (!isRecurring(a)) return (b.competence ?? '').localeCompare(a.competence ?? '')
      return (a.customName || a.serviceName).localeCompare(b.customName || b.serviceName, 'pt-BR')
    })
  }, [services, filter])

  function refreshOne(updated: Service) {
    setServices((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)))
    router.refresh()
  }

  async function deleteService(svc: Service) {
    if (!confirm(`Excluir "${svc.customName || svc.serviceName}"? Só é possível quando não há pagamento registrado; as parcelas pendentes são removidas.`)) return
    const res = await fetch(`/api/clientes/${clientId}/servicos?serviceId=${svc.id}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      setServices((prev) => prev.filter((s) => s.id !== svc.id))
      setFeedback('Serviço excluído.')
      router.refresh()
    } else {
      setError(body.error || 'Não foi possível excluir o serviço.')
    }
  }

  function paymentSummary(svc: Service) {
    if (!svc.payments || svc.payments.length === 0) return null
    const pago = svc.payments.filter((p) => p.status === 'PAGO').reduce((s, p) => s + p.amount, 0)
    const pendente = svc.payments.filter((p) => p.status === 'PENDENTE').length
    return { pago, pendente, total: svc.payments.length }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-[#030A8C]" />
          Serviços contratados
        </h2>
        {isAdmin && (
          <button onClick={() => { setShowForm(true); setError(null) }} className="flex items-center gap-1 text-sm text-[#030A8C] hover:underline font-medium">
            <Plus className="w-4 h-4" /> Contratar serviço
          </button>
        )}
      </div>

      {/* Indicadores — valores só para administradores */}
      {isAdmin ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 mt-2">
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Ticket recorrente</p>
            <p className="text-sm font-bold text-[#030A8C]">{formatCurrency(ticketCents / 100)}<span className="text-[10px] text-gray-400 font-normal">/mês</span></p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Recorrentes ativos</p>
            <p className="text-sm font-bold text-gray-900">{recurringActive}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Avulsos em {fmtCompetence(comp)}</p>
            <p className="text-sm font-bold text-gray-900">{avulsosMes.length} <span className="text-[10px] text-gray-400 font-normal">· {formatCurrency(avulsoMesCents / 100)}</span></p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Previsto no mês</p>
            <p className="text-sm font-bold text-gray-900">{formatCurrency((ticketCents + avulsoMesCents) / 100)}</p>
          </div>
        </div>
      ) : (
        <div className="mb-3" />
      )}

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {([['ATIVOS', 'Ativos'], ['PAUSADO', 'Pausados'], ['ENCERRADO', 'Encerrados'], ['TODOS', 'Todos']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${filter === k ? 'bg-[#030A8C] text-white border-[#030A8C]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#030A8C]'}`}>
            {l}
          </button>
        ))}
      </div>

      {feedback && <p className="text-xs font-medium text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-3">{feedback}</p>}
      {error && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {visible.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">
          {services.length === 0 ? 'Nenhum serviço contratado.' : 'Nenhum serviço neste filtro.'}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((svc) => {
            const statusCfg = STATUS_CONFIG[svc.status] || STATUS_CONFIG.ATIVO
            const StatusIcon = statusCfg.icon
            const summary = paymentSummary(svc)
            const recurring = isRecurring(svc)
            const type = svc.contractType ?? 'RECORRENTE'
            const range = outOfRange(svc.priceCents ?? null, svc.catalog)
            const hasPaid = (svc.payments ?? []).some((p) => p.status === 'PAGO')
            return (
              <div key={svc.id} className={`border rounded-lg p-4 ${svc.status === 'ATIVO' ? 'border-gray-200' : 'border-gray-100 bg-gray-50/60'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="bg-[#030A8C]/10 text-[#030A8C] text-sm px-3 py-1 rounded-lg font-medium">{svc.customName || svc.serviceName}</span>
                    {svc.customName && <span className="text-xs text-gray-400">{svc.serviceName}</span>}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${recurring ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {TYPE_LABEL[type] ?? type}{!recurring && svc.competence ? ` · ${fmtCompetence(svc.competence)}` : ''}
                    </span>
                    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.color}`}>
                      <StatusIcon className="w-3 h-3" /> {statusCfg.label}
                    </span>
                    {svc.catalog?.category && <span className="text-[10px] text-gray-400">{svc.catalog.category}</span>}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => setHistory(svc)} title="Histórico" className="p-1 text-gray-400 hover:text-[#030A8C] hover:bg-[#030A8C]/5 rounded"><History className="w-3.5 h-3.5" /></button>
                      {svc.status !== 'ENCERRADO' && (
                        <button onClick={() => { setEditing(svc); setError(null) }} title="Editar" className="p-1 text-gray-400 hover:text-[#030A8C] hover:bg-[#030A8C]/5 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                      )}
                      {svc.status === 'ATIVO' && recurring && (
                        <button onClick={() => setLifecycle({ service: svc, action: 'pausar' })} title="Pausar" className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded"><PauseCircle className="w-3.5 h-3.5" /></button>
                      )}
                      {svc.status === 'PAUSADO' && (
                        <button onClick={() => setLifecycle({ service: svc, action: 'reativar' })} title="Reativar" className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"><PlayCircle className="w-3.5 h-3.5" /></button>
                      )}
                      {(svc.status === 'ATIVO' || svc.status === 'PAUSADO') && (
                        <button onClick={() => setLifecycle({ service: svc, action: 'encerrar' })} title="Encerrar" className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><XCircle className="w-3.5 h-3.5" /></button>
                      )}
                      {!hasPaid && (
                        <button onClick={() => deleteService(svc)} title="Excluir (sem pagamentos)" className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  )}
                </div>

                {svc.description && <p className="text-xs text-gray-600 mb-2">{svc.description}</p>}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {isAdmin && (
                    <div>
                      <span className="text-gray-400">{recurring ? 'Valor mensal: ' : 'Valor: '}</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(cents(svc) / 100)}</span>
                      {(svc.quantity ?? 1) > 1 && <span className="text-gray-400"> ({svc.quantity}×)</span>}
                      {(svc.discountCents ?? 0) > 0 && <span className="text-gray-400"> −{formatCurrency((svc.discountCents ?? 0) / 100)}</span>}
                    </div>
                  )}
                  {svc.startDate && (
                    <div><span className="text-gray-400">Início: </span><span className="font-medium text-gray-700">{formatDate(svc.startDate)}</span></div>
                  )}
                  {svc.endDate && (
                    <div><span className="text-gray-400">{svc.status === 'ENCERRADO' ? 'Encerrado em: ' : 'Término: '}</span><span className="font-medium text-gray-700">{formatDate(svc.endDate)}</span></div>
                  )}
                  {svc.status === 'PAUSADO' && svc.pausedAt && (
                    <div><span className="text-gray-400">Pausado em: </span><span className="font-medium text-gray-700">{formatDate(svc.pausedAt)}</span></div>
                  )}
                  {svc.dueDay && (
                    <div><span className="text-gray-400">Vencimento: </span><span className="font-medium text-gray-700">{vencimentoLabel(svc.dueDay, svc.dueRule)}</span></div>
                  )}
                  {isAdmin && (
                    <div>
                      <span className="text-gray-400">Cobrança: </span>
                      <span className="font-medium text-gray-700">{svc.generateCharge === false ? 'manual' : 'automática'}{svc.emitNfse ? ' · NFS-e' : ''}</span>
                    </div>
                  )}
                </div>

                {isAdmin && range && svc.catalog && (
                  <p className="mt-2 text-[11px] text-orange-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Valor {range} da faixa sugerida ({rangeText(svc.catalog)}).
                  </p>
                )}

                {isAdmin && summary && (
                  <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-3 text-xs">
                    <span className="text-green-600 font-medium">{formatCurrency(summary.pago)} recebido</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-orange-600 font-medium">{summary.pendente} pendente{summary.pendente !== 1 ? 's' : ''}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400">{summary.total} parcela{summary.total !== 1 ? 's' : ''}</span>
                  </div>
                )}

                {svc.observations && <p className="mt-2 text-xs text-gray-500 italic">{svc.observations}</p>}
              </div>
            )
          })}
        </div>
      )}

      {showForm && isAdmin && (
        <ContractForm
          clientId={clientId}
          catalog={catalog}
          onClose={() => setShowForm(false)}
          onCreated={(svc, warnings) => {
            setServices((prev) => [...prev, svc])
            setShowForm(false)
            setFeedback(warnings.length ? `Serviço contratado. ${warnings.join(' ')}` : 'Serviço contratado.')
            router.refresh()
          }}
        />
      )}

      {editing && isAdmin && (
        <EditForm
          clientId={clientId}
          service={editing}
          onClose={() => setEditing(null)}
          onSaved={(svc, warnings) => {
            refreshOne(svc)
            setEditing(null)
            setFeedback(warnings.length ? `Serviço atualizado. ${warnings.join(' ')}` : 'Serviço atualizado.')
          }}
        />
      )}

      {lifecycle && isAdmin && (
        <LifecycleDialog
          clientId={clientId}
          service={lifecycle.service}
          action={lifecycle.action}
          onClose={() => setLifecycle(null)}
          onDone={(svc) => {
            refreshOne(svc)
            setLifecycle(null)
            setFeedback(lifecycle.action === 'pausar' ? 'Serviço pausado.' : lifecycle.action === 'reativar' ? 'Serviço reativado.' : 'Serviço encerrado.')
          }}
        />
      )}

      {history && isAdmin && <HistoryDrawer clientId={clientId} service={history} onClose={() => setHistory(null)} />}
    </div>
  )
}

/* ------------------------------ contratação ------------------------------ */

function ContractForm({ clientId, catalog, onClose, onCreated }: {
  clientId: string
  catalog: CatalogItem[] | null
  onClose: () => void
  onCreated: (svc: Service, warnings: string[]) => void
}) {
  const [catalogId, setCatalogId] = useState('')
  const [contractType, setContractType] = useState('RECORRENTE')
  const [price, setPrice] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [discount, setDiscount] = useState<number | null>(null)
  const [competence, setCompetence] = useState(thisCompetence())
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [dueRule, setDueRule] = useState('DIA_FIXO')
  const [generateCharge, setGenerateCharge] = useState(true)
  const [emitNfse, setEmitNfse] = useState(false)
  const [customName, setCustomName] = useState('')
  const [billingDescription, setBillingDescription] = useState('')
  const [observations, setObservations] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const item = catalog?.find((c) => c.id === catalogId) ?? null
  const active = (catalog ?? []).filter((c) => c.isActive)
  const byCategory = useMemo(() => {
    const m = new Map<string, CatalogItem[]>()
    for (const c of active) {
      const k = c.category || 'Sem categoria'
      m.set(k, [...(m.get(k) ?? []), c])
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
  }, [active])

  function pick(id: string) {
    setCatalogId(id)
    const c = catalog?.find((x) => x.id === id)
    if (c) {
      setContractType(c.billingType)
      setPrice(c.defaultCents != null ? c.defaultCents / 100 : (c.minCents != null ? c.minCents / 100 : null))
    }
  }

  const priceCents = price != null ? Math.round(price * 100) : null
  const range = outOfRange(priceCents, item)
  const qty = Math.max(1, Math.round(Number(quantity) || 1))
  const finalCents = priceCents != null ? Math.max(0, priceCents * (contractType === 'QUANTIDADE' ? qty : 1) - Math.round((discount ?? 0) * 100)) : 0
  const avulso = contractType === 'AVULSO'
  const mrr = contractType === 'RECORRENTE' || contractType === 'QUANTIDADE' || contractType === 'PERSONALIZADO'

  async function submit() {
    if (!catalogId || priceCents == null) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/clientes/${clientId}/servicos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogId, contractType, priceCents,
          quantity: contractType === 'QUANTIDADE' ? qty : 1,
          discountCents: discount != null ? Math.round(discount * 100) : 0,
          competence: avulso ? competence : undefined,
          startDate: avulso ? undefined : startDate,
          endDate: endDate || undefined,
          dueDay: dueDay || undefined,
          dueRule,
          generateCharge, emitNfse,
          customName: customName || undefined,
          billingDescription: billingDescription || undefined,
          observations: observations || undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível contratar.'); return }
      const { warnings, ...svc } = body
      onCreated(svc, warnings ?? [])
    } catch {
      setError('Falha de conexão. Tente de novo.')
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Contratar serviço" onClose={onClose}>
      <div className="space-y-3">
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Serviço do catálogo *</label>
          {catalog === null ? (
            <p className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Carregando catálogo…</p>
          ) : active.length === 0 ? (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">Nenhum serviço ativo no catálogo. Cadastre em Serviços antes de contratar.</p>
          ) : (
            <select value={catalogId} onChange={(e) => pick(e.target.value)} className="input text-sm">
              <option value="">Selecione…</option>
              {byCategory.map(([cat, items]) => (
                <optgroup key={cat} label={cat}>
                  {items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          )}
          {item?.summary && <p className="text-[11px] text-gray-500 mt-1">{item.summary}</p>}
          {item && rangeText(item) && <p className="text-[11px] text-gray-400 mt-0.5">Faixa sugerida: {rangeText(item)}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo de contratação *</label>
            <select value={contractType} onChange={(e) => setContractType(e.target.value)} className="input text-sm">
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {avulso ? `Entra só na competência ${fmtCompetence(competence)}; não altera ticket nem grupo.` : mrr ? 'Entra no ticket recorrente e na classificação do cliente.' : 'Previsto todo mês enquanto ativo; não entra no ticket recorrente.'}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{contractType === 'QUANTIDADE' ? 'Valor unitário *' : avulso ? 'Valor *' : 'Valor mensal negociado *'}</label>
            <CurrencyInput value={price} onChange={setPrice} className="input text-sm" ariaLabel="Valor negociado" />
            {range && <p className="text-[11px] text-orange-700 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Valor {range} da faixa do catálogo — permitido, fica registrado.</p>}
          </div>
          {contractType === 'QUANTIDADE' && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Quantidade</label>
              <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input text-sm" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Desconto (opcional)</label>
            <CurrencyInput value={discount} onChange={setDiscount} className="input text-sm" ariaLabel="Desconto" />
          </div>
          {avulso ? (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Competência *</label>
              <input type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} className="input text-sm" />
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Início</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Término (opcional)</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-sm" />
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Regra de vencimento</label>
            <select value={dueRule} onChange={(e) => setDueRule(e.target.value)} className="input text-sm">
              <option value="DIA_FIXO">Dia fixo do mês</option>
              <option value="DIA_UTIL">Enésimo dia útil</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{dueRule === 'DIA_UTIL' ? 'Vence no dia útil nº' : 'Dia de vencimento'}</label>
            <input type="number" min={1} max={dueRule === 'DIA_UTIL' ? 23 : 31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} className="input text-sm" placeholder={dueRule === 'DIA_UTIL' ? 'Ex: 5 para o 5º dia útil' : 'Padrão: dia de pagamento do cliente'} />
            {dueRule === 'DIA_UTIL' && <p className="text-[11px] text-gray-400 mt-1">Pula fim de semana e feriado nacional.</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nome customizado (opcional)</label>
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} className="input text-sm" placeholder={item?.name || 'Ex: Blog — GDV'} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição na cobrança (opcional)</label>
            <input value={billingDescription} onChange={(e) => setBillingDescription(e.target.value)} className="input text-sm" placeholder="Texto que aparece na fatura e na NFS-e" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-2"><input type="checkbox" checked={generateCharge} onChange={(e) => setGenerateCharge(e.target.checked)} /> Gerar cobrança</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={emitNfse} onChange={(e) => setEmitNfse(e.target.checked)} /> Emitir NFS-e</label>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Observações</label>
            <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={2} className="input text-sm resize-none" />
          </div>
        </div>

        {priceCents != null && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-[#030A8C]">
            <p className="font-semibold">{avulso ? `Receita avulsa de ${formatCurrency(finalCents / 100)} em ${fmtCompetence(competence)}` : `${formatCurrency(finalCents / 100)} por mês a partir de ${startDate ? formatDate(startDate) : 'hoje'}`}</p>
            <p className="mt-0.5 text-blue-700">{avulso ? 'Uma parcela; não entra no MRR nem na classificação.' : mrr ? 'Parcelas mensais previstas; entra no ticket recorrente.' : 'Parcelas mensais previstas; fora do ticket recorrente.'}</p>
          </div>
        )}
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
        <button onClick={submit} disabled={saving || !catalogId || priceCents == null || (avulso && !competence)} className="px-4 py-2 text-sm bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50 font-medium">
          {saving ? 'Salvando…' : 'Contratar'}
        </button>
      </div>
    </Modal>
  )
}

/* --------------------------------- edição --------------------------------- */

function EditForm({ clientId, service, onClose, onSaved }: {
  clientId: string
  service: Service
  onClose: () => void
  onSaved: (svc: Service, warnings: string[]) => void
}) {
  const recurring = isRecurring(service)
  const [price, setPrice] = useState<number | null>((service.priceCents ?? Math.round((service.monthlyValue ?? 0) * 100)) / 100)
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO())
  const [valueNote, setValueNote] = useState('')
  const [quantity, setQuantity] = useState(String(service.quantity ?? 1))
  const [discount, setDiscount] = useState<number | null>((service.discountCents ?? 0) > 0 ? (service.discountCents ?? 0) / 100 : null)
  const [competence, setCompetence] = useState(service.competence ?? thisCompetence())
  const [endDate, setEndDate] = useState(service.endDate ? new Date(service.endDate).toISOString().slice(0, 10) : '')
  const [dueDay, setDueDay] = useState(service.dueDay ? String(service.dueDay) : '')
  const [dueRule, setDueRule] = useState(service.dueRule ?? 'DIA_FIXO')
  const [generateCharge, setGenerateCharge] = useState(service.generateCharge !== false)
  const [emitNfse, setEmitNfse] = useState(!!service.emitNfse)
  const [customName, setCustomName] = useState(service.customName ?? '')
  const [description, setDescription] = useState(service.description ?? '')
  const [billingDescription, setBillingDescription] = useState(service.billingDescription ?? '')
  const [observations, setObservations] = useState(service.observations ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const priceCents = price != null ? Math.round(price * 100) : null
  const originalCents = service.priceCents ?? Math.round((service.monthlyValue ?? 0) * 100)
  const priceChanged = priceCents != null && priceCents !== originalCents
  const range = outOfRange(priceCents, service.catalog)

  async function submit() {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/clientes/${clientId}/servicos`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          ...(priceChanged ? { priceCents, effectiveFrom, valueNote: valueNote || undefined } : {}),
          quantity: service.contractType === 'QUANTIDADE' ? Math.max(1, Math.round(Number(quantity) || 1)) : undefined,
          discountCents: discount != null ? Math.round(discount * 100) : 0,
          ...(recurring ? { endDate: endDate || null } : { competence }),
          dueDay: dueDay || null,
          dueRule,
          generateCharge, emitNfse,
          customName: customName || null,
          description: description || null,
          billingDescription: billingDescription || null,
          observations: observations || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível atualizar.'); return }
      const { warnings, repriced, ...svc } = body
      const w: string[] = [...(warnings ?? [])]
      if (repriced) w.push(`${repriced} parcela(s) pendente(s) reajustada(s).`)
      onSaved(svc, w)
    } catch {
      setError('Falha de conexão. Tente de novo.')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Editar — ${service.customName || service.serviceName}`} onClose={onClose}>
      <div className="space-y-3">
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{recurring ? 'Valor mensal' : 'Valor'}</label>
            <CurrencyInput value={price} onChange={setPrice} className="input text-sm" ariaLabel="Valor" />
            {range && <p className="text-[11px] text-orange-700 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Valor {range} da faixa ({rangeText(service.catalog)}).</p>}
          </div>
          {priceChanged && recurring && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Novo valor vale a partir de</label>
              <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="input text-sm" />
              <p className="text-[11px] text-gray-400 mt-1">Parcelas pagas não mudam; pendentes a partir dessa competência são reajustadas.</p>
            </div>
          )}
          {priceChanged && (
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Motivo da alteração (opcional)</label>
              <input value={valueNote} onChange={(e) => setValueNote(e.target.value)} className="input text-sm" placeholder="Ex: reajuste anual" />
            </div>
          )}
          {service.contractType === 'QUANTIDADE' && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Quantidade</label>
              <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input text-sm" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Desconto</label>
            <CurrencyInput value={discount} onChange={setDiscount} className="input text-sm" ariaLabel="Desconto" />
          </div>
          {recurring ? (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Término (opcional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-sm" />
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Competência</label>
              <input type="month" value={competence} onChange={(e) => setCompetence(e.target.value)} className="input text-sm" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Regra de vencimento</label>
            <select value={dueRule} onChange={(e) => setDueRule(e.target.value)} className="input text-sm">
              <option value="DIA_FIXO">Dia fixo do mês</option>
              <option value="DIA_UTIL">Enésimo dia útil</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{dueRule === 'DIA_UTIL' ? 'Vence no dia útil nº' : 'Dia de vencimento'}</label>
            <input type="number" min={1} max={dueRule === 'DIA_UTIL' ? 23 : 31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} className="input text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nome customizado</label>
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} className="input text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input text-sm resize-none" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição na cobrança</label>
            <input value={billingDescription} onChange={(e) => setBillingDescription(e.target.value)} className="input text-sm" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-2"><input type="checkbox" checked={generateCharge} onChange={(e) => setGenerateCharge(e.target.checked)} /> Gerar cobrança</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={emitNfse} onChange={(e) => setEmitNfse(e.target.checked)} /> Emitir NFS-e</label>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Observações</label>
            <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={2} className="input text-sm resize-none" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
        <button onClick={submit} disabled={saving || priceCents == null} className="px-4 py-2 text-sm bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50 font-medium">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  )
}

/* ------------------------------ ciclo de vida ------------------------------ */

function LifecycleDialog({ clientId, service, action, onClose, onDone }: {
  clientId: string
  service: Service
  action: 'pausar' | 'reativar' | 'encerrar'
  onClose: () => void
  onDone: (svc: Service) => void
}) {
  const [date, setDate] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titles = { pausar: 'Pausar serviço', reativar: 'Reativar serviço', encerrar: 'Encerrar serviço' }
  const hints = {
    pausar: 'Sai do ticket recorrente e para de gerar parcelas a partir da competência da data. O que já foi pago fica.',
    reativar: 'Volta ao ticket recorrente e retoma a geração de parcelas.',
    encerrar: 'Encerramento definitivo: sai do ticket, para as parcelas futuras e mantém todo o histórico.',
  }

  async function submit() {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/clientes/${clientId}/servicos/${service.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, date, reason: reason || undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível concluir.'); return }
      onDone(body)
    } catch {
      setError('Falha de conexão. Tente de novo.')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`${titles[action]} — ${service.customName || service.serviceName}`} onClose={onClose} narrow>
      <p className="text-xs text-gray-600 mb-3">{hints[action]}</p>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Motivo (opcional)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input text-sm" />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
        <button onClick={submit} disabled={saving} className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 font-medium ${action === 'encerrar' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#030A8C] hover:bg-[#02077a]'}`}>
          {saving ? 'Salvando…' : titles[action]}
        </button>
      </div>
    </Modal>
  )
}

/* -------------------------------- histórico -------------------------------- */

function HistoryDrawer({ clientId, service, onClose }: { clientId: string; service: Service; onClose: () => void }) {
  const [data, setData] = useState<Service | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/clientes/${clientId}/servicos/${service.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => setData(b.service))
      .catch(() => setError('Não foi possível carregar o histórico.'))
  }, [clientId, service.id])

  const STATUS_PT: Record<string, string> = { ATIVO: 'Ativo', PAUSADO: 'Pausado', ENCERRADO: 'Encerrado' }

  return (
    <Modal title={`Histórico — ${service.customName || service.serviceName}`} onClose={onClose}>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!data && !error && <p className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Carregando…</p>}
      {data && (
        <div className="space-y-4 text-xs">
          <div>
            <p className="font-bold text-gray-900 mb-1.5">Valores</p>
            {(data.valueHistory ?? []).length === 0 ? <p className="text-gray-400">Sem alterações registradas.</p> : (
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {(data.valueHistory ?? []).map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-gray-600">vigência {formatDate(h.effectiveFrom)}{h.note ? ` · ${h.note}` : ''}</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(h.cents / 100)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="font-bold text-gray-900 mb-1.5">Status</p>
            {(data.statusHistory ?? []).length === 0 ? <p className="text-gray-400">Sem alterações registradas.</p> : (
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {(data.statusHistory ?? []).map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-gray-600">{formatDate(h.createdAt)}{h.reason ? ` · ${h.reason}` : ''}</span>
                    <span className="font-semibold text-gray-900">{h.fromStatus ? `${STATUS_PT[h.fromStatus] ?? h.fromStatus} → ` : ''}{STATUS_PT[h.toStatus] ?? h.toStatus}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="font-bold text-gray-900 mb-1.5">Parcelas</p>
            {(data.payments ?? []).length === 0 ? <p className="text-gray-400">Nenhuma parcela.</p> : (
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg max-h-64 overflow-y-auto">
                {(data.payments ?? []).map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-gray-600">{String(p.month).padStart(2, '0')}/{p.year} · vence {formatDate(p.dueDate)}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{formatCurrency(p.amount)}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.status === 'PAGO' ? 'bg-green-100 text-green-700' : p.status === 'CANCELADO' ? 'bg-gray-100 text-gray-500' : 'bg-orange-100 text-orange-700'}`}>{p.status}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ---------------------------------- modal ---------------------------------- */

function Modal({ title, onClose, children, narrow }: { title: string; onClose: () => void; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div className={`bg-white w-full ${narrow ? 'sm:max-w-md' : 'sm:max-w-2xl'} rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900 text-sm truncate pr-2">{title}</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg shrink-0"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}
