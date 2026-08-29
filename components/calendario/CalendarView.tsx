'use client'
import TierBadge from '@/components/ui/TierBadge'
import PlannerWizard from '@/components/calendario/PlannerWizard'
import PlannerConfigPanel from '@/components/calendario/PlannerConfigPanel'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Plus, X, Calendar, Filter, Sparkles, Settings2, AlertTriangle,
} from 'lucide-react'

interface CalEvent {
  id: string
  title: string
  description?: string | null
  startDate: string | Date
  endDate?: string | Date | null
  type: string
  status: string
  client?: { id: string; name: string; tier?: string | null } | null
  assignedUser?: { id: string; name: string } | null
}

interface CalTask {
  id: string
  number: number
  title: string
  status: string
  priority: string
  dueDate: string | Date
  contentType?: string | null
  platform?: string | null
  client?: { id: string; name: string; tier?: string | null; operationalGroup?: string | null } | null
  assignee?: { id: string; name: string } | null
}

interface Client { id: string; name: string; tier?: string | null; operationalGroup?: string | null }
interface User { id: string; name: string }

const TYPE_BAR: Record<string, string> = {
  ENTREGA: 'bg-blue-500',
  REUNIAO: 'bg-purple-500',
  PRAZO: 'bg-red-500',
  OUTROS: 'bg-gray-500',
}

const TYPE_TEXT: Record<string, string> = {
  ENTREGA: 'text-blue-600',
  REUNIAO: 'text-purple-600',
  PRAZO: 'text-red-600',
  OUTROS: 'text-gray-500',
}

const TYPE_BG: Record<string, string> = {
  ENTREGA: 'bg-blue-500/10 border-blue-500/20',
  REUNIAO: 'bg-purple-500/10 border-purple-500/20',
  PRAZO: 'bg-red-500/10 border-red-500/20',
  OUTROS: 'bg-gray-500/10 border-gray-500/20',
}

/** Cores das demandas por etapa do fluxo (mesmas do Kanban). */
const TASK_BG: Record<string, string> = {
  BACKLOG: 'bg-gray-500/10 border-gray-500/20 text-gray-600',
  TODO: 'bg-blue-500/10 border-blue-500/20 text-blue-600',
  EM_ANDAMENTO: 'bg-amber-500/10 border-amber-500/20 text-amber-700',
  EM_REVISAO: 'bg-purple-500/10 border-purple-500/20 text-purple-600',
  APROVADO: 'bg-teal-500/10 border-teal-500/20 text-teal-700',
  CONCLUIDO: 'bg-green-500/10 border-green-500/20 text-green-700',
}
const TASK_LABEL: Record<string, string> = {
  BACKLOG: 'Backlog', TODO: 'A fazer', EM_ANDAMENTO: 'Em andamento',
  EM_REVISAO: 'Em revisão', APROVADO: 'Aprovado', CONCLUIDO: 'Concluído',
}

const DAYS_MON = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const DAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Sunday=0 → shift to Monday=0
function toMonday(dayOfWeek: number) {
  return (dayOfWeek + 6) % 7
}

