'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import CurrencyInput from '@/components/ui/CurrencyInput'
import ClientBillingSection, { BillingForm, EMPTY_BILLING } from '@/components/clientes/ClientBillingSection'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft, Save, Trash2, Plus } from 'lucide-react'

interface ServiceForm {
  id: string | null
  serviceName: string
  description: string
  monthlyValue: number | null
}

interface Client {
  id: string
  name: string
  cnpj?: string | null
  email?: string | null
  phone?: string | null
  niche?: string | null
  status: string
  contractStart?: string | null
  contractEnd?: string | null
  contractMonths?: number | null
  monthlyValue?: number | null
  paymentDay?: number | null
  notes?: string | null
  tier?: string | null
  tierManual?: boolean
  services: { id: string; serviceName: string; description?: string | null; monthlyValue?: number | null }[]
}

export default function EditClientePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [services, setServices] = useState<ServiceForm[]>([])
  const [form, setForm] = useState({
    name: '',
    cnpj: '',
    email: '',
    phone: '',
    niche: '',
    status: 'ATIVO',
    contractStart: '',
    contractEnd: '',
    contractMonths: '',
    paymentDay: '',
    notes: '',
    tier: 'AUTO',
  })

  // Valor total mensal: soma automática dos serviços, somente leitura
  const totalMensal = services.reduce((sum, s) => sum + (s.monthlyValue ?? 0), 0)

  // Faturamento e NFS-e
  const [billing, setBilling] = useState<BillingForm>({ ...EMPTY_BILLING })
  const [asaasInfo, setAsaasInfo] = useState<{ customerId: string | null; syncStatus: string | null; syncError: string | null; syncedAt: string | null }>({
    customerId: null, syncStatus: null, syncError: null, syncedAt: null,
  })
  function setBillingField<K extends keyof BillingForm>(field: K, value: BillingForm[K]) {
    setBilling((prev) => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    fetch(`/api/clientes/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data: Client) => {
        setClient(data)
        setForm({
          name: data.name || '',
          cnpj: data.cnpj || '',
          email: data.email || '',
          phone: data.phone || '',
          niche: data.niche || '',
          status: data.status || 'ATIVO',
          contractStart: data.contractStart ? data.contractStart.split('T')[0] : '',
          contractEnd: data.contractEnd ? data.contractEnd.split('T')[0] : '',
          contractMonths: data.contractMonths?.toString() || '',
          paymentDay: data.paymentDay?.toString() || '',
          notes: data.notes || '',
          tier: data.tierManual && data.tier ? data.tier : 'AUTO',
        })
        setServices(data.services.map((s) => ({
          id: s.id,
          serviceName: s.serviceName,
          description: s.description || '',
          monthlyValue: s.monthlyValue ?? null,
        })))
        const d = data as unknown as Record<string, unknown>
        setBilling({
          billingEnabled: !!d.billingEnabled,
          legalName: (d.legalName as string) || '',
          municipalReg: (d.municipalReg as string) || '',
          billingEmail: (d.billingEmail as string) || '',
          extraEmails: (d.extraEmails as string) || '',
          zipCode: (d.zipCode as string) || '',
          street: (d.street as string) || '',
          addressNumber: (d.addressNumber as string) || '',
          complement: (d.complement as string) || '',
          district: (d.district as string) || '',
          city: (d.city as string) || '',
          state: (d.state as string) || '',
          ibgeCode: (d.ibgeCode as string) || '',
          billingLeadDays: String(d.billingLeadDays ?? 10),
          billingType: (d.billingType as string) || 'UNDEFINED',
          nfseEnabled: !!d.nfseEnabled,
          nfseRule: (d.nfseRule as string) || 'ON_CONFIRMED',
          fiscalDescription: (d.fiscalDescription as string) || '',
        })
        setAsaasInfo({
          customerId: (d.asaasCustomerId as string) || null,
          syncStatus: (d.asaasSyncStatus as string) || null,
          syncError: (d.asaasSyncError as string) || null,
          syncedAt: (d.asaasSyncedAt as string) || null,
        })
        setLoading(false)
      })
      .catch(() => {
        setError('Não foi possível carregar o cliente.')
        setLoading(false)
      })
  }, [id])

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function addService() {
    setServices((prev) => [...prev, { id: null, serviceName: '', description: '', monthlyValue: null }])
  }

  function removeService(i: number) {
    setServices((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateService<K extends keyof ServiceForm>(i: number, field: K, value: ServiceForm[K]) {
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/clientes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...billing,
          billingLeadDays: Number(billing.billingLeadDays) || 10,
          contractMonths: form.contractMonths ? Number(form.contractMonths) : null,
          paymentDay: form.paymentDay ? Number(form.paymentDay) : null,
          services: services.filter((s) => s.serviceName.trim()),
        }),
      })

      if (res.ok) {
        router.push(`/clientes/${id}`)
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Erro ao salvar. Verifique os campos e tente de novo.')
        setSaving(false)
      }
    } catch {
      setError('Falha de conexão. Tente de novo.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir o cliente "${client?.name}"? Esta ação não pode ser desfeita.`)) return
    const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/clientes')
    else alert('Erro ao excluir')
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Header title="Carregando..." />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#030A8C] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!client) return null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title={`Editar — ${client.name}`} subtitle={client.niche || 'Cliente'} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl">
          <Link href={`/clientes/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6">
            <ArrowLeft className="w-4 h-4" /> Voltar para o cliente
          </Link>

          <form onSubmit={handleSave} className="space-y-4">
            {/* Dados básicos */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-bold text-gray-900">Dados do Cliente</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input required value={form.name} onChange={(e) => setField('name', e.target.value)} className="input" placeholder="Nome da empresa" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                  <input value={form.cnpj} onChange={(e) => setField('cnpj', e.target.value)} className="input" placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nicho</label>
                  <input value={form.niche} onChange={(e) => setField('niche', e.target.value)} className="input" placeholder="Ex: E-commerce, Saúde..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} className="input" placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setField('status', e.target.value)} className="input">
                    <option value="ATIVO">Ativo</option>
                    <option value="INATIVO">Inativo</option>
                    <option value="PAUSADO">Pausado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grupo do cliente</label>
                  <select value={form.tier} onChange={(e) => setField('tier', e.target.value)} className="input">
                    <option value="AUTO">Automático (pela faixa de ticket)</option>
                    <option value="START">Start</option>
                    <option value="GROWTH">Growth</option>
                    <option value="SCALE">Scale</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    {client?.tier ? `Atual: ${client.tier === 'START' ? 'Start' : client.tier === 'GROWTH' ? 'Growth' : 'Scale'}${client.tierManual ? ' (manual)' : ' (automático)'}` : 'Ainda não classificado'}
                  </p>
                </div>
              </div>
            </div>

            {/* Contrato */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-bold text-gray-900">Contrato</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Início do Contrato</label>
                  <input type="date" value={form.contractStart} onChange={(e) => setField('contractStart', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duração (meses)</label>
                  <input type="number" min="1" value={form.contractMonths} onChange={(e) => setField('contractMonths', e.target.value)} className="input" placeholder="Ex: 12" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fim do Contrato</label>
                  <input type="date" value={form.contractEnd} onChange={(e) => setField('contractEnd', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dia de Pagamento</label>
                  <input type="number" min="1" max="31" value={form.paymentDay} onChange={(e) => setField('paymentDay', e.target.value)} className="input" placeholder="Ex: 10" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor total mensal</label>
                  <div className="input bg-gray-50 text-gray-900 font-semibold cursor-default select-none">
                    {formatCurrency(totalMensal)}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Calculado automaticamente pela soma dos serviços.</p>
                </div>
              </div>
            </div>

            {/* Serviços */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Serviços Contratados</h2>
                <p className="text-xs text-gray-500">
                  Total mensal: <span className="font-bold text-[#030A8C]">{formatCurrency(totalMensal)}</span>
                </p>
              </div>
              {services.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">Nenhum serviço contratado cadastrado.</p>
              ) : (
                <div className="space-y-3">
                  {services.map((service, i) => (
                    <div key={service.id ?? `new-${i}`} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex gap-3 items-start">
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input
                            value={service.serviceName}
                            onChange={(e) => updateService(i, 'serviceName', e.target.value)}
                            className="input" placeholder="Nome do serviço *"
                            aria-label={`Nome do serviço ${i + 1}`}
                          />
                          <CurrencyInput
                            value={service.monthlyValue}
                            onChange={(v) => updateService(i, 'monthlyValue', v)}
                            ariaLabel={`Valor mensal do serviço ${i + 1}`}
                          />
                          <input
                            value={service.description}
                            onChange={(e) => updateService(i, 'description', e.target.value)}
                            className="input sm:col-span-2" placeholder="Descrição do serviço (opcional)"
                            aria-label={`Descrição do serviço ${i + 1}`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (service.id && !confirm(`Remover o serviço "${service.serviceName}"? A remoção é aplicada ao salvar.`)) return
                            removeService(i)
                          }}
                          title="Remover serviço"
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={addService}
                className="flex items-center gap-1 text-sm text-[#030A8C] hover:underline font-medium">
                <Plus className="w-4 h-4" /> Adicionar outro serviço
              </button>
            </div>

            {/* Faturamento e NFS-e */}
            <ClientBillingSection
              clientId={id}
              form={billing}
              onChange={setBillingField}
              asaas={asaasInfo}
            />

            {/* Observações */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-bold text-gray-900">Observações</h2>
              <textarea
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                rows={4}
                className="input resize-none"
                placeholder="Notas internas sobre o cliente..."
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#030A8C] text-white rounded-xl text-sm font-medium hover:bg-[#02077a] transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
              <Link href={`/clientes/${id}`} className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancelar
              </Link>
              <button
                type="button"
                onClick={handleDelete}
                className="ml-auto flex items-center gap-2 px-4 py-2.5 text-red-500 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Excluir Cliente
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
