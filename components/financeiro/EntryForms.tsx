'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import CurrencyInput from '@/components/ui/CurrencyInput'
import type { EntryLike } from '@/lib/financeiro-core'

export const COST_CATEGORIES = [
  'Softwares e ferramentas', 'Anúncios', 'Fornecedores', 'Impostos',
  'Aluguel', 'Equipamentos', 'Serviços', 'Administrativo', 'Outros',
]

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]'

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92dvh] sm:max-w-xl sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-bold text-gray-900">{title}</p>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">{children}</div>
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">{footer}</div>
      </div>
    </div>
  )
}

/* ------------------------------- novo custo ------------------------------- */

export function NewCostModal({ period, onClose, onSaved }: {
  period: { year: number; month: number }
  onClose: () => void
  onSaved: () => void
}) {
  const mes = `${period.year}-${String(period.month).padStart(2, '0')}`
  const [form, setForm] = useState({
    name: '', description: '', category: COST_CATEGORIES[0],
    amount: null as number | null, recurrenceType: 'UNICO',
    dueDate: `${mes}-05`, status: 'PENDENTE', paidAt: '',
    frequency: 'MENSAL', startDate: `${mes}-01`, endDate: '', dueDay: '5',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!form.name.trim() || form.amount == null) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/financeiro/custos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (res.ok) { onSaved(); return }
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Não foi possível salvar o custo.')
    } catch { setError('Falha de conexão. Tente de novo.') } finally { setSaving(false) }
  }

  return (
    <Modal
      title="Novo custo"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button type="button" onClick={submit} disabled={!form.name.trim() || form.amount == null || saving} className="px-4 py-2 bg-[#030A8C] text-white text-sm font-semibold rounded-lg hover:bg-[#02077a] disabled:opacity-40">
            {saving ? 'Salvando…' : 'Salvar custo'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Nome do custo *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={INPUT} placeholder="Ex: Assinatura Adobe" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Categoria</label>
          <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={INPUT}>
            {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição</label>
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={INPUT} placeholder="Detalhes do custo" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Valor *</label>
          <CurrencyInput value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} className={INPUT} ariaLabel="Valor do custo" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo *</label>
          <select value={form.recurrenceType} onChange={(e) => setForm((f) => ({ ...f, recurrenceType: e.target.value }))} className={INPUT}>
            <option value="UNICO">Custo único</option>
            <option value="RECORRENTE">Custo recorrente</option>
          </select>
        </div>
        {form.recurrenceType === 'UNICO' ? (
          <>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Vencimento *</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Situação</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
                <option value="PENDENTE">Pendente</option>
                <option value="PAGO">Pago</option>
              </select>
            </div>
            {form.status === 'PAGO' && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Data do pagamento</label>
                <input type="date" value={form.paidAt} onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))} className={INPUT} />
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Frequência *</label>
              <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} className={INPUT}>
                <option value="MENSAL">Mensal</option>
                <option value="TRIMESTRAL">Trimestral</option>
                <option value="ANUAL">Anual</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Início *</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Término (opcional)</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Dia do vencimento</label>
              <input type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm((f) => ({ ...f, dueDay: e.target.value }))} className={INPUT} />
            </div>
          </>
        )}
      </div>
      {error && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
    </Modal>
  )
}

/* ------------------------------ novo salário ------------------------------ */

