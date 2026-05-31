'use client'
import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { TrendingUp, TrendingDown, DollarSign, Users, Plus, X, Check } from 'lucide-react'

interface Entry {
  id: string
  type: string
  category: string
  description: string
  amount: number
  date: string | Date
  isPaid: boolean
}

interface Payment {
  id: string
  clientId: string
  month: number
  year: number
  amount: number
  dueDate: string | Date
  paidAt?: string | Date | null
  status: string
  client: { id: string; name: string }
}

interface Salary {
  id: string
  name: string
  position?: string | null
  salary?: number | null
}

export default function FinanceiroPanel({
  initialEntries,
  initialPayments,
  salaries,
  serviceRevenue,
  month,
  year,
}: {
  initialEntries: Entry[]
  initialPayments: Payment[]
  salaries: Salary[]
  serviceRevenue: number
  month: number
  year: number
}) {
  const [entries, setEntries] = useState(initialEntries)
  const [payments, setPayments] = useState(initialPayments)
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'costs' | 'salaries'>('overview')
  const [form, setForm] = useState({
    type: 'CUSTO', category: '', description: '', amount: '', date: new Date().toISOString().split('T')[0], isPaid: false
  })

  const pendingRevenue = payments.filter((p) => p.status === 'PENDENTE').reduce((s, p) => s + p.amount, 0)
  const totalSalaries = salaries.reduce((s, u) => s + (u.salary || 0), 0)
  const otherCosts = entries.filter((e) => e.type === 'CUSTO').reduce((s, e) => s + e.amount, 0)
  const totalCosts = totalSalaries + otherCosts
  const netProfit = serviceRevenue - totalCosts

  async function createEntry() {
    const res = await fetch('/api/financeiro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    })
    if (res.ok) {
      const entry = await res.json()
      setEntries((prev) => [entry, ...prev])
      setShowNewEntry(false)
      setForm({ type: 'CUSTO', category: '', description: '', amount: '', date: new Date().toISOString().split('T')[0], isPaid: false })
    }
  }

  async function togglePayment(paymentId: string, currentStatus: string) {
    const newStatus = currentStatus === 'PAGO' ? 'PENDENTE' : 'PAGO'
    const res = await fetch('/api/financeiro/pagamentos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, status: newStatus }),
    })
    if (res.ok) {
      setPayments((prev) => prev.map((p) =>
        p.id === paymentId ? { ...p, status: newStatus, paidAt: newStatus === 'PAGO' ? new Date().toISOString() : null } : p
      ))
    }
  }

  const tabs = [
    { key: 'overview', label: 'Resumo' },
    { key: 'payments', label: 'Recebimentos' },
    { key: 'costs', label: 'Custos' },
    { key: 'salaries', label: 'Salários' },
  ] as const

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Receita do Mês', value: formatCurrency(serviceRevenue), sub: `${formatCurrency(pendingRevenue)} pendente`, icon: TrendingUp, color: 'text-green-600 bg-green-50' },
          { label: 'Custos Totais', value: formatCurrency(totalCosts), sub: `${formatCurrency(totalSalaries)} salários`, icon: TrendingDown, color: 'text-red-600 bg-red-50' },
          { label: 'Lucro Líquido', value: formatCurrency(netProfit), sub: netProfit >= 0 ? 'positivo' : 'negativo', icon: DollarSign, color: `${netProfit >= 0 ? 'text-[#030A8C] bg-blue-50' : 'text-red-600 bg-red-50'}` },
          { label: 'Salários', value: formatCurrency(totalSalaries), sub: `${salaries.length} colaboradores`, icon: Users, color: 'text-purple-600 bg-purple-50' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500">{card.label}</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-[#030A8C] border-b-2 border-[#030A8C]'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          {(activeTab === 'costs') && (
            <button onClick={() => setShowNewEntry(true)}
              className="flex items-center gap-1 mr-3 my-2 px-3 py-1.5 bg-[#030A8C] text-white rounded-lg text-xs font-medium">
              <Plus className="w-3.5 h-3.5" />
              Novo Custo
            </button>
          )}
        </div>

        <div className="p-5">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Receita de Serviços Ativos</span>
                <span className="text-sm font-bold text-green-700">{formatCurrency(serviceRevenue)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Receita Pendente</span>
                <span className="text-sm font-bold text-orange-700">{formatCurrency(pendingRevenue)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Salários</span>
                <span className="text-sm font-bold text-purple-700">- {formatCurrency(totalSalaries)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Outros Custos</span>
                <span className="text-sm font-bold text-red-700">- {formatCurrency(otherCosts)}</span>
              </div>
              <div className={`flex items-center justify-between p-4 rounded-lg border-2 ${netProfit >= 0 ? 'bg-blue-50 border-[#030A8C]' : 'bg-red-50 border-red-400'}`}>
                <span className="text-base font-bold text-gray-900">Lucro Líquido</span>
                <span className={`text-lg font-bold ${netProfit >= 0 ? 'text-[#030A8C]' : 'text-red-700'}`}>
                  {formatCurrency(netProfit)}
                </span>
              </div>
            </div>
          )}

          {/* Payments Tab */}
          {activeTab === 'payments' && (
            <div className="space-y-2">
              {payments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhum pagamento cadastrado</p>
              ) : (
                payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{payment.client.name}</p>
                      <p className="text-xs text-gray-400">Vence {formatDate(payment.dueDate)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(payment.amount)}</p>
                      <button
                        onClick={() => togglePayment(payment.id, payment.status)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          payment.status === 'PAGO'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        }`}
                      >
                        {payment.status === 'PAGO' ? <Check className="w-3 h-3" /> : null}
                        {payment.status}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Costs Tab */}
          {activeTab === 'costs' && (
            <div>
              {showNewEntry && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo</label>
                      <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input text-sm">
                        <option value="CUSTO">Custo</option>
                        <option value="RECEITA">Receita Extra</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Categoria</label>
                      <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                        className="input text-sm" placeholder="Ex: Ferramentas, Infra..." />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição *</label>
                      <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        className="input text-sm" placeholder="Descrição do lançamento" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Valor (R$) *</label>
                      <input type="number" min="0" step="0.01" value={form.amount}
                        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                        className="input text-sm" placeholder="0,00" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Data *</label>
                      <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowNewEntry(false)}
                      className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded-lg">Cancelar</button>
                    <button onClick={createEntry} disabled={!form.description || !form.amount}
                      className="text-xs px-3 py-1.5 bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50">Salvar</button>
                  </div>
                </div>
              )}
              {entries.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhum lançamento de custo</p>
              ) : (
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{entry.description}</p>
                        <p className="text-xs text-gray-400">{entry.category} · {formatDate(entry.date)}</p>
                      </div>
                      <span className={`text-sm font-bold ${entry.type === 'CUSTO' ? 'text-red-600' : 'text-green-600'}`}>
                        {entry.type === 'CUSTO' ? '- ' : '+ '}{formatCurrency(entry.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Salaries Tab */}
          {activeTab === 'salaries' && (
            <div className="space-y-2">
              {salaries.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhum salário cadastrado</p>
              ) : (
                salaries.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#030A8C] rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">{user.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                        {user.position && <p className="text-xs text-gray-400">{user.position}</p>}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-red-600">- {formatCurrency(user.salary || 0)}</span>
                  </div>
                ))
              )}
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg mt-3">
                <span className="text-sm font-bold text-gray-900">Total Salários</span>
                <span className="text-sm font-bold text-red-700">{formatCurrency(totalSalaries)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
