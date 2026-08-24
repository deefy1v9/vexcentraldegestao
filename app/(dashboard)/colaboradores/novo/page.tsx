'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NovoColaboradorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'COLABORADOR',
    phone: '', position: '', salary: '',
  })

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/colaboradores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      router.push('/colaboradores')
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao cadastrar colaborador')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Novo Colaborador" subtitle="Preencha os dados do colaborador" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-2xl">
          <Link href="/colaboradores" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Dados Pessoais</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                  <input required value={form.name} onChange={(e) => setField('name', e.target.value)}
                    className="input" placeholder="João Silva" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input required type="email" value={form.email} onChange={(e) => setField('email', e.target.value)}
                    className="input" placeholder="joao@vex.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha inicial *</label>
                  <input required type="password" value={form.password} onChange={(e) => setField('password', e.target.value)}
                    className="input" placeholder="mínimo 6 caracteres" minLength={6} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input value={form.phone} onChange={(e) => setField('phone', e.target.value)}
                    className="input" placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                  <input value={form.position} onChange={(e) => setField('position', e.target.value)}
                    className="input" placeholder="Ex: Designer, Redator..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nível de Acesso</label>
                  <select value={form.role} onChange={(e) => setField('role', e.target.value)} className="input">
                    <option value="COLABORADOR">Colaborador</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Salário (R$)</label>
                  <input type="number" min="0" step="0.01" value={form.salary}
                    onChange={(e) => setField('salary', e.target.value)}
                    className="input" placeholder="Ex: 3000.00" />
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
              O colaborador receberá o email <strong>{form.email || 'informado'}</strong> para acessar o sistema com a senha definida acima.
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <Link href="/colaboradores"
                className="w-full sm:w-auto text-center px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancelar
              </Link>
              <button type="submit" disabled={loading}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#030A8C] text-white rounded-lg text-sm font-medium hover:bg-[#02077a] transition-colors disabled:opacity-50">
                {loading ? 'Salvando...' : 'Cadastrar Colaborador'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
