'use client'
import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Check, Clock, Trash2, Loader2, CalendarClock, ListTodo } from 'lucide-react'

interface Activity {
  id: string
  type: string
  title: string
  notes?: string | null
  dueDate: string
  status: string
  createdByAi: boolean
  assignee?: { id: string; name: string } | null
}

interface Scheduled {
  id: string
  content: string
  scheduledFor: string
  status: string
  createdByAi: boolean
  lastError?: string | null
}

const ACTIVITY_TYPES = [
  { value: 'FOLLOWUP', label: 'Follow-up' },
  { value: 'LIGACAO', label: 'Ligação' },
  { value: 'REUNIAO', label: 'Reunião' },
  { value: 'PROPOSTA', label: 'Proposta' },
  { value: 'OUTRO', label: 'Outro' },
]

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ACTIVITY_TYPES.map((t) => [t.value, t.label]),
)

const STATUS_STYLE: Record<string, string> = {
  PENDENTE: 'bg-orange-50 text-orange-700',
  ENVIADA: 'bg-green-50 text-green-700',
  CONCLUIDA: 'bg-green-50 text-green-700',
  CANCELADA: 'bg-gray-100 text-gray-500',
  FALHOU: 'bg-red-50 text-red-700',
  ENVIANDO: 'bg-blue-50 text-blue-700',
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** datetime-local devolve hora local; o backend quer um instante absoluto. */
function toIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export default function ContactSidePanel({
  contactId,
  contactName,
  onClose,
}: {
  contactId: string
  contactName: string
  onClose: () => void
}) {
  const [tab, setTab] = useState<'atividades' | 'agendamentos'>('atividades')
  const [activities, setActivities] = useState<Activity[]>([])
  const [scheduled, setScheduled] = useState<Scheduled[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [actForm, setActForm] = useState({ title: '', type: 'FOLLOWUP', dueDate: '', notes: '' })
  const [schedForm, setSchedForm] = useState({ content: '', scheduledFor: '' })

  const fetchData = useCallback(async () => {
    const [a, s] = await Promise.all([
      fetch(`/api/crm/atividades?contactId=${contactId}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/crm/agendamentos?contactId=${contactId}`).then((r) => (r.ok ? r.json() : [])),
    ])
    return {
      activities: (Array.isArray(a) ? a : []) as Activity[],
      scheduled: (Array.isArray(s) ? s : []) as Scheduled[],
    }
  }, [contactId])

  /** Recarrega depois de criar/concluir/cancelar algo. */
  const load = useCallback(async () => {
    const data = await fetchData()
    setActivities(data.activities)
    setScheduled(data.scheduled)
    setLoading(false)
  }, [fetchData])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const data = await fetchData()
      if (cancelled) return
      setActivities(data.activities)
      setScheduled(data.scheduled)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchData])

  async function createActivity() {
    const dueDate = toIso(actForm.dueDate)
    if (!actForm.title.trim() || !dueDate) return
    setSaving(true)
    const res = await fetch('/api/crm/atividades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...actForm, dueDate, contactId }),
    })
    setSaving(false)
    if (res.ok) {
      setActForm({ title: '', type: 'FOLLOWUP', dueDate: '', notes: '' })
      setShowForm(false)
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Não foi possível criar a atividade')
    }
  }

  async function createScheduled() {
    const scheduledFor = toIso(schedForm.scheduledFor)
    if (!schedForm.content.trim() || !scheduledFor) return
    setSaving(true)
    const res = await fetch('/api/crm/agendamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: schedForm.content, scheduledFor, contactId }),
    })
    setSaving(false)
    if (res.ok) {
      setSchedForm({ content: '', scheduledFor: '' })
      setShowForm(false)
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Não foi possível agendar a mensagem')
    }
  }

  async function completeActivity(id: string) {
    const res = await fetch(`/api/crm/atividades/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONCLUIDA' }),
    })
    if (res.ok) load()
  }

  async function deleteActivity(id: string) {
    if (!confirm('Remover esta atividade?')) return
    const res = await fetch(`/api/crm/atividades/${id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  async function cancelScheduled(id: string) {
    if (!confirm('Cancelar esta mensagem agendada?')) return
    const res = await fetch(`/api/crm/agendamentos/${id}`, { method: 'DELETE' })
    if (res.ok) load()
    else {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Não foi possível cancelar')
    }
  }

  const tabBtn = (key: 'atividades' | 'agendamentos', label: string, Icon: React.ElementType) => (
    <button
      onClick={() => { setTab(key); setShowForm(false) }}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
        tab === key
          ? 'border-[#030A8C] text-[#030A8C]'
          : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )

  return (
    <div className="w-[320px] border-l border-gray-200 bg-white flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate">{contactName}</p>
          <p className="text-[10px] text-gray-400">Atividades e agendamentos</p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="flex border-b border-gray-100">
        {tabBtn('atividades', 'Atividades', ListTodo)}
        {tabBtn('agendamentos', 'Agendadas', CalendarClock)}
      </div>

      <div className="px-4 py-2 border-b border-gray-100">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-[#030A8C] hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {tab === 'atividades' ? 'Nova atividade' : 'Agendar mensagem'}
        </button>
      </div>

      {showForm && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 space-y-2">
          {tab === 'atividades' ? (
            <>
              <input
                value={actForm.title}
                onChange={(e) => setActForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Título (ex: Ligar sobre a proposta)"
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#030A8C] bg-white"
              />
              <div className="flex gap-2">
                <select
                  value={actForm.type}
                  onChange={(e) => setActForm((f) => ({ ...f, type: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#030A8C] bg-white"
                >
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  value={actForm.dueDate}
                  onChange={(e) => setActForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#030A8C] bg-white"
                />
              </div>
              <input
                value={actForm.notes}
                onChange={(e) => setActForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Observações (opcional)"
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#030A8C] bg-white"
              />
              <button
                onClick={createActivity}
                disabled={saving || !actForm.title.trim() || !actForm.dueDate}
                className="w-full py-1.5 bg-[#030A8C] text-white text-xs font-semibold rounded-lg hover:bg-[#02077a] disabled:opacity-40 transition-colors"
              >
                {saving ? 'Salvando...' : 'Criar atividade'}
              </button>
            </>
          ) : (
            <>
              <textarea
                value={schedForm.content}
                onChange={(e) => setSchedForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Mensagem que será enviada..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#030A8C] bg-white resize-none"
              />
              <input
                type="datetime-local"
                value={schedForm.scheduledFor}
                onChange={(e) => setSchedForm((f) => ({ ...f, scheduledFor: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#030A8C] bg-white"
              />
              <button
                onClick={createScheduled}
                disabled={saving || !schedForm.content.trim() || !schedForm.scheduledFor}
                className="w-full py-1.5 bg-[#030A8C] text-white text-xs font-semibold rounded-lg hover:bg-[#02077a] disabled:opacity-40 transition-colors"
              >
                {saving ? 'Agendando...' : 'Agendar mensagem'}
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
          </div>
        ) : tab === 'atividades' ? (
          activities.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">Nenhuma atividade</p>
          ) : (
            activities.map((a) => (
              <div key={a.id} className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] bg-blue-50 text-[#030A8C] px-1.5 py-0.5 rounded font-medium">
                        {TYPE_LABEL[a.type] ?? a.type}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLE[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {a.status}
                      </span>
                      {a.createdByAi && (
                        <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">IA</span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-gray-900 mt-1.5">{a.title}</p>
                    <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" /> {fmt(a.dueDate)}
                    </p>
                    {a.notes && <p className="text-[11px] text-gray-400 mt-1">{a.notes}</p>}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {a.status === 'PENDENTE' && (
                      <button
                        onClick={() => completeActivity(a.id)}
                        className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="Concluir"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteActivity(a.id)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )
        ) : scheduled.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">Nenhuma mensagem agendada</p>
        ) : (
          scheduled.map((s) => (
            <div key={s.id} className="border border-gray-200 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLE[s.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {s.status}
                    </span>
                    {s.createdByAi && (
                      <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">IA</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-1.5">
                    <Clock className="w-3 h-3" /> {fmt(s.scheduledFor)}
                  </p>
                  <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap break-words">{s.content}</p>
                  {s.lastError && <p className="text-[10px] text-red-500 mt-1">{s.lastError}</p>}
                </div>
                {s.status === 'PENDENTE' && (
                  <button
                    onClick={() => cancelScheduled(s.id)}
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                    title="Cancelar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
