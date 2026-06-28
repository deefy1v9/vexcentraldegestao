'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'

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
  services: { id: string; serviceName: string }[]
}

export default function EditClientePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [services, setServices] = useState<string[]>([])
  const [newService, setNewService] = useState('')
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
    monthlyValue: '',
    paymentDay: '',
    notes: '',
  })

  useEffect(() => {
    fetch(`/api/clientes/${id}`)
      .then((r) => r.json())
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
          monthlyValue: data.monthlyValue?.toString() || '',
          paymentDay: data.paymentDay?.toString() || '',
          notes: data.notes || '',
        })
        setServices(data.services.map((s) => s.serviceName))
        setLoading(false)
      })
  }, [id])

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function addService() {
    const s = newService.trim()
    if (s && !services.includes(s)) {
      setServices((prev) => [...prev, s])
    }
    setNewService('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch(`/api/clientes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        contractMonths: form.contractMonths ? Number(form.contractMonths) : null,
        monthlyValue: form.monthlyValue ? Number(form.monthlyValue) : null,
        paymentDay: form.paymentDay ? Number(form.paymentDay) : null,
        services,
      }),
    })

    if (res.ok) {
      router.push(`/clientes/${id}`)
    } else {
      alert('Erro ao salvar')
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
          <div className="w-8 h-8 border-2 border-[#0A1A3F] border-t-transparent rounded-full animate-spin" />
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor Mensal (R$)</label>
                  <input type="number" min="0" step="0.01" value={form.monthlyValue} onChange={(e) => setField('monthlyValue', e.target.value)} className="input" placeholder="Ex: 3000.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dia de Pagamento</label>
                  <input type="number" min="1" max="31" value={form.paymentDay} onChange={(e) => setField('paymentDay', e.target.value)} className="input" placeholder="Ex: 10" />
                </div>
              </div>
            </div>

            {/* Serviços */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-bold text-gray-900">Serviços Contratados</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                {services.map((s) => (
                  <span key={s} className="flex items-center gap-1.5 bg-[#0A1A3F]/10 text-[#0A1A3F] px-3 py-1.5 rounded-lg text-sm font-medium">
                    {s}
                    <button type="button" onClick={() => setServices((prev) => prev.filter((x) => x !== s))} className="text-[#0A1A3F]/50 hover:text-red-500 transition-colors">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newService}
                  onChange={(e) => setNewService(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addService() } }}
                  placeholder="Adicionar serviço..."
                  className="input flex-1"
                />
                <button type="button" onClick={addService} className="px-4 py-2 bg-[#0A1A3F]/10 text-[#0A1A3F] rounded-xl text-sm font-medium hover:bg-[#0A1A3F] hover:text-white transition-colors">
                  Adicionar
                </button>
              </div>
            </div>

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

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0A1A3F] text-white rounded-xl text-sm font-medium hover:bg-[#06112B] transition-colors disabled:opacity-50"
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
