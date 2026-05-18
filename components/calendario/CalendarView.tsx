'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Calendar } from 'lucide-react'

interface CalEvent {
  id: string
  title: string
  description?: string | null
  startDate: string | Date
  endDate?: string | Date | null
  type: string
  status: string
  client?: { id: string; name: string } | null
  assignedUser?: { id: string; name: string } | null
}

interface Client { id: string; name: string }
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

const DAYS_MON = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Sunday=0 → shift to Monday=0
function toMonday(dayOfWeek: number) {
  return (dayOfWeek + 6) % 7
}

export default function CalendarView({
  initialEvents,
  clients,
  users,
}: {
  initialEvents: CalEvent[]
  clients: Client[]
  users: User[]
}) {
  const today = new Date()
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [events, setEvents] = useState(initialEvents)
  const [showForm, setShowForm] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [form, setForm] = useState({
    title: '', description: '', startDate: '', endDate: '',
    type: 'ENTREGA', clientId: '', assignedTo: '', status: 'PENDENTE',
  })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Monday-first: get offset
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const offset = toMonday(firstDayOfMonth)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  // Total cells (always 6 rows × 7 = 42)
  const totalCells = 42

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)) }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)) }
  function goToday() { setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1)) }

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

  function getEventsForDay(y: number, m: number, d: number) {
    return events.filter((ev) => {
      const evDate = new Date(ev.startDate)
      return evDate.getFullYear() === y && evDate.getMonth() === m && evDate.getDate() === d
    })
  }

  // Build cells array
  const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = []
  for (let i = 0; i < totalCells; i++) {
    if (i < offset) {
      const d = daysInPrevMonth - offset + i + 1
      const prevM = month === 0 ? 11 : month - 1
      const prevY = month === 0 ? year - 1 : year
      cells.push({ day: d, month: prevM, year: prevY, isCurrentMonth: false })
    } else if (i < offset + daysInMonth) {
      cells.push({ day: i - offset + 1, month, year, isCurrentMonth: true })
    } else {
      const d = i - offset - daysInMonth + 1
      const nextM = month === 11 ? 0 : month + 1
      const nextY = month === 11 ? year + 1 : year
      cells.push({ day: d, month: nextM, year: nextY, isCurrentMonth: false })
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">
            <span className="text-gray-900">{MONTHS[month]}</span>{' '}
            <span className="text-gray-400">{year}</span>
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
          >
            Hoje
          </button>
          <button
            onClick={() => { setForm((f) => ({ ...f, startDate: today.toISOString().split('T')[0] })); setShowForm(true) }}
            className="flex items-center gap-2 bg-[#030A8C] text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#02077a] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Criar evento
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-y-auto">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100 sticky top-0 bg-white z-10">
          {DAYS_MON.map((d) => (
            <div key={d} className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7" style={{ gridAutoRows: 'minmax(120px, 1fr)' }}>
          {cells.map((cell, i) => {
            const isToday = cell.isCurrentMonth &&
              today.getFullYear() === cell.year &&
              today.getMonth() === cell.month &&
              today.getDate() === cell.day
            const dayEvents = getEventsForDay(cell.year, cell.month, cell.day)
            const dateStr = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
            const isWeekend = (i % 7) >= 5

            return (
              <div
                key={i}
                onClick={() => openNewEvent(dateStr)}
                className={`border-b border-r border-gray-100 p-1.5 cursor-pointer transition-colors group ${
                  !cell.isCurrentMonth ? 'bg-gray-50' : isWeekend ? 'bg-gray-50/50' : 'bg-white'
                } hover:bg-gray-50`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold ${
                    isToday
                      ? 'bg-[#f59e0b] text-black'
                      : cell.isCurrentMonth
                      ? 'text-gray-700'
                      : 'text-gray-300'
                  }`}>
                    {cell.day}
                  </div>
                  {dayEvents.length > 0 && (
                    <Plus className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>

                <div className="space-y-0.5 overflow-hidden">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev) }}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate border cursor-pointer hover:brightness-95 transition-all ${TYPE_BG[ev.type] || TYPE_BG.OUTROS}`}
                    >
                      <span className={`w-1 h-1 rounded-full shrink-0 ${TYPE_BAR[ev.type] || TYPE_BAR.OUTROS}`} />
                      <span className={`truncate ${TYPE_TEXT[ev.type] || TYPE_TEXT.OUTROS}`}>{ev.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="text-[9px] text-gray-400 px-1">+{dayEvents.length - 3} mais</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Event detail panel */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${TYPE_BAR[selectedEvent.type] || TYPE_BAR.OUTROS}`} />
                <span className="font-semibold text-gray-900">{selectedEvent.title}</span>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
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
                    <p className="text-xs text-gray-700">{selectedEvent.client.name}</p>
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

      {/* New Event Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#030A8C]" />
                <h3 className="font-semibold text-gray-900">Novo Evento</h3>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Título *</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="input" placeholder="Nome do evento" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
