'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft, Save, Trash2, Mail, Phone, Briefcase, DollarSign, Shield } from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/utils'

interface User {
  id: string
  name: string
  email: string
  role: string
  phone?: string | null
  position?: string | null
  salary?: number | null
  isActive: boolean
  createdAt: string
  activityLogs: { id: string; action: string; module: string; details?: string | null; createdAt: string }[]
  assignedTasks: { id: string; title: string; status: string; client?: { name: string } | null }[]
}

const STATUS_COLORS: Record<string, string> = {
  TODO: 'bg-gray-100 text-gray-500',
  EM_ANDAMENTO: 'bg-yellow-100 text-yellow-700',
  EM_REVISAO: 'bg-purple-100 text-purple-700',
  CONCLUIDO: 'bg-green-100 text-green-700',
  BACKLOG: 'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<string, string> = {
  TODO: 'A Fazer',
  EM_ANDAMENTO: 'Em Andamento',
  EM_REVISAO: 'Em Revisão',
  CONCLUIDO: 'Concluído',
  BACKLOG: 'Backlog',
}

export default function EditColaboradorPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'COLABORADOR',
    phone: '',
    position: '',
    salary: '',
  })

  useEffect(() => {
    fetch(`/api/colaboradores/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setUser(data)
        setForm({
          name: data.name || '',
          email: data.email || '',
          role: data.role || 'COLABORADOR',
          phone: data.phone || '',
          position: data.position || '',
          salary: data.salary?.toString() || '',
        })
        setLoading(false)
      })
  }, [id])

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body: Record<string, unknown> = { ...form, salary: form.salary ? Number(form.salary) : null }
    if (newPassword) body.password = newPassword

    const res = await fetch(`/api/colaboradores/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      router.push('/colaboradores')
    } else {
      alert('Erro ao salvar')
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!confirm('Desativar este colaborador? Ele perderá acesso ao sistema.')) return
    const res = await fetch(`/api/colaboradores/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/colaboradores')
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

  if (!user) return null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title={`Editar — ${user.name}`} subtitle={user.position || user.role} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl">
          <Link href="/colaboradores" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6">
            <ArrowLeft className="w-4 h-4" /> Voltar para Colaboradores
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Edit Form */}
            <div className="lg:col-span-2 space-y-4">
              <form onSubmit={handleSave} className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 space-y-4">
                  <h2 className="font-bold text-gray-900 flex items-center gap-2">
                    <div className="w-7 h-7 bg-[#030A8C]/10 rounded-lg flex items-center justify-center">
                      <Mail className="w-4 h-4 text-[#030A8C]" />
                    </div>
                    Dados Pessoais
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                      <input
                        required
                        value={form.name}
                        onChange={(e) => setField('name', e.target.value)}
                        className="input"
                        placeholder="Nome do colaborador"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input
                        required
                        type="email"
                        value={form.email}
                        onChange={(e) => setField('email', e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                      <input
                        value={form.phone}
                        onChange={(e) => setField('phone', e.target.value)}
                        className="input"
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                      <input
                        value={form.position}
                        onChange={(e) => setField('position', e.target.value)}
                        className="input"
                        placeholder="Ex: Designer, Redator..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5" /> Nível de Acesso
                      </label>
                      <select
                        value={form.role}
                        onChange={(e) => setField('role', e.target.value)}
                        className="input"
                      >
                        <option value="COLABORADOR">Colaborador</option>
                        <option value="ADMIN">Administrador</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 space-y-4">
                  <h2 className="font-bold text-gray-900 flex items-center gap-2">
                    <div className="w-7 h-7 bg-[#030A8C]/10 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-[#030A8C]" />
                    </div>
                    Financeiro
                  </h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salário Mensal (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.salary}
                      onChange={(e) => setField('salary', e.target.value)}
                      className="input max-w-xs"
                      placeholder="Ex: 3500.00"
                    />
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 space-y-4">
                  <h2 className="font-bold text-gray-900">Alterar Senha</h2>
                  <p className="text-xs text-gray-500">Deixe em branco para manter a senha atual.</p>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input max-w-xs"
                    placeholder="Nova senha (mín. 6 caracteres)"
                    minLength={6}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#030A8C] text-white rounded-xl text-sm font-medium hover:bg-[#02077a] transition-colors disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                  <Link
                    href="/colaboradores"
                    className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </Link>
                  <button
                    type="button"
                    onClick={handleDeactivate}
                    className="sm:ml-auto flex items-center gap-2 px-4 py-2.5 text-red-500 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Desativar
                  </button>
                </div>
              </form>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Stats */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-[#030A8C] rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-lg">{user.name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{user.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-[#030A8C]/10 text-[#030A8C]'}`}>
                      {user.role}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tarefas atribuídas</span>
                    <span className="font-semibold text-gray-900">{user.assignedTasks.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ações registradas</span>
                    <span className="font-semibold text-gray-900">{user.activityLogs.length}</span>
                  </div>
                  {user.salary && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Salário</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(user.salary)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Tasks */}
              {user.assignedTasks.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-900 text-sm mb-3">Demandas Atribuídas</h3>
                  <div className="space-y-2">
                    {user.assignedTasks.map((task) => (
                      <div key={task.id} className="flex items-start gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABEL[task.status] || task.status}
                        </span>
                        <div>
                          <p className="text-xs font-medium text-gray-900 leading-tight">{task.title}</p>
                          {task.client && <p className="text-[11px] text-gray-500">{task.client.name}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              {user.activityLogs.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-900 text-sm mb-3">Atividade Recente</h3>
                  <div className="space-y-2">
                    {user.activityLogs.slice(0, 8).map((log) => (
                      <div key={log.id} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#030A8C] mt-1.5 shrink-0" />
                        <div>
                          <p className="text-xs text-gray-700">{log.action}</p>
                          <p className="text-[10px] text-gray-500">{log.module} · {formatDateTime(log.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
