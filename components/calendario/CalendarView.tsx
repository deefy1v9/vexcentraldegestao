'use client'
import TierBadge from '@/components/ui/TierBadge'
import { calendarTone, CALENDAR_TONE_LABEL, type CalendarTone } from '@/lib/demandas-core'
import SearchSelect from '@/components/ui/SearchSelect'
import PlannerWizard from '@/components/calendario/PlannerWizard'
import PlannerConfigPanel from '@/components/calendario/PlannerConfigPanel'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Plus, X, Calendar, Filter, Sparkles, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Avatar, iniciais } from '@/components/vex/avatar'
import { Numero, Painel, Pilulas, Sobretitulo } from '@/components/vex/vireo'

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
  ENTREGA: 'bg-info',
  REUNIAO: 'bg-success',
  PRAZO: 'bg-destructive',
  OUTROS: 'bg-muted-foreground',
}

const TYPE_TEXT: Record<string, string> = {
  ENTREGA: 'text-info',
  REUNIAO: 'text-success',
  PRAZO: 'text-destructive-texto',
  OUTROS: 'text-muted-foreground',
}

/** Fichas de evento no padrão Vireo: fundo suave e filete à esquerda. */
const TYPE_BG: Record<string, string> = {
  ENTREGA: 'bg-info-suave border-info',
  REUNIAO: 'bg-success-suave border-success',
  PRAZO: 'bg-destructive-suave border-destructive',
  OUTROS: 'bg-secondary border-subtle',
}
const TYPE_BORDA: Record<string, string> = {
  ENTREGA: 'border-l-info', REUNIAO: 'border-l-success', PRAZO: 'border-l-destructive', OUTROS: 'border-l-subtle',
}

/** Cores das demandas pelo prazo: cinza padrão, amarelo a 2 dias,
 *  verde quando feita, vermelho quando atrasada (regra em calendarTone). */
const TONE_BG: Record<CalendarTone, string> = {
  normal: 'bg-secondary border-subtle text-foreground',
  proximo: 'bg-warning-suave border-warning text-warning',
  feito: 'bg-success-suave border-success text-success',
  atrasado: 'bg-destructive-suave border-destructive text-destructive-texto',
}
const TONE_DOT: Record<CalendarTone, string> = {
  normal: 'bg-subtle', proximo: 'bg-warning', feito: 'bg-success', atrasado: 'bg-destructive',
}
const TONE_PILL: Record<CalendarTone, string> = TONE_BG
const TONE_BORDA: Record<CalendarTone, string> = {
  normal: 'border-l-subtle', proximo: 'border-l-warning', feito: 'border-l-success', atrasado: 'border-l-destructive',
}