/** Dia civil (America/Sao_Paulo) de uma data — evita deslocamento por UTC. */
function toISODate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function CalendarView({
  initialEvents,
  initialTasks = [],
  aiTaskIds = [],
  clients,
  users,
}: {
  initialEvents: CalEvent[]
  initialTasks?: CalTask[]
  aiTaskIds?: string[]
  clients: Client[]
  users: User[]
}) {
  const router = useRouter()
  const today = new Date()
  const todayISO = toISODate(today)
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [mode, setMode] = useState<'mes' | 'semana' | 'dia'>('mes')
  const [events, setEvents] = useState(initialEvents)
  const [tasks] = useState(initialTasks)
  const [showForm, setShowForm] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [capacity, setCapacity] = useState(8)
  const [form, setForm] = useState({
    title: '', description: '', startDate: '', endDate: '',
    type: 'ENTREGA', clientId: '', assignedTo: '', status: 'PENDENTE',
  })
  const [filters, setFilters] = useState({
    clientId: '', userId: '', status: '', priority: '', service: '', onlyAi: false,
  })

  const aiSet = useMemo(() => new Set(aiTaskIds), [aiTaskIds])
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  /* ------------------------------ filtragem ------------------------------ */

  const filteredTasks = useMemo(() => tasks.filter((t) => {
    if (filters.clientId && t.client?.id !== filters.clientId) return false
    if (filters.userId && t.assignee?.id !== filters.userId) return false
    if (filters.status && t.status !== filters.status) return false
    if (filters.priority && t.priority !== filters.priority) return false
    if (filters.service && !(t.contentType ?? '').toLowerCase().includes(filters.service.toLowerCase())
      && !(t.platform ?? '').toLowerCase().includes(filters.service.toLowerCase())) return false
    if (filters.onlyAi && !aiSet.has(t.id)) return false
    return true
  }), [tasks, filters, aiSet])

  const filteredEvents = useMemo(() => events.filter((e) => {
    if (filters.onlyAi) return false // eventos não vêm da IA
    if (filters.clientId && e.client?.id !== filters.clientId) return false
    if (filters.userId && e.assignedUser?.id !== filters.userId) return false
    if (filters.priority) return false // prioridade só existe em demanda
    return true
  }), [events, filters])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, CalTask[]>()
    for (const t of filteredTasks) {
      const key = toISODate(t.dueDate)
      map.set(key, [...(map.get(key) ?? []), t])
    }
    return map
  }, [filteredTasks])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const e of filteredEvents) {
      const key = toISODate(e.startDate)
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return map
  }, [filteredEvents])

  const activeFilters = Object.entries(filters).filter(([, v]) => v !== '' && v !== false).length

  /* ------------------------------ navegação ------------------------------ */

  function move(dir: -1 | 1) {
    const d = new Date(cursor)
    if (mode === 'mes') d.setMonth(d.getMonth() + dir)
    else if (mode === 'semana') d.setDate(d.getDate() + 7 * dir)
    else d.setDate(d.getDate() + dir)
    setCursor(d)
  }
  function goToday() { setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate())) }

  function openNewEvent(dateStr: string) {
    setForm((f) => ({ ...f, startDate: dateStr }))
    setShowForm(true)
  }

  async function createEvent() {
    if (!form.title || !form.startDate) return
    const res = await fetch('/api/calendario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        clientId: form.clientId || null,
        assignedTo: form.assignedTo || null,
      }),
    })
    if (res.ok) {
      const ev = await res.json()
      setEvents((prev) => [...prev, ev])
      setShowForm(false)
      setForm({ title: '', description: '', startDate: '', endDate: '', type: 'ENTREGA', clientId: '', assignedTo: '', status: 'PENDENTE' })
    }
  }

  async function deleteEvent(id: string) {
    if (!confirm('Remover este evento?')) return
    await fetch(`/api/calendario/${id}`, { method: 'DELETE' })
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setSelectedEvent(null)
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/calendario/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)))
    setSelectedEvent((prev) => prev?.id === id ? { ...prev, status } : prev)
  }

  /* -------------------------------- células -------------------------------- */

  const monthCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1).getDay()
    const offset = toMonday(firstDayOfMonth)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()
    const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      if (i < offset) {
        const d = daysInPrevMonth - offset + i + 1
        cells.push({ day: d, month: month === 0 ? 11 : month - 1, year: month === 0 ? year - 1 : year, isCurrentMonth: false })
      } else if (i < offset + daysInMonth) {
        cells.push({ day: i - offset + 1, month, year, isCurrentMonth: true })
      } else {
        const d = i - offset - daysInMonth + 1
        cells.push({ day: d, month: month === 11 ? 0 : month + 1, year: month === 11 ? year + 1 : year, isCurrentMonth: false })
      }
    }
    return cells
  }, [year, month])

  const weekCells = useMemo(() => {
    const start = new Date(cursor)
    start.setDate(start.getDate() - toMonday(start.getDay()))
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return { day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), isCurrentMonth: d.getMonth() === month }
    })
  }, [cursor, month])

  const periodLabel = mode === 'mes'
    ? `${MONTHS[month]} ${year}`
    : mode === 'semana'
      ? `Semana de ${weekCells[0]?.day}/${(weekCells[0]?.month ?? 0) + 1}`
      : cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  /* --------------------------------- render --------------------------------- */

  function DayCell({ cell, compact }: { cell: { day: number; month: number; year: number; isCurrentMonth: boolean }; compact: boolean }) {
    const iso = isoOf(cell.year, cell.month, cell.day)
    const isToday = iso === todayISO
    const dayTasks = tasksByDate.get(iso) ?? []
    const dayEvents = eventsByDate.get(iso) ?? []
    const total = dayTasks.length + dayEvents.length
    const overloaded = dayTasks.length > capacity
    const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay()
    const isWeekend = weekday === 0 || weekday === 6
    const limit = compact ? 3 : 12

    return (
      <div
        onClick={() => openNewEvent(iso)}
        className={`border-b border-r border-gray-100 p-1.5 cursor-pointer transition-colors group ${
          !cell.isCurrentMonth ? 'bg-gray-50' : isWeekend ? 'bg-gray-50/50' : 'bg-white'
        } hover:bg-gray-50`}
      >
        <div className="flex items-start justify-between mb-1 gap-1">
          <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold shrink-0 ${
            isToday ? 'bg-[#f59e0b] text-black' : cell.isCurrentMonth ? 'text-gray-700' : 'text-gray-300'
          }`}>
            {cell.day}
          </div>
          <div className="flex items-center gap-1">
            {total > 0 && (
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  overloaded ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                }`}
                title={`${dayTasks.length} demanda(s) · capacidade ${capacity}`}
              >
                {overloaded && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />}
                {total}
              </span>
            )}
            <Plus className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        </div>

        <div className="space-y-0.5 overflow-hidden">
          {dayTasks.slice(0, limit).map((t) => (
            <div
              key={t.id}
              onClick={(e) => { e.stopPropagation(); router.push(`/demandas?task=${t.id}`) }}
              title={`${t.title} · ${TASK_LABEL[t.status] ?? t.status}`}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate border cursor-pointer hover:brightness-95 transition-all ${TASK_BG[t.status] ?? TASK_BG.TODO}`}
            >
              {aiSet.has(t.id) && <Sparkles className="w-2.5 h-2.5 shrink-0" />}
              {t.client?.operationalGroup && (
                <span className="text-[8px] font-bold opacity-70 shrink-0">{t.client.operationalGroup}</span>
              )}
              <span className="truncate">{t.title}</span>
            </div>
          ))}
          {dayEvents.slice(0, Math.max(0, limit - dayTasks.length)).map((ev) => (
            <div
              key={ev.id}
              onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev) }}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate border cursor-pointer hover:brightness-95 transition-all ${TYPE_BG[ev.type] || TYPE_BG.OUTROS}`}
            >
              <span className={`w-1 h-1 rounded-full shrink-0 ${TYPE_BAR[ev.type] || TYPE_BAR.OUTROS}`} />
              <span className={`truncate ${TYPE_TEXT[ev.type] || TYPE_TEXT.OUTROS}`}>{ev.title}</span>
            </div>
          ))}
          {total > limit && (
            <p className="text-[9px] text-gray-400 px-1">+{total - limit} mais</p>
          )}
        </div>
      </div>
    )
  }

  const dayISO = isoOf(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
  const dayTasks = tasksByDate.get(dayISO) ?? []
  const dayEvents = eventsByDate.get(dayISO) ?? []

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-3 sm:px-6 sm:py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base sm:text-xl font-bold text-gray-900 truncate">{periodLabel}</h2>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => move(-1)} aria-label="Período anterior" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => move(1)} aria-label="Próximo período" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(['mes', 'semana', 'dia'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 sm:px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors ${
                  mode === m ? 'bg-white text-[#030A8C] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'mes' ? 'Mês' : m}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
              activeFilters > 0 ? 'border-[#030A8C] text-[#030A8C]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filtros</span>
            {activeFilters > 0 && <span className="text-[10px] font-bold">{activeFilters}</span>}
          </button>

          <PlannerConfigPanel onCapacity={setCapacity} />

          <button
            onClick={goToday}
            className="px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
          >
            Hoje
          </button>

          <PlannerWizard clients={clients} onCreated={() => router.refresh()} />

          <button
            onClick={() => { setForm((f) => ({ ...f, startDate: todayISO })); setShowForm(true) }}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:border-[#030A8C] hover:text-[#030A8C] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Evento</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <div className="px-3 sm:px-6 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <select value={filters.clientId} onChange={(e) => setFilters((f) => ({ ...f, clientId: e.target.value }))} className="input text-xs">
              <option value="">Todos os clientes</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))} className="input text-xs">
              <option value="">Todos os responsáveis</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input text-xs">
              <option value="">Todas as etapas</option>
              {Object.entries(TASK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} className="input text-xs">
              <option value="">Todas as prioridades</option>
              <option value="URGENTE">Urgente</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Média</option>
              <option value="BAIXA">Baixa</option>
            </select>
            <input
              value={filters.service}
              onChange={(e) => setFilters((f) => ({ ...f, service: e.target.value }))}
              placeholder="Serviço/plataforma"
              className="input text-xs"
            />
            <label className="flex items-center gap-2 text-xs text-gray-700 px-1">
              <input type="checkbox" checked={filters.onlyAi} onChange={(e) => setFilters((f) => ({ ...f, onlyAi: e.target.checked }))} />
              Criadas pela IA
            </label>
          </div>
          {activeFilters > 0 && (
            <button
              onClick={() => setFilters({ clientId: '', userId: '', status: '', priority: '', service: '', onlyAi: false })}
              className="mt-2 text-[11px] font-semibold text-[#030A8C] hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Legenda */}
      <div className="px-3 sm:px-6 py-2 border-b border-gray-100 shrink-0 flex items-center gap-3 flex-wrap text-[10px] text-gray-500 overflow-x-auto">
        {Object.entries(TASK_LABEL).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1 whitespace-nowrap">
            <span className={`w-2 h-2 rounded-full ${(TASK_BG[k] ?? '').split(' ')[0].replace('/10', '')}`} /> {v}
          </span>
        ))}
        <span className="flex items-center gap-1 whitespace-nowrap"><Sparkles className="w-3 h-3" /> criada pela IA</span>
        <span className="flex items-center gap-1 whitespace-nowrap"><b>A</b>/<b>B</b> grupo operacional</span>
      </div>

      {/* Grade */}
      <div className="flex-1 overflow-y-auto">
        {mode === 'dia' ? (
          <div className="p-3 sm:p-6 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-bold text-gray-900">
                {dayTasks.length} demanda(s) · {dayEvents.length} evento(s)
              </p>
              {dayTasks.length > capacity && (
                <span className="text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-1 rounded-lg flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Acima da capacidade ({capacity}/dia)
                </span>
              )}
            </div>
            {dayTasks.length === 0 && dayEvents.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-10">Nada agendado neste dia.</p>
            )}
            {dayTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => router.push(`/demandas?task=${t.id}`)}
                className="w-full text-left border border-gray-100 rounded-xl p-3 bg-white hover:border-gray-200 transition-colors"
              >
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  {aiSet.has(t.id) && <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />}
                  <span className="truncate">#{t.number} {t.title}</span>
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {t.client?.name ?? 'Sem cliente'} · {TASK_LABEL[t.status] ?? t.status} · {t.assignee?.name ?? 'Não atribuído'}
                </p>
              </button>
            ))}
            {dayEvents.map((ev) => (
              <button
                key={ev.id}
                onClick={() => setSelectedEvent(ev)}
                className="w-full text-left border border-gray-100 rounded-xl p-3 bg-white hover:border-gray-200 transition-colors"
              >
                <p className="text-sm font-semibold text-gray-900 truncate">{ev.title}</p>
                <p className="text-[11px] text-gray-500 mt-1">{ev.type} · {ev.client?.name ?? 'Sem cliente'}</p>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 border-b border-gray-100 sticky top-0 bg-white z-10">
              {DAYS_MON.map((d, i) => (
                <div key={d} className="px-1.5 sm:px-3 py-2 text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide truncate">
                  <span className="hidden sm:inline">{d}</span>
                  <span className="sm:hidden">{DAYS_SHORT[i]}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7" style={{ gridAutoRows: mode === 'semana' ? 'minmax(320px, 1fr)' : 'minmax(120px, 1fr)' }}>
              {(mode === 'semana' ? weekCells : monthCells).map((cell, i) => (
                <DayCell key={`${cell.year}-${cell.month}-${cell.day}-${i}`} cell={cell} compact={mode === 'mes'} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detalhe do evento */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${TYPE_BAR[selectedEvent.type] || TYPE_BAR.OUTROS}`} />
                <span className="font-semibold text-gray-900 truncate">{selectedEvent.title}</span>
              </div>
              <button onClick={() => setSelectedEvent(null)} aria-label="Fechar" className="p-1 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-400 font-medium mb-1">TIPO</p>
                  <span className={`text-xs font-semibold ${TYPE_TEXT[selectedEvent.type]}`}>{selectedEvent.type}</span>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-medium mb-1">STATUS</p>
                  <select
                    value={selectedEvent.status}
                    onChange={(e) => updateStatus(selectedEvent.id, e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 outline-none focus:border-[#030A8C]"
                  >
                    <option value="PENDENTE">Pendente</option>
                    <option value="EM_ANDAMENTO">Em Andamento</option>
                    <option value="CONCLUIDO">Concluído</option>
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-medium mb-1">DATA</p>
                  <p className="text-xs text-gray-700">
                    {new Date(selectedEvent.startDate).toLocaleDateString('pt-BR')}
                    {selectedEvent.endDate && ` → ${new Date(selectedEvent.endDate).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                {selectedEvent.client && (
                  <div>
                    <p className="text-[10px] text-gray-400 font-medium mb-1">CLIENTE</p>
                    <p className="text-xs text-gray-700 flex items-center gap-1.5">{selectedEvent.client.name} <TierBadge tier={selectedEvent.client.tier} /></p>
                  </div>
                )}
                {selectedEvent.assignedUser && (
                  <div>
                    <p className="text-[10px] text-gray-400 font-medium mb-1">RESPONSÁVEL</p>
                    <p className="text-xs text-gray-700">{selectedEvent.assignedUser.name}</p>
                  </div>
                )}
              </div>
              {selectedEvent.description && (
                <div>
                  <p className="text-[10px] text-gray-400 font-medium mb-1">DESCRIÇÃO</p>
                  <p className="text-xs text-gray-500">{selectedEvent.description}</p>
                </div>
              )}
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => deleteEvent(selectedEvent.id)}
                className="w-full py-2 text-xs text-red-500 hover:bg-red-50 rounded-xl transition-colors font-medium"
              >
                Excluir evento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Novo evento */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#030A8C]" />
                <h3 className="font-semibold text-gray-900">Novo Evento</h3>
              </div>
              <button onClick={() => setShowForm(false)} aria-label="Fechar" className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Título *</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="input" placeholder="Nome do evento" autoFocus />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input">
                    <option value="ENTREGA">Entrega</option>
                    <option value="REUNIAO">Reunião</option>
                    <option value="PRAZO">Prazo</option>
                    <option value="OUTROS">Outros</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="input">
                    <option value="PENDENTE">Pendente</option>
                    <option value="EM_ANDAMENTO">Em Andamento</option>
                    <option value="CONCLUIDO">Concluído</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Data Início *</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Data Fim</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
                  <select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} className="input">
                    <option value="">Sem cliente</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Responsável</label>
                  <select value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))} className="input">
                    <option value="">Sem responsável</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2} className="input resize-none" placeholder="Detalhes do evento..." />
              </div>
            </div>
            <div className="flex gap-3 p-5 pt-0 justify-end">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={createEvent} disabled={!form.title || !form.startDate}
                className="px-4 py-2 text-sm bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50 transition-colors">
                Criar Evento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
