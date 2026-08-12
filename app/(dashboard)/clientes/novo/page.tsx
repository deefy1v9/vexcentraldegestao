'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import CurrencyInput from '@/components/ui/CurrencyInput'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface ServiceForm {
  serviceName: string
  description: string
  monthlyValue: number | null
}

const EMPTY_SERVICE: ServiceForm = { serviceName: '', description: '', monthlyValue: null }

export default function NovoClientePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [services, setServices] = useState<ServiceForm[]>([{ ...EMPTY_SERVICE }])
  const [form, setForm] = useState({
    name: '', cnpj: '', email: '', phone: '', niche: '',
    contractStart: '', contractMonths: '',
    paymentDay: '', status: 'ATIVO', notes: '',
  })

  // Valor total mensal: somatório automático dos serviços, somente leitura
  const totalMensal = services.reduce((sum, s) => sum + (s.monthlyValue ?? 0), 0)

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function addService() {
    setServices((prev) => [...prev, { ...EMPTY_SERVICE }])
  }

  function removeService(i: number) {
    setServices((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateService<K extends keyof ServiceForm>(i: number, field: K, value: ServiceForm[K]) {
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          contractMonths: form.contractMonths ? Number(form.contractMonths) : null,
          paymentDay: form.paymentDay ? Number(form.paymentDay) : null,
          services: services.filter((s) => s.serviceName.trim()),
        }),
      })
      if (res.ok) {
        const created = await res.json()
        // Cliente criado → abre direto o perfil dele
        router.push(`/clientes/${created.id}`)
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Erro ao cadastrar cliente. Verifique os campos e tente de novo.')
        setLoading(false)
      }
    } catch {
      setError('Falha de conexão. Tente de novo.')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Novo Cliente" subtitle="Preencha os dados do cliente" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl">
          <Link href="/clientes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dados Gerais */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Dados Gerais</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Cliente *</label>
                  <input required value={form.name} onChange={(e) => setField('name', e.target.value)}
                    className="input" placeholder="Ex: Empresa XYZ" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                  <input value={form.cnpj} onChange={(e) => setField('cnpj', e.target.value)}
                    className="input" placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nicho/Segmento</label>
                  <input value={form.niche} onChange={(e) => setField('niche', e.target.value)}
                    className="input" placeholder="Ex: E-commerce, Saúde..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)}
                    className="input" placeholder="contato@empresa.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input value={form.phone} onChange={(e) => setField('phone', e.target.value)}
                    className="input" placeholder="(11) 99999-9999" />
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
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Contrato e Financeiro</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Início do Contrato</label>
                  <input type="date" value={form.contractStart} onChange={(e) => setField('contractStart', e.target.value)}
                    className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duração (meses)</label>
                  <input type="number" min="1" value={form.contractMonths} onChange={(e) => setField('contractMonths', e.target.value)}
                    className="input" placeholder="Ex: 12" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dia de Pagamento</label>
                  <input type="number" min="1" max="31" value={form.paymentDay} onChange={(e) => setField('paymentDay', e.target.value)}
                    className="input" placeholder="Ex: 10" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor total mensal</label>
                  <div className="input bg-gray-50 text-gray-900 font-semibold cursor-default select-none">
                    {formatCurrency(totalMensal)}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Calculado automaticamente pela soma dos serviços.</p>
                </div>
                {form.contractStart && form.contractMonths && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-gray-500">
                      Fim do contrato:{' '}
                      <span className="font-medium text-gray-700">
                        {new Date(
                          new Date(form.contractStart).setMonth(
                            new Date(form.contractStart).getMonth() + Number(form.contractMonths)
                          )
                        ).toLocaleDateString('pt-BR')}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Serviços */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-gray-900">Serviços Contratados</h2>
                <p className="text-xs text-gray-500">
                  Total mensal: <span className="font-bold text-[#030A8C]">{formatCurrency(totalMensal)}</span>
                </p>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Cadastre cada serviço com nome, valor mensal e descrição.
              </p>
              <div className="space-y-3">
                {services.map((service, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-4">
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
                      {services.length > 1 && (
                        <button type="button" onClick={() => removeService(i)}
                          title="Remover serviço"
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addService}
                className="mt-3 flex items-center gap-1 text-sm text-[#030A8C] hover:underline font-medium">
                <Plus className="w-4 h-4" /> Adicionar outro serviço
              </button>
            </div>

            {/* Observações */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Observações</h2>
              <textarea
                value={form.notes} onChange={(e) => setField('notes', e.target.value)}
                rows={4} className="input resize-none"
                placeholder="Anotações internas sobre o cliente..."
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <div className="flex gap-3 pb-6">
              <Link href="/clientes"
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancelar
              </Link>
              <button type="submit" disabled={loading}
                className="px-6 py-2.5 bg-[#030A8C] text-white rounded-lg text-sm font-medium hover:bg-[#02077a] transition-colors disabled:opacity-50">
                {loading ? 'Salvando...' : 'Cadastrar Cliente'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