/** Quantas demandas cada pessoa tem no dia (e quantas atrasadas), da maior carga para a menor. */
function cargaPorPessoa(tasks: CalTask[]): Array<{ id: string; nome: string; total: number; atrasadas: number }> {
  const agora = new Date()
  const mapa = new Map<string, { id: string; nome: string; total: number; atrasadas: number }>()
  for (const t of tasks) {
    const id = t.assignee?.id ?? '__sem__'
    const atual = mapa.get(id) ?? { id, nome: t.assignee?.name ?? 'Não atribuído', total: 0, atrasadas: 0 }
    atual.total += 1
    if (calendarTone(t, agora) === 'atrasado') atual.atrasadas += 1
    mapa.set(id, atual)
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome))
}
/** Tom mais grave entre as demandas do dia (atrasado > próximo > normal > feito). */
function dayTone(tasks: CalTask[], now: Date): CalendarTone {
  const tones = tasks.map((t) => calendarTone(t, now))
  if (tones.includes('atrasado')) return 'atrasado'
  if (tones.includes('proximo')) return 'proximo'
  if (tones.length > 0 && tones.every((x) => x === 'feito')) return 'feito'
  return 'normal'
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
const STATUS_LABEL: Record<string, string> = { PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em Andamento', CONCLUIDO: 'Concluído' }

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
  canEdit = true,
}: {
  initialEvents: CalEvent[]
  initialTasks?: CalTask[]
  aiTaskIds?: string[]
  clients: Client[]
  users: User[]
  /** Colaborador só consulta: sem criar, mudar ou apagar eventos. */
  canEdit?: boolean
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
    if (!canEdit) return
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

  const dayISO = isoOf(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
  const dayTasks = tasksByDate.get(dayISO) ?? []
  const dayEvents = eventsByDate.get(dayISO) ?? []

  // Carga por pessoa no dia escolhido: conta as demandas já carregadas, sem consulta nova
  const cargaDoDia = cargaPorPessoa(dayTasks)
  const maiorCarga = Math.max(1, ...cargaDoDia.map((c) => c.total))
  const diaLongo = cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const diaEscolhido = diaLongo.charAt(0).toUpperCase() + diaLongo.slice(1)

  function DayCell({ cell, compact }: { cell: { day: number; month: number; year: number; isCurrentMonth: boolean }; compact: boolean }) {
    const iso = isoOf(cell.year, cell.month, cell.day)
    const isToday = iso === todayISO
    const isSelected = iso === dayISO
    const dayTasks = tasksByDate.get(iso) ?? []
    const dayEvents = eventsByDate.get(iso) ?? []
    const total = dayTasks.length + dayEvents.length
    const overloaded = dayTasks.length > capacity
    const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay()
    const isWeekend = weekday === 0 || weekday === 6
    const limit = compact ? 3 : 12
    // Sem cliente escolhido a grade fica limpa: só quantos itens tem no dia.
    // Com cliente, cada post/entrega aparece no seu dia.
    const detalhado = !!filters.clientId
    const abrirDia = (e: React.MouseEvent) => { e.stopPropagation(); setCursor(new Date(cell.year, cell.month, cell.day)); setMode('dia') }
    const escolherDia = (e: React.MouseEvent) => { e.stopPropagation(); setCursor(new Date(cell.year, cell.month, cell.day)) }
    const carga = cargaPorPessoa(dayTasks)

    return (
      <div
        onClick={() => openNewEvent(iso)}
        className={`relative border-b border-r border-border p-2 transition-colors group ${canEdit ? 'cursor-pointer' : ''} ${
          !cell.isCurrentMonth ? 'bg-secondary/50' : isWeekend ? 'bg-secondary/25' : 'bg-card'
        } ${isToday ? 'bg-marca-suave/40' : ''} hover:bg-secondary/60`}
      >
        {isSelected && <span aria-hidden className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-marca/50" />}
        <div className="flex items-start justify-between mb-1.5 gap-1">
          <button
            type="button"
            onClick={escolherDia}
            title="Ver este dia no painel"
            aria-label={`Escolher o dia ${cell.day}`}
            className={`w-7 h-7 flex items-center justify-center rounded-full text-[12.5px] font-semibold shrink-0 tabular transition-colors ${
              isToday ? 'bg-marca text-white' : cell.isCurrentMonth ? 'text-foreground hover:bg-secondary' : 'text-subtle hover:bg-secondary'
            }`}
          >
            {cell.day}
          </button>
          <div className="flex items-center gap-1">
            {total > 0 && (
              <span
                className={`hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular ${
                  overloaded ? 'bg-destructive-suave text-destructive-texto' : 'bg-secondary text-muted-foreground'
                }`}
                title={`${dayTasks.length} demanda(s) · capacidade ${capacity}`}
              >
                {overloaded && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />}
                {total}
              </span>
            )}
            <Plus className="w-3 h-3 text-subtle opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        </div>

        {!detalhado && total > 0 && (
          <button type="button" onClick={abrirDia} className="w-full text-left space-y-1" title="Ver o dia">
            {dayTasks.length > 0 && (
              <span
                className={`block text-[11px] font-semibold rounded-md border-l-[3px] px-1 sm:px-2 py-1 truncate ${TONE_PILL[dayTone(dayTasks, today)]}`}
                title={carga.map((c) => `${c.nome}: ${c.total}`).join(' · ')}
              >
                {dayTasks.length}<span className="hidden sm:inline"> demanda{dayTasks.length === 1 ? '' : 's'}</span>
              </span>
            )}
            {dayTasks.length > 0 && carga.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {carga.slice(0, compact ? 3 : 8).map((c) => (
                  <span key={c.id} title={`${c.nome}: ${c.total} demanda(s)`} className="inline-flex items-center gap-0.5 h-[18px] pl-0.5 pr-1.5 rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground tabular">
                    <span className="w-[14px] h-[14px] rounded-full bg-card text-[8px] font-bold grid place-items-center text-foreground">{iniciais(c.nome)}</span>
                    {c.total}
                  </span>
                ))}
                {carga.length > (compact ? 3 : 8) && <span className="text-[10px] text-muted-foreground">+{carga.length - (compact ? 3 : 8)}</span>}
              </span>
            )}
            {dayEvents.length > 0 && (
              <span className="block text-[11px] font-semibold text-muted-foreground bg-secondary rounded-md border-l-[3px] border-subtle px-1 sm:px-2 py-1 truncate">
                {dayEvents.length}<span className="hidden sm:inline"> evento{dayEvents.length === 1 ? '' : 's'}</span>
              </span>
            )}
          </button>
        )}

        {detalhado && <div className="space-y-1 overflow-hidden">
          {dayTasks.slice(0, limit).map((t) => (
            <div
              key={t.id}
              onClick={(e) => { e.stopPropagation(); router.push(`/demandas/${t.id}`) }}
              title={`${t.title} · ${TASK_LABEL[t.status] ?? t.status} · ${CALENDAR_TONE_LABEL[calendarTone(t, today)]}`}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border-l-[3px] text-[10.5px] font-medium truncate cursor-pointer hover:brightness-95 transition-all ${TONE_BG[calendarTone(t, today)]}`}
            >
              {aiSet.has(t.id) && <Sparkles className="w-2.5 h-2.5 shrink-0 text-ia" />}
              {t.client?.operationalGroup && (
                <span className="text-[8px] font-bold opacity-70 shrink-0">{t.client.operationalGroup}</span>
              )}
              <span className="truncate">{t.title.replace(/^[^·]+· /, '')}</span>
              {t.contentType && <span className="text-[8px] opacity-70 shrink-0">· {t.contentType}</span>}
            </div>
          ))}
          {dayEvents.slice(0, Math.max(0, limit - dayTasks.length)).map((ev) => (
            <div
              key={ev.id}
              onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev) }}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border-l-[3px] text-[10.5px] font-medium truncate cursor-pointer hover:brightness-95 transition-all ${TYPE_BG[ev.type] || TYPE_BG.OUTROS}`}
            >
              <span className={`truncate ${TYPE_TEXT[ev.type] || TYPE_TEXT.OUTROS}`}>{ev.title}</span>
            </div>
          ))}
          {total > limit && (
            <p className="text-[10px] text-muted-foreground px-1">+{total - limit} mais</p>
          )}
        </div>}
      </div>
    )
  }

  const toolbarBtn = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold transition-colors'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 sm:p-6 lg:px-8 grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)] items-start">
        {/* Painel lateral: o dia escolhido, a carga por pessoa e a legenda */}
        <aside className="space-y-5 order-2 xl:order-1 xl:sticky xl:top-4">
          <Painel rotulo="Dia escolhido" titulo={diaEscolhido}>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
                <p className="t-meta">Demandas</p>
                <Numero className="text-[22px]" alerta={dayTasks.length > capacity}>{dayTasks.length}</Numero>
              </div>
              <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
                <p className="t-meta">Eventos</p>
                <Numero className="text-[22px]">{dayEvents.length}</Numero>
              </div>
            </div>
            {dayTasks.length > capacity && (
              <p className="mt-2 text-[11px] font-semibold text-destructive-texto bg-destructive-suave px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Acima da capacidade ({capacity}/dia)
              </p>
            )}

            <Sobretitulo className="mt-5 mb-2">Carga por pessoa</Sobretitulo>
            {cargaDoDia.length === 0 ? (
              <p className="t-legenda">Nenhuma demanda neste dia.</p>
            ) : (
              <ul className="space-y-2.5">
                {cargaDoDia.map((c) => (
                  <li key={c.id}>
                    <div className="flex items-center gap-2">
                      <Avatar nome={c.nome} tamanho="sm" className="w-6 h-6 text-[10px]" />
                      <span className="t-corpo text-foreground truncate flex-1">{c.nome}</span>
                      <span className="t-rotulo font-semibold text-foreground tabular">{c.total}</span>
                    </div>
                    <div className="mt-1 ml-8 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className={`h-full rounded-full ${c.atrasadas > 0 ? 'bg-destructive' : 'bg-info'}`} style={{ width: `${(c.total / maiorCarga) * 100}%` }} />
                    </div>
                    {c.atrasadas > 0 && <p className="ml-8 mt-0.5 text-[10.5px] text-destructive-texto">{c.atrasadas} atrasada(s)</p>}
                  </li>
                ))}
              </ul>
            )}

            {(dayTasks.length > 0 || dayEvents.length > 0) && mode !== 'dia' && (
              <Button variant="outline" size="sm" className="w-full mt-5" onClick={() => setMode('dia')}>
                Ver o dia <ChevronRight />
              </Button>
            )}
          </Painel>

          <Painel rotulo="Legenda" titulo="Cores do calendário">
            <ul className="space-y-2">
              {(Object.keys(CALENDAR_TONE_LABEL) as CalendarTone[]).map((k) => (
                <li key={k} className="flex items-center gap-2 t-corpo text-foreground">
                  <span className={`w-2.5 h-2.5 rounded-full ${TONE_DOT[k]}`} /> {CALENDAR_TONE_LABEL[k]}
                </li>
              ))}
              <li className="flex items-center gap-2 t-corpo text-foreground"><Sparkles className="w-3 h-3 text-ia" /> criada pela IA</li>
              <li className="flex items-center gap-2 t-corpo text-foreground"><span className="text-[11px] font-bold">A/B</span> grupo operacional</li>
            </ul>
          </Painel>
        </aside>

        {/* Calendário */}
        <section className="order-1 xl:order-2 rounded-[24px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-6 pt-5 pb-4">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => move(-1)} aria-label="Período anterior" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={goToday}
                  className={`${toolbarBtn} border-border text-foreground hover:bg-secondary`}
                >
                  Hoje
                </button>
                <button onClick={() => move(1)} aria-label="Próximo período" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <h2 className="font-display text-[22px] sm:text-[26px] font-semibold tracking-[-0.02em] text-foreground truncate">{periodLabel}</h2>
            </div>

            <Pilulas
              rotulo="Visão do calendário"
              valor={mode}
              aoMudar={setMode}
              opcoes={[{ valor: 'mes', rotulo: 'Mês' }, { valor: 'semana', rotulo: 'Semana' }, { valor: 'dia', rotulo: 'Dia' }]}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap px-4 sm:px-6 pb-4">
            {/* Cliente em destaque: com cliente, o dia mostra cada entrega;
                sem cliente, só a quantidade por dia */}
            <SearchSelect
              options={clients}
              value={filters.clientId}
              onChange={(id) => setFilters((f) => ({ ...f, clientId: id }))}
              placeholder="Todos os clientes"
              allLabel="Todos os clientes (só quantidades)"
              searchPlaceholder="Buscar cliente"
              shortLabel={false}
            />
            <button
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className={`${toolbarBtn} ${activeFilters > 0 ? 'border-marca bg-marca-suave text-marca-texto' : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filtros</span>
              {activeFilters > 0 && <span className="text-[10px] font-bold">{activeFilters}</span>}
            </button>

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {canEdit && <PlannerConfigPanel onCapacity={setCapacity} />}
              {canEdit && <PlannerWizard clients={clients} onCreated={() => router.refresh()} />}
              {canEdit && (
                <Button size="sm" onClick={() => { setForm((f) => ({ ...f, startDate: todayISO })); setShowForm(true) }}>
                  <Plus />
                  <span className="hidden sm:inline">Evento</span>
                </Button>
              )}
            </div>
          </div>

          {/* Filtros */}
          {showFilters && (
            <div className="mx-4 sm:mx-6 mb-4 p-3 rounded-2xl border border-border bg-secondary/40">
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
                <label className="flex items-center gap-2 text-xs text-foreground px-1">
                  <input type="checkbox" checked={filters.onlyAi} onChange={(e) => setFilters((f) => ({ ...f, onlyAi: e.target.checked }))} />
                  Criadas pela IA
                </label>
              </div>
              {activeFilters > 0 && (
                <button
                  onClick={() => setFilters({ clientId: '', userId: '', status: '', priority: '', service: '', onlyAi: false })}
                  className="mt-2 text-[11px] font-semibold text-marca-texto hover:underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {/* Grade */}
          {mode === 'dia' ? (
            <div className="px-4 sm:px-6 pb-6 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
                <p className="t-secao text-foreground">
                  {dayTasks.length} demanda(s) · {dayEvents.length} evento(s)
                </p>
                {dayTasks.length > capacity && (
                  <span className="text-[11px] font-semibold text-destructive-texto bg-destructive-suave px-2 py-1 rounded-lg flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Acima da capacidade ({capacity}/dia)
                  </span>
                )}
              </div>
              {dayTasks.length === 0 && dayEvents.length === 0 && (
                <p className="t-corpo text-muted-foreground text-center py-12">Nada agendado neste dia.</p>
              )}
              {dayTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => router.push(`/demandas/${t.id}`)}
                  className={`w-full text-left rounded-2xl border border-border border-l-[3px] p-3.5 bg-card hover:bg-secondary/40 transition-colors ${TONE_BORDA[calendarTone(t, today)]}`}
                >
                  <p className="t-corpo font-semibold text-foreground flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${TONE_DOT[calendarTone(t, today)]}`} title={CALENDAR_TONE_LABEL[calendarTone(t, today)]} />
                    {aiSet.has(t.id) && <Sparkles className="w-3.5 h-3.5 text-ia shrink-0" />}
                    <span className="truncate">#{t.number} {t.title}</span>
                  </p>
                  <p className="t-legenda mt-1">
                    {t.client?.name ?? 'Sem cliente'} · {TASK_LABEL[t.status] ?? t.status} · {t.assignee?.name ?? 'Não atribuído'}
                  </p>
                </button>
              ))}
              {dayEvents.map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => setSelectedEvent(ev)}
                  className={`w-full text-left rounded-2xl border border-border border-l-[3px] p-3.5 bg-card hover:bg-secondary/40 transition-colors ${TYPE_BORDA[ev.type] || TYPE_BORDA.OUTROS}`}
                >
                  <p className="t-corpo font-semibold text-foreground truncate">{ev.title}</p>
                  <p className="t-legenda mt-1">{ev.type} · {ev.client?.name ?? 'Sem cliente'}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="mx-4 sm:mx-6 mb-6 rounded-2xl border border-border overflow-hidden">
              <div className="grid grid-cols-7 border-b border-border bg-secondary/60">
                {DAYS_MON.map((d, i) => (
                  <div key={d} className="px-1.5 sm:px-3 py-2.5 text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.1em] text-center truncate">
                    <span className="hidden sm:inline">{DAYS_SHORT[i]}</span>
                    <span className="sm:hidden">{DAYS_SHORT[i].slice(0, 1)}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 -mr-px -mb-px" style={{ gridAutoRows: mode === 'semana' ? 'minmax(320px, auto)' : 'minmax(118px, auto)' }}>
                {(mode === 'semana' ? weekCells : monthCells).map((cell, i) => (
                  <DayCell key={`${cell.year}-${cell.month}-${cell.day}-${i}`} cell={cell} compact={mode === 'mes'} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
      {/* Detalhe do evento */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-veu flex items-center justify-center z-50 p-4" onClick={() => setSelectedEvent(null)}>
          <div className="bg-card border border-border rounded-[24px] w-full max-w-md max-h-[90dvh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${TYPE_BAR[selectedEvent.type] || TYPE_BAR.OUTROS}`} />
                <span className="font-semibold text-foreground truncate">{selectedEvent.title}</span>
              </div>
              <button onClick={() => setSelectedEvent(null)} aria-label="Fechar" className="p-1 hover:bg-secondary rounded-lg transition-colors shrink-0">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">TIPO</p>
                  <span className={`text-xs font-semibold ${TYPE_TEXT[selectedEvent.type]}`}>{selectedEvent.type}</span>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">STATUS</p>
                  {canEdit ? (
                    <select
                      value={selectedEvent.status}
                      onChange={(e) => updateStatus(selectedEvent.id, e.target.value)}
                      className="w-full bg-card border border-border rounded-lg px-2 py-1 text-xs text-foreground outline-none focus:border-marca"
                    >
                      <option value="PENDENTE">Pendente</option>
                      <option value="EM_ANDAMENTO">Em Andamento</option>
                      <option value="CONCLUIDO">Concluído</option>
                    </select>
                  ) : (
                    <p className="text-xs text-foreground">{STATUS_LABEL[selectedEvent.status] ?? selectedEvent.status}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">DATA</p>
                  <p className="text-xs text-foreground">
                    {new Date(selectedEvent.startDate).toLocaleDateString('pt-BR')}
                    {selectedEvent.endDate && ` → ${new Date(selectedEvent.endDate).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                {selectedEvent.client && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">CLIENTE</p>
                    <p className="text-xs text-foreground flex items-center gap-1.5">{selectedEvent.client.name} <TierBadge tier={selectedEvent.client.tier} /></p>
                  </div>
                )}
                {selectedEvent.assignedUser && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">RESPONSÁVEL</p>
                    <p className="text-xs text-foreground">{selectedEvent.assignedUser.name}</p>
                  </div>
                )}
              </div>
              {selectedEvent.description && (
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">DESCRIÇÃO</p>
                  <p className="text-xs text-muted-foreground">{selectedEvent.description}</p>
                </div>
              )}
            </div>
            {canEdit && (
              <div className="px-5 pb-5">
                <button
                  onClick={() => deleteEvent(selectedEvent.id)}
                  className="w-full py-2 text-xs text-destructive-texto hover:bg-destructive-suave rounded-xl transition-colors font-medium"
                >
                  Excluir evento
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Novo evento */}
      {showForm && (
        <div className="fixed inset-0 bg-veu flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-[24px] w-full max-w-lg max-h-[90dvh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-marca-texto" />
                <h3 className="font-semibold text-foreground">Novo Evento</h3>
              </div>
              <button onClick={() => setShowForm(false)} aria-label="Fechar" className="p-1 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Título *</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="input" placeholder="Nome do evento" autoFocus />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input">
                    <option value="ENTREGA">Entrega</option>
                    <option value="REUNIAO">Reunião</option>
                    <option value="PRAZO">Prazo</option>
                    <option value="OUTROS">Outros</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="input">
                    <option value="PENDENTE">Pendente</option>
                    <option value="EM_ANDAMENTO">Em Andamento</option>
                    <option value="CONCLUIDO">Concluído</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Data Início *</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Data Fim</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Cliente</label>
                  <select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} className="input">
                    <option value="">Sem cliente</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Responsável</label>
                  <select value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))} className="input">
                    <option value="">Sem responsável</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Descrição</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2} className="input resize-none" placeholder="Detalhes do evento..." />
              </div>
            </div>
            <div className="flex gap-3 p-5 pt-0 justify-end">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-secondary/60 transition-colors">
                Cancelar
              </button>
              <button onClick={createEvent} disabled={!form.title || !form.startDate}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors">
                Criar Evento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
