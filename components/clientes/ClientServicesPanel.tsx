'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pencil, Briefcase, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import CurrencyInput from '@/components/ui/CurrencyInput'

interface Payment {
  id: string
  status: string
  amount: number
  dueDate: string | Date
}

interface Service {
  id: string
  serviceName: string
  customName?: string | null
  description?: string | null
  monthlyValue?: number | null
  paymentType?: string | null
  contractDuration?: number | null
  firstPaymentDate?: string | Date | null
  totalContractValue?: number | null
  observations?: string | null
  startDate?: string | Date | null
  status: string
  payments?: Payment[]
}

const SERVICE_OPTIONS = [
  'SEO', 'Social Media', 'Blog', 'Google Ads', 'Meta Ads',
  'Email Marketing', 'Design', 'Vídeo', 'Site', 'E-commerce',
  'Consultoria', 'Gestão de Tráfego', 'Outro',
]

const PAYMENT_TYPES = ['Mensal', 'Recorrente', 'Parcelado', 'Único', 'Outro']

const DURATION_CHIPS = [
  { label: '1 mês', value: 1 },
  { label: '3 meses', value: 3 },
  { label: '6 meses', value: 6 },
  { label: '12 meses (1 ano)', value: 12 },
  { label: '24 meses (2 anos)', value: 24 },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ATIVO: { label: 'Ativo', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  PENDENTE: { label: 'Pendente', color: 'bg-orange-100 text-orange-700', icon: Clock },
  CANCELADO: { label: 'Cancelado', color: 'bg-red-100 text-red-700', icon: XCircle },
  FINALIZADO: { label: 'Finalizado', color: 'bg-gray-100 text-gray-600', icon: AlertCircle },
}

function getBoletoCount(paymentType: string, contractDuration: number) {
  return paymentType === 'Único' ? 1 : contractDuration
}

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
  const [services, setServices] = useState(initialServices)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [customDuration, setCustomDuration] = useState('')
  const [form, setForm] = useState({
    serviceName: '',
    customName: '',
    description: '',
    monthlyValue: null as number | null,
    paymentType: 'Mensal',
    contractDuration: '12',
    startDate: new Date().toISOString().split('T')[0],
    firstPaymentDate: new Date().toISOString().split('T')[0],
    observations: '',
  })

  // Edição inline de um serviço existente
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    serviceName: '',
    customName: '',
    description: '',
    monthlyValue: null as number | null,
    observations: '',
  })

  const duracao = Number(form.contractDuration) || 0
  const valor = form.monthlyValue ?? 0

  // Total mensal: soma dos serviços ativos — espelha o valor total do cliente
  const totalMensal = services
    .filter((s) => s.status === 'ATIVO')
    .reduce((sum, s) => sum + (s.monthlyValue ?? 0), 0)

  function flash(msg: string) {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 3000)
  }
  const totalContractValue = valor > 0 && duracao > 0 ? valor * duracao : 0
  const boletoCount = duracao > 0 ? getBoletoCount(form.paymentType, duracao) : 0

  function resetForm() {
    setForm({
      serviceName: '',
      customName: '',
      description: '',
      monthlyValue: null,
      paymentType: 'Mensal',
      contractDuration: '12',
      startDate: new Date().toISOString().split('T')[0],
      firstPaymentDate: new Date().toISOString().split('T')[0],
      observations: '',
    })
    setCustomDuration('')
    setError(null)
  }

  async function addService() {
    if (!form.serviceName || form.monthlyValue == null || !form.contractDuration) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clientes/${clientId}/servicos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          monthlyValue: valor,
          contractDuration: duracao,
          totalContractValue,
        }),
      })
      if (res.ok) {
        const svc = await res.json()
        setServices((prev) => [...prev, svc])
        setShowForm(false)
        resetForm()
        flash('Serviço adicionado.')
        router.refresh() // ressincroniza o valor total mensal do cliente
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Não foi possível salvar o serviço.')
      }
    } catch {
      setError('Falha de conexão. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(svc: Service) {
    setEditingId(svc.id)
    setEditForm({
      serviceName: svc.serviceName,
      customName: svc.customName || '',
      description: svc.description || '',
      monthlyValue: svc.monthlyValue ?? null,
      observations: svc.observations || '',
    })
    setError(null)
  }

  async function saveEdit() {
    if (!editingId || !editForm.serviceName.trim()) return
    setEditSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clientes/${clientId}/servicos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: editingId, ...editForm }),
      })
      if (res.ok) {
        const updated = await res.json()
        setServices((prev) => prev.map((s) => (s.id === editingId ? { ...s, ...updated } : s)))
        setEditingId(null)
        flash('Serviço atualizado.')
        router.refresh()
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Não foi possível atualizar o serviço.')
      }
    } catch {
      setError('Falha de conexão. Tente de novo.')
    } finally {
      setEditSaving(false)
    }
  }

  async function deleteService(id: string) {
    if (!confirm('Remover este serviço? Os pagamentos pendentes também serão removidos.')) return
    const res = await fetch(`/api/clientes/${clientId}/servicos?serviceId=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setServices((prev) => prev.filter((s) => s.id !== id))
      flash('Serviço removido.')
      router.refresh()
    } else {
      setError('Não foi possível remover o serviço.')
    }
  }

  function getPaymentSummary(svc: Service) {
    if (!svc.payments) return null
    const pago = svc.payments.filter((p) => p.status === 'PAGO').reduce((s, p) => s + p.amount, 0)
    const pendente = svc.payments.filter((p) => p.status === 'PENDENTE').length
    const total = svc.payments.length
    return { pago, pendente, total }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-[#030A8C]" />
          Serviços Contratados
        </h2>
        {isAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 text-sm text-[#030A8C] hover:underline font-medium"
          >
            <Plus className="w-4 h-4" />
            Adicionar serviço
          </button>
        )}
      </div>

      {/* Total mensal — valores são exclusivos de administradores */}
      {isAdmin ? (
        <p className="text-xs text-gray-500 mb-4">
          Total mensal dos serviços:{' '}
          <span className="font-bold text-[#030A8C]">{formatCurrency(totalMensal)}</span>
        </p>
      ) : (
        <div className="mb-4" />
      )}

      {feedback && (
        <p className="text-xs font-medium text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-3">
          {feedback}
        </p>
      )}
      {error && !showForm && !editingId && (
        <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {showForm && isAdmin && (
        <div className="bg-gray-50 rounded-lg p-5 mb-4 space-y-4 border border-gray-200">
          <h3 className="font-semibold text-gray-800 text-sm">Adicionar serviço</h3>

          <div className="grid grid-cols-2 gap-3">
            {/* Serviço */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Serviço *</label>
              <select
                value={form.serviceName}
                onChange={(e) => setForm((p) => ({ ...p, serviceName: e.target.value }))}
                className="input text-sm"
              >
                <option value="">Selecione...</option>
                {SERVICE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {/* Nome customizado */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Nome customizado (opcional)</label>
              <input
                value={form.customName}
                onChange={(e) => setForm((p) => ({ ...p, customName: e.target.value }))}
                className="input text-sm"
                placeholder={form.serviceName || 'Ex: BLOG — GDV'}
              />
            </div>
            {/* Valor mensal */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Valor mensal *</label>
              <CurrencyInput
                value={form.monthlyValue}
                onChange={(v) => setForm((p) => ({ ...p, monthlyValue: v }))}
                className="input text-sm"
                ariaLabel="Valor mensal do serviço"
              />
            </div>
            {/* Tipo de pagamento */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo de pagamento</label>
              <select
                value={form.paymentType}
                onChange={(e) => setForm((p) => ({ ...p, paymentType: e.target.value }))}
                className="input text-sm"
              >
                {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Duração do contrato — chips */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Duração do contrato *</label>
            <div className="flex flex-wrap gap-2">
              {DURATION_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => { setForm((p) => ({ ...p, contractDuration: String(chip.value) })); setCustomDuration('') }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    Number(form.contractDuration) === chip.value && !customDuration
                      ? 'bg-[#030A8C] text-white border-[#030A8C]'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#030A8C] hover:text-[#030A8C]'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomDuration(customDuration ? '' : (form.contractDuration || ''))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  customDuration
                    ? 'bg-[#030A8C] text-white border-[#030A8C]'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-[#030A8C] hover:text-[#030A8C]'
                }`}
              >
                Outro...
              </button>
            </div>
            {customDuration !== '' && (
              <input
                type="number"
                min="1"
                value={form.contractDuration}
                onChange={(e) => { setForm((p) => ({ ...p, contractDuration: e.target.value })); setCustomDuration(e.target.value) }}
                className="input text-sm mt-2 max-w-[160px]"
                placeholder="Meses"
                autoFocus
              />
            )}
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Data de início</label>
              <input type="date" value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                className="input text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Primeiro pagamento</label>
              <input type="date" value={form.firstPaymentDate}
                onChange={(e) => setForm((p) => ({ ...p, firstPaymentDate: e.target.value }))}
                className="input text-sm" />
            </div>
          </div>

          {/* Preview boletos */}
          {boletoCount > 0 && valor > 0 && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[#030A8C]">
                  {boletoCount} {boletoCount === 1 ? 'boleto será gerado' : 'boletos serão gerados'} automaticamente
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Total do contrato: {formatCurrency(totalContractValue)}
                </p>
              </div>
              <span className="text-3xl font-black text-[#030A8C]">{boletoCount}</span>
            </div>
          )}

          {/* Descrição */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição do serviço</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="input text-sm resize-none"
              rows={2}
              placeholder="Ex: Planejamento, criação, acompanhamento e otimização das campanhas."
            />
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Observações</label>
            <textarea
              value={form.observations}
              onChange={(e) => setForm((p) => ({ ...p, observations: e.target.value }))}
              className="input text-sm resize-none"
              rows={2}
              placeholder="Informações adicionais..."
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => { setShowForm(false); resetForm() }}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={addService}
              disabled={!form.serviceName || form.monthlyValue == null || !form.contractDuration || saving}
              className="px-4 py-2 text-sm bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] transition-colors disabled:opacity-50 font-medium"
            >
              {saving
                ? 'Salvando...'
                : boletoCount > 0
                  ? `Adicionar e gerar ${boletoCount} ${boletoCount === 1 ? 'boleto' : 'boletos'}`
                  : 'Adicionar serviço'}
            </button>
          </div>
        </div>
      )}

      {services.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">Nenhum serviço contratado cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {services.map((svc) => {
            const statusCfg = STATUS_CONFIG[svc.status] || STATUS_CONFIG.ATIVO
            const StatusIcon = statusCfg.icon
            const summary = getPaymentSummary(svc)

            return (
              <div key={svc.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-[#030A8C]/10 text-[#030A8C] text-sm px-3 py-1 rounded-lg font-medium">
                      {svc.customName || svc.serviceName}
                    </span>
                    {svc.customName && (
                      <span className="text-xs text-gray-400">{svc.serviceName}</span>
                    )}
                    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusCfg.label}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => (editingId === svc.id ? setEditingId(null) : startEdit(svc))}
                        title="Editar serviço"
                        className="p-1 text-gray-400 hover:text-[#030A8C] hover:bg-[#030A8C]/5 rounded transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteService(svc.id)}
                        title="Remover serviço"
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Edição inline */}
                {editingId === svc.id && isAdmin && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Nome do serviço *</label>
                        <input
                          value={editForm.serviceName}
                          onChange={(e) => setEditForm((p) => ({ ...p, serviceName: e.target.value }))}
                          className="input text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Nome customizado</label>
                        <input
                          value={editForm.customName}
                          onChange={(e) => setEditForm((p) => ({ ...p, customName: e.target.value }))}
                          className="input text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Valor mensal</label>
                        <CurrencyInput
                          value={editForm.monthlyValue}
                          onChange={(v) => setEditForm((p) => ({ ...p, monthlyValue: v }))}
                          className="input text-sm"
                          ariaLabel="Valor mensal do serviço"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Observações</label>
                        <input
                          value={editForm.observations}
                          onChange={(e) => setEditForm((p) => ({ ...p, observations: e.target.value }))}
                          className="input text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição</label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                        className="input text-sm resize-none"
                        rows={2}
                      />
                    </div>
                    {error && (
                      <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        {error}
                      </p>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setEditingId(null); setError(null) }}
                        className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={!editForm.serviceName.trim() || editSaving}
                        className="px-3 py-1.5 text-xs bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] transition-colors disabled:opacity-50 font-medium"
                      >
                        {editSaving ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                )}

                {svc.description && (
                  <p className="text-xs text-gray-600 mb-2">{svc.description}</p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {isAdmin && svc.monthlyValue != null && (
                    <div>
                      <span className="text-gray-400">Valor mensal: </span>
                      <span className="font-semibold text-gray-900">{formatCurrency(svc.monthlyValue)}</span>
                    </div>
                  )}
                  {svc.contractDuration != null && (
                    <div>
                      <span className="text-gray-400">Duração: </span>
                      <span className="font-medium text-gray-700">{svc.contractDuration} meses</span>
                    </div>
                  )}
                  {svc.paymentType && (
                    <div>
                      <span className="text-gray-400">Pagamento: </span>
                      <span className="font-medium text-gray-700">{svc.paymentType}</span>
                    </div>
                  )}
                  {isAdmin && svc.totalContractValue != null && (
                    <div>
                      <span className="text-gray-400">Total: </span>
                      <span className="font-semibold text-[#030A8C]">{formatCurrency(svc.totalContractValue)}</span>
                    </div>
                  )}
                  {svc.startDate && (
                    <div>
                      <span className="text-gray-400">Início: </span>
                      <span className="font-medium text-gray-700">{formatDate(svc.startDate)}</span>
                    </div>
                  )}
                  {svc.firstPaymentDate && (
                    <div>
                      <span className="text-gray-400">1º pagto: </span>
                      <span className="font-medium text-gray-700">{formatDate(svc.firstPaymentDate)}</span>
                    </div>
                  )}
                </div>

                {/* Resumo de pagamentos — só administradores */}
                {isAdmin && summary && summary.total > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-3 text-xs">
                    <span className="text-green-600 font-medium">
                      {formatCurrency(summary.pago)} recebido
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-orange-600 font-medium">
                      {summary.pendente} pendente{summary.pendente !== 1 ? 's' : ''}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400">{summary.total} boleto{summary.total !== 1 ? 's' : ''} no total</span>
                  </div>
                )}

                {svc.observations && (
                  <p className="mt-2 text-xs text-gray-500 italic">{svc.observations}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