export function NewSalaryModal({ period, users, onClose, onSaved }: {
  period: { year: number; month: number }
  users: Array<{ id: string; name: string; position?: string | null; salary?: number | null }>
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    userId: '', amount: null as number | null, payDay: '5',
    startYear: period.year, startMonth: period.month, endDate: '', notes: '', status: 'PENDENTE',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickUser(userId: string) {
    const u = users.find((x) => x.id === userId)
    // Reaproveita o salário do perfil do colaborador, se houver
    setForm((f) => ({ ...f, userId, amount: f.amount ?? u?.salary ?? null }))
  }

  async function submit() {
    if (!form.userId || form.amount == null) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/financeiro/salarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (res.ok) { onSaved(); return }
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Não foi possível cadastrar o salário.')
    } catch { setError('Falha de conexão. Tente de novo.') } finally { setSaving(false) }
  }

  return (
    <Modal
      title="Novo salário"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button type="button" onClick={submit} disabled={!form.userId || form.amount == null || saving} className="px-4 py-2 bg-[#030A8C] text-white text-sm font-semibold rounded-lg hover:bg-[#02077a] disabled:opacity-40">
            {saving ? 'Salvando…' : 'Salvar salário'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Colaborador *</label>
          <select value={form.userId} onChange={(e) => pickUser(e.target.value)} className={INPUT}>
            <option value="">Selecione...</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.position ? ` — ${u.position}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Valor do salário *</label>
          <CurrencyInput value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} className={INPUT} ariaLabel="Valor do salário" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Dia do pagamento</label>
          <input type="number" min="1" max="31" value={form.payDay} onChange={(e) => setForm((f) => ({ ...f, payDay: e.target.value }))} className={INPUT} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Mês inicial</label>
          <input
            type="month"
            value={`${form.startYear}-${String(form.startMonth).padStart(2, '0')}`}
            onChange={(e) => { const [y, m] = e.target.value.split('-').map(Number); if (y && m) setForm((f) => ({ ...f, startYear: y, startMonth: m })) }}
            className={INPUT}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Data final (opcional)</label>
          <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className={INPUT} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Situação do mês</label>
          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
            <option value="PENDENTE">Pendente</option>
            <option value="PAGO">Pago</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Observação</label>
          <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={INPUT} placeholder="Ex: acordo de horas, bônus incluído..." />
        </div>
      </div>
      {error && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
    </Modal>
  )
}

/* ------------------------------ edição inline ------------------------------ */

export function CostEditForm({ entry, onCancel, onSave }: {
  entry: EntryLike
  onCancel: () => void
  onSave: (fields: Record<string, unknown>) => void
}) {
  const [f, setF] = useState({
    name: entry.name || entry.description,
    description: entry.description,
    category: entry.category,
    amount: entry.amount as number | null,
    dueDate: entry.dueDate ? String(entry.dueDate).split('T')[0] : '',
  })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className={INPUT} placeholder="Nome *" aria-label="Nome do custo" />
        <select value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))} className={INPUT} aria-label="Categoria">
          {COST_CATEGORIES.includes(f.category) ? null : <option value={f.category}>{f.category}</option>}
          {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <CurrencyInput value={f.amount} onChange={(v) => setF((p) => ({ ...p, amount: v }))} className={INPUT} ariaLabel="Valor do custo" />
        <input type="date" value={f.dueDate} onChange={(e) => setF((p) => ({ ...p, dueDate: e.target.value }))} className={INPUT} aria-label="Vencimento" />
        <input value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} className={`${INPUT} sm:col-span-2`} placeholder="Descrição" aria-label="Descrição" />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-xs px-3 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">Cancelar</button>
        <button
          type="button"
          onClick={() => onSave({ name: f.name, description: f.description, category: f.category, amount: f.amount, dueDate: f.dueDate || undefined })}
          disabled={!f.name.trim() || f.amount == null}
          className="text-xs px-4 py-2 bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50 font-semibold"
        >
          Salvar
        </button>
      </div>
    </div>
  )
}

export function SalaryEditForm({ value, onChange, onCancel, onSave }: {
  value: number | null
  onChange: (v: number | null) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[180px]">
        <label className="text-xs font-medium text-gray-600 mb-1 block">Novo valor</label>
        <CurrencyInput value={value} onChange={onChange} className={INPUT} ariaLabel="Novo valor do salário" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="text-xs px-3 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">Cancelar</button>
        <button type="button" onClick={onSave} disabled={value == null} className="text-xs px-4 py-2 bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50 font-semibold">Salvar</button>
      </div>
    </div>
  )
}

/** Escopo da alteração/exclusão de um lançamento recorrente. */
export function ScopeDialog({ title, onlyLabel, futureLabel, onPick, onClose }: {
  title: string
  onlyLabel: string
  futureLabel: string
  onPick: (scope: 'only' | 'future') => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <p className="font-semibold text-gray-900 mb-4">{title}</p>
        <div className="space-y-2">
          <button type="button" onClick={() => onPick('only')} className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors">{onlyLabel}</button>
          <button type="button" onClick={() => onPick('future')} className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors">{futureLabel}</button>
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg">Cancelar</button>
      </div>
    </div>
  )
}

/** Novo vencimento de parcelas pendentes (parcelas pagas ficam intactas). */
export function DueDateDialog({ label, current, onClose, onConfirm }: {
  label: string
  current: string
  onClose: () => void
  onConfirm: (date: string) => void
}) {
  const [date, setDate] = useState(current)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Alterar vencimento">
        <p className="font-semibold text-gray-900 mb-1">Alterar vencimento</p>
        <p className="text-xs text-gray-500 mb-3 truncate">{label}</p>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} aria-label="Novo vencimento" />
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900">Cancelar</button>
          <button type="button" onClick={() => onConfirm(date)} disabled={!date} className="px-4 py-2 bg-[#030A8C] text-white rounded-lg text-xs font-semibold hover:bg-[#02077a] disabled:opacity-40">Salvar</button>
        </div>
      </div>
    </div>
  )
}
