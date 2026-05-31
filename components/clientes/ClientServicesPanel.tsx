'use client'
import { useState } from 'react'
import { Plus, Trash2, Briefcase } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

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
}

const SERVICE_OPTIONS = [
  'SEO',
  'Social Media',
  'Blog',
  'Google Ads',
  'Meta Ads',
  'Email Marketing',
  'Design',
  'Vídeo',
  'Site',
  'E-commerce',
  'Consultoria',
  'Gestão de Tráfego',
  'Outro',
]

const PAYMENT_TYPES = ['Mensal', 'Trimestral', 'Semestral', 'Anual']

export default function ClientServicesPanel({
  clientId,
  initialServices,
}: {
  clientId: string
  initialServices: Service[]
}) {
  const [services, setServices] = useState(initialServices)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    serviceName: '',
    customName: '',
    monthlyValue: '',
    paymentType: 'Mensal',
    contractDuration: '',
    startDate: '',
    firstPaymentDate: '',
    observations: '',
  })

  const totalContractValue =
    form.monthlyValue && form.contractDuration
      ? Number(form.monthlyValue) * Number(form.contractDuration)
      : 0

  function resetForm() {
    setForm({
      serviceName: '',
      customName: '',
      monthlyValue: '',
      paymentType: 'Mensal',
      contractDuration: '',
      startDate: '',
      firstPaymentDate: '',
      observations: '',
    })
  }

  async function addService() {
    if (!form.serviceName || !form.monthlyValue || !form.contractDuration) return
    setSaving(true)
    const res = await fetch(`/api/clientes/${clientId}/servicos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        monthlyValue: Number(form.monthlyValue),
        contractDuration: Number(form.contractDuration),
        totalContractValue,
      }),
    })
    if (res.ok) {
      const svc = await res.json()
      setServices((prev) => [...prev, svc])
      setShowForm(false)
      resetForm()
    }
    setSaving(false)
  }

  async function deleteService(id: string) {
    if (!confirm('Remover este serviço?')) return
    const res = await fetch(`/api/clientes/${clientId}/servicos?serviceId=${id}`, {
      method: 'DELETE',
    })
    if (res.ok) setServices((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-[#030A8C]" />
          Serviços Contratados
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-sm text-[#030A8C] hover:underline font-medium"
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Serviço *</label>
              <select
                value={form.serviceName}
                onChange={(e) => setForm((p) => ({ ...p, serviceName: e.target.value }))}
                className="input text-sm"
              >
                <option value="">Selecione...</option>
                {SERVICE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Nome customizado</label>
              <input
                value={form.customName}
                onChange={(e) => setForm((p) => ({ ...p, customName: e.target.value }))}
                className="input text-sm"
                placeholder="Ex: BLOG — GDV"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Valor mensal (R$) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyValue}
                onChange={(e) => setForm((p) => ({ ...p, monthlyValue: e.target.value }))}
                className="input text-sm"
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo de pagamento</label>
              <select
                value={form.paymentType}
                onChange={(e) => setForm((p) => ({ ...p, paymentType: e.target.value }))}
                className="input text-sm"
              >
                {PAYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Duração do contrato (meses) *
              </label>
              <input
                type="number"
                min="1"
                value={form.contractDuration}
                onChange={(e) => setForm((p) => ({ ...p, contractDuration: e.target.value }))}
                className="input text-sm"
                placeholder="12"
              />
            </div>
            <div>
              {totalContractValue > 0 ? (
                <div className="flex flex-col justify-end h-full pb-0.5">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Total do contrato</label>
                  <p className="text-sm font-bold text-[#030A8C]">{formatCurrency(totalContractValue)}</p>
                  <p className="text-xs text-gray-400">{form.contractDuration} parcelas</p>
                </div>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Data de início</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                className="input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Primeiro pagamento</label>
              <input
                type="date"
                value={form.firstPaymentDate}
                onChange={(e) => setForm((p) => ({ ...p, firstPaymentDate: e.target.value }))}
                className="input text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Observações</label>
              <input
                value={form.observations}
                onChange={(e) => setForm((p) => ({ ...p, observations: e.target.value }))}
                className="input text-sm"
                placeholder="Informações adicionais..."
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); resetForm() }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={addService}
              disabled={!form.serviceName || !form.monthlyValue || !form.contractDuration || saving}
              className="px-3 py-1.5 text-sm bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {services.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum serviço cadastrado</p>
      ) : (
        <div className="space-y-3">
          {services.map((svc) => (
            <div key={svc.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-[#030A8C]/10 text-[#030A8C] text-sm px-3 py-1 rounded-lg font-medium">
                    {svc.customName || svc.serviceName}
                  </span>
                  {svc.customName && (
                    <span className="text-xs text-gray-400">{svc.serviceName}</span>
                  )}
                </div>
                <button
                  onClick={() => deleteService(svc.id)}
                  className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {svc.monthlyValue != null && (
                  <div>
                    <span className="text-gray-400">Valor mensal: </span>
                    <span className="font-semibold text-gray-900">{formatCurrency(svc.monthlyValue)}</span>
                  </div>
                )}
                {svc.contractDuration && (
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
                {svc.totalContractValue != null && (
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
                {svc.observations && (
                  <div className="col-span-2 sm:col-span-3 text-gray-500 italic mt-1">
                    {svc.observations}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
