'use client'
import { useState, useRef } from 'react'
import {
  Plus, X, MessageSquare, Calendar, Pencil, Save, Paperclip, Download, Trash2,
  ImageIcon, FileText, File, Link2, Eye, CalendarCheck, Send, CheckCircle2, AlertTriangle, History,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import TierBadge from '@/components/ui/TierBadge'

type TaskStatus = 'BACKLOG' | 'TODO' | 'EM_ANDAMENTO' | 'EM_REVISAO' | 'APROVADO' | 'CONCLUIDO'
type TaskPriority = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'

interface UserRef { id: string; name: string }

interface Task {
  id: string
  title: string
  description?: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate?: Date | string | null
  platform?: string | null
  driveLink?: string | null
  tags: string[]
  client?: { id: string; name: string; tier?: string | null } | null
  assignee?: UserRef | null
  producer?: UserRef | null
  reviewer?: UserRef | null
  scheduler?: UserRef | null
  creator: UserRef
  scheduledFor?: Date | string | null
  scheduledPlatform?: string | null
  publicationLink?: string | null
  _count: { comments: number }
}

interface TaskEvent {
  id: string
  kind: string
  detail: string
  createdAt: string
  user?: UserRef | null
}

interface Client { id: string; name: string }
interface User { id: string; name: string }

const COLUMNS: { key: TaskStatus; label: string; color: string; bg: string; dot: string }[] = [
  { key: 'BACKLOG',      label: 'Backlog',                  color: 'text-gray-500',   bg: 'bg-gray-100',  dot: 'bg-gray-400' },
  { key: 'TODO',         label: 'A Fazer',                  color: 'text-blue-600',   bg: 'bg-blue-50',   dot: 'bg-blue-500' },
  { key: 'EM_ANDAMENTO', label: 'Em Andamento',             color: 'text-orange-600', bg: 'bg-orange-50', dot: 'bg-orange-500' },
  { key: 'EM_REVISAO',   label: 'Em Revisão',               color: 'text-purple-600', bg: 'bg-purple-50', dot: 'bg-purple-500' },
  { key: 'APROVADO',     label: 'Aprovado p/ Agendamento',  color: 'text-teal-600',   bg: 'bg-teal-50',   dot: 'bg-teal-500' },
  { key: 'CONCLUIDO',    label: 'Concluído',                color: 'text-green-600',  bg: 'bg-green-50',  dot: 'bg-green-500' },
]

const PLATFORMS = ['Instagram', 'LinkedIn', 'Facebook', 'Site', 'Outra']

const DAY = 24 * 60 * 60 * 1000

/** Prazos derivados da data final: produção D-2, revisão D-1. */
function deadlines(dueDate?: Date | string | null) {
  if (!dueDate) return null
  const due = new Date(dueDate as string)
  return {
    production: new Date(due.getTime() - 2 * DAY),
    review: new Date(due.getTime() - 1 * DAY),
    final: due,
  }
}

function daysLeft(date?: Date | string | null): number | null {
  if (!date) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(date as string); d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / DAY)
}

function isLate(task: Task): boolean {
  const left = daysLeft(task.dueDate)
  return left != null && left < 0 && task.status !== 'CONCLUIDO'
}

/** Peso do grupo do cliente na ordenação (Scale > Growth > Start). */
function tierWeight(tier?: string | null): number {
  return tier === 'SCALE' ? 3 : tier === 'GROWTH' ? 2 : tier === 'START' ? 1 : 0
}

/**
 * Ordenação dentro da coluna: 1) atrasadas, 2) vencimento mais próximo,
 * 3) grupo do cliente (Scale > Growth > Start), 4) prioridade manual.
 * O prazo sempre vence a segmentação — Start atrasada vem antes de Scale
 * sem urgência.
 */
function compareTasks(a: Task, b: Task): number {
  const lateA = isLate(a) ? 1 : 0
  const lateB = isLate(b) ? 1 : 0
  if (lateA !== lateB) return lateB - lateA

  const dueA = a.dueDate ? new Date(a.dueDate as string).getTime() : Infinity
  const dueB = b.dueDate ? new Date(b.dueDate as string).getTime() : Infinity
  if (dueA !== dueB) return dueA - dueB

  const tw = tierWeight(b.client?.tier) - tierWeight(a.client?.tier)
  if (tw !== 0) return tw

  const PRIO: Record<TaskPriority, number> = { URGENTE: 3, ALTA: 2, MEDIA: 1, BAIXA: 0 }
  return PRIO[b.priority] - PRIO[a.priority]
}

/** Próxima ação da demanda, para o card e a lista "Minhas Demandas". */
function nextAction(task: Task): string {
  const dl = deadlines(task.dueDate)
  switch (task.status) {
    case 'BACKLOG':
    case 'TODO':
    case 'EM_ANDAMENTO':
      return dl ? `Produzir até ${formatDate(dl.production)}` : 'Produzir e enviar para revisão'
    case 'EM_REVISAO':
      return dl ? `Revisar até ${formatDate(dl.review)}` : 'Aguardando revisão'
    case 'APROVADO':
      return dl ? `Agendar até ${formatDate(dl.final)}` : 'Confirmar agendamento'
    case 'CONCLUIDO':
      return 'Concluída'
  }
}

const PRIORITY_CONFIG: Record<TaskPriority, { dot: string; bg: string; text: string; label: string }> = {
  BAIXA:   { dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700',  label: 'Baixa' },
  MEDIA:   { dot: 'bg-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Média' },
  ALTA:    { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', label: 'Alta' },
  URGENTE: { dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-700',    label: 'Urgente' },
}

export default function KanbanBoard({
  initialTasks,
  clients,
  users,
  currentUserId,
  isAdmin,
}: {
  initialTasks: Task[]
  clients: Client[]
  users: User[]
  currentUserId: string
  isAdmin: boolean
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [selectedUserId, setSelectedUserId] = useState<string>(isAdmin ? 'all' : currentUserId)
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [priorityTouched, setPriorityTouched] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [comments, setComments] = useState<{ id: string; content: string; user: { name: string }; createdAt: string }[]>([])
  const [attachments, setAttachments] = useState<{ id: string; fileName: string; fileUrl: string; fileSize: number; fileType: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [newTaskFiles, setNewTaskFiles] = useState<File[]>([])
  const newTaskFileInputRef = useRef<HTMLInputElement>(null)
  const [newComment, setNewComment] = useState('')
  const [showNewForm, setShowNewForm] = useState<TaskStatus | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskClient, setNewTaskClient] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState(isAdmin ? '' : currentUserId)
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('MEDIA')
  const [newTaskDue, setNewTaskDue] = useState('')

  // Edit mode state
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: 'BACKLOG' as TaskStatus,
    priority: 'MEDIA' as TaskPriority,
    dueDate: '',
    clientId: '',
    assigneeId: '',
    platform: '',
    producerId: '',
    reviewerId: '',
    schedulerId: '',
  })
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)

  // Fluxo produção → revisão → agendamento
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [flowError, setFlowError] = useState<string | null>(null)
  const [flowBusy, setFlowBusy] = useState(false)
  const [driveLinkInput, setDriveLinkInput] = useState('')
  const [reviewNoteInput, setReviewNoteInput] = useState('')
  const [showAdjustForm, setShowAdjustForm] = useState(false)
  const [adjustNote, setAdjustNote] = useState('')
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ date: '', time: '', platform: '', publicationLink: '', note: '' })
  const [showHistory, setShowHistory] = useState(false)
  const [newTaskPlatform, setNewTaskPlatform] = useState('')

  const dragRef = useRef<string | null>(null)

  /** Aplica o retorno de uma ação de fluxo ao estado local. */
  function applyTaskUpdate(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))
    setSelectedTask((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev))
  }

  async function refreshEvents(taskId: string) {
    const res = await fetch(`/api/demandas/${taskId}`)
    if (res.ok) {
      const data = await res.json()
      setEvents(data.events || [])
    }
  }

  const visibleTasks = (selectedUserId === 'all'
    ? tasks
    : tasks.filter((t) => t.assignee?.id === selectedUserId || (!t.assignee && selectedUserId === currentUserId))
  ).filter((t) => tierFilter === 'all' || t.client?.tier === tierFilter)

  function openTask(task: Task) {
    setSelectedTask(task)
    setEditMode(false)
    setFlowError(null)
    setDriveLinkInput(task.driveLink || '')
    setReviewNoteInput('')
    setShowAdjustForm(false)
    setAdjustNote('')
    setShowScheduleForm(false)
    setScheduleForm({ date: '', time: '', platform: task.platform || '', publicationLink: '', note: '' })
    setShowHistory(false)
    setEvents([])
    fetch(`/api/demandas/${task.id}`)
      .then((r) => r.json())
      .then((data) => {
        setComments(data.comments || [])
        setAttachments(data.attachments || [])
        setEvents(data.events || [])
        if (data.driveLink) setDriveLinkInput(data.driveLink)
        applyTaskUpdate(data)
      })
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedTask || !e.target.files?.[0]) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', e.target.files[0])
    const res = await fetch(`/api/demandas/${selectedTask.id}/attachments`, {
      method: 'POST',
      body: formData,
    })
    if (res.ok) {
      const att = await res.json()
      setAttachments((prev) => [...prev, att])
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function deleteAttachment(attachmentId: string) {
    if (!selectedTask) return
    await fetch(`/api/demandas/${selectedTask.id}/attachments`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachmentId }),
    })
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
  }

  function getFileIcon(fileType: string) {
    if (fileType.startsWith('image/')) return ImageIcon
    if (fileType.includes('pdf') || fileType.includes('text')) return FileText
    return File
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function startEdit(task: Task) {
    setEditForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? new Date(task.dueDate as string).toISOString().split('T')[0] : '',
      clientId: task.client?.id || '',
      assigneeId: task.assignee?.id || '',
      platform: task.platform || '',
      producerId: task.producer?.id || '',
      reviewerId: task.reviewer?.id || '',
      schedulerId: task.scheduler?.id || '',
    })
    setEditMode(true)
  }

  async function saveTask() {
    if (!selectedTask || !editForm.title.trim()) return
    setSaving(true)
    const payload: Record<string, unknown> = {
      title: editForm.title,
      description: editForm.description || null,
      priority: editForm.priority,
      dueDate: editForm.dueDate || null,
      clientId: editForm.clientId || null,
      assigneeId: editForm.assigneeId || null,
      platform: editForm.platform || null,
      producerId: editForm.producerId || null,
      reviewerId: editForm.reviewerId || null,
      schedulerId: editForm.schedulerId || null,
    }
    // Status só entra se mudou — mudanças de etapa passam pela validação do fluxo
    if (editForm.status !== selectedTask.status) payload.status = editForm.status

    const res = await fetch(`/api/demandas/${selectedTask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const updated = await res.json()
      setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, ...updated } : t)))
      setSelectedTask((prev) => prev ? { ...prev, ...updated } : prev)
      setEditMode(false)
    } else {
      const body = await res.json().catch(() => ({}))
      alert(body.error || 'Não foi possível salvar.')
    }
    setSaving(false)
  }

  async function createTask(status: TaskStatus) {
    if (!newTaskTitle.trim() || creating) return
    setCreating(true)
    const res = await fetch('/api/demandas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTaskTitle,
        description: newTaskDesc || null,
        status,
        // Prioridade não escolhida explicitamente: o backend herda do grupo
        // do cliente (Scale → alta)
        priority: priorityTouched ? newTaskPriority : null,
        clientId: newTaskClient || null,
        // Sem responsável indicado, o backend usa o produtor padrão (Igor)
        assigneeId: newTaskAssignee || null,
        dueDate: newTaskDue || null,
        platform: newTaskPlatform || null,
      }),
    })
    if (res.ok) {
      const task = await res.json()
      setTasks((prev) => [task, ...prev])
      for (const file of newTaskFiles) {
        const fd = new FormData()
        fd.append('file', file)
        await fetch(`/api/demandas/${task.id}/attachments`, { method: 'POST', body: fd })
      }
      resetForm()
    }
    setCreating(false)
  }

  function resetForm() {
    setNewTaskTitle('')
    setNewTaskDesc('')
    setNewTaskClient('')
    setNewTaskAssignee(isAdmin ? '' : currentUserId)
    setNewTaskPriority('MEDIA')
    setPriorityTouched(false)
    setNewTaskDue('')
    setNewTaskPlatform('')
    setNewTaskFiles([])
    setShowNewForm(null)
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus, overrideReason?: string) {
    const res = await fetch(`/api/demandas/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrideReason ? { status, overrideReason } : { status }),
    })
    if (res.ok) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)))
      if (selectedTask?.id === taskId) setSelectedTask((p) => p ? { ...p, status } : p)
      return
    }
    // Backend recusou: fluxo exige ação própria (ou justificativa de admin)
    const body = await res.json().catch(() => ({}))
    if (body.needsOverride && isAdmin) {
      const reason = prompt(`${body.error}\n\nJustificativa (fica registrada no histórico):`)
      if (reason?.trim()) return updateTaskStatus(taskId, status, reason.trim())
      return
    }
    alert(body.error || 'Movimento não permitido pelo fluxo da demanda.')
  }

  /* ------------------- ações do fluxo produção/revisão/agendamento ------------------- */

  async function flowAction(url: string, payload: Record<string, unknown>) {
    if (!selectedTask) return
    setFlowBusy(true)
    setFlowError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFlowError(body.error || 'Não foi possível concluir a ação.')
        return
      }
      applyTaskUpdate(body)
      refreshEvents(selectedTask.id)
      setShowAdjustForm(false)
      setAdjustNote('')
      setShowScheduleForm(false)
      setReviewNoteInput('')
    } catch {
      setFlowError('Falha de conexão. Tente de novo.')
    } finally {
      setFlowBusy(false)
    }
  }

  const sendToReview = () => selectedTask && flowAction(
    `/api/demandas/${selectedTask.id}/enviar-revisao`,
    { driveLink: driveLinkInput, note: reviewNoteInput },
  )
  const approve = () => selectedTask && flowAction(
    `/api/demandas/${selectedTask.id}/revisar`,
    { action: 'aprovar', note: reviewNoteInput },
  )
  const requestAdjustments = () => selectedTask && flowAction(
    `/api/demandas/${selectedTask.id}/revisar`,
    { action: 'ajustes', note: adjustNote },
  )
  const confirmSchedule = () => selectedTask && flowAction(
    `/api/demandas/${selectedTask.id}/agendar`,
    scheduleForm,
  )

  async function deleteTask(taskId: string) {
    if (!confirm('Remover esta demanda?')) return
    await fetch(`/api/demandas/${taskId}`, { method: 'DELETE' })
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    setSelectedTask(null)
  }

  async function sendComment() {
    if (!newComment.trim() || !selectedTask) return
    const res = await fetch(`/api/demandas/${selectedTask.id}/comentarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newComment }),
    })
    if (res.ok) {
      const comment = await res.json()
      setComments((prev) => [...prev, comment])
      setTasks((prev) => prev.map((t) =>
        t.id === selectedTask.id ? { ...t, _count: { comments: t._count.comments + 1 } } : t
      ))
      setNewComment('')
    }
  }

  /**
   * Minhas Demandas: demandas em que o usuário tem papel na etapa atual.
   * O prazo mostrado é o do papel dele (produção D-2, revisão D-1, entrega D).
   */
  const myTasks = tasks
    .filter((t) => t.status !== 'CONCLUIDO')
    .map((t) => {
      const dl = deadlines(t.dueDate)
      const inProduction = ['BACKLOG', 'TODO', 'EM_ANDAMENTO'].includes(t.status)
      let myRole: string | null = null
      let myDeadline: Date | null = null
      if (inProduction && t.producer?.id === currentUserId) { myRole = 'Produzir'; myDeadline = dl?.production ?? null }
      else if (t.status === 'EM_REVISAO' && t.reviewer?.id === currentUserId) { myRole = 'Revisar'; myDeadline = dl?.review ?? null }
      else if (t.status === 'APROVADO' && t.scheduler?.id === currentUserId) { myRole = 'Agendar'; myDeadline = dl?.final ?? null }
      else if (t.assignee?.id === currentUserId) { myRole = 'Atuar'; myDeadline = dl?.final ?? null }
      return { task: t, myRole, myDeadline, waiting: t.assignee?.id === currentUserId }
    })
    .filter((x) => x.myRole !== null)
    .sort((a, b) => (a.myDeadline?.getTime() ?? Infinity) - (b.myDeadline?.getTime() ?? Infinity))

  const myLate = myTasks.filter((x) => isLate(x.task)).length
  const myWaiting = myTasks.filter((x) => x.waiting).length

  return (
    <>
      {/* Minhas Demandas — resumo pessoal, aberto por padrão para o colaborador */}
      {myTasks.length > 0 && (
        <div className="px-6 pt-4">
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-900 text-sm">Minhas Demandas</p>
              <div className="flex items-center gap-2 text-[11px]">
                {myLate > 0 && (
                  <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">{myLate} atrasada(s)</span>
                )}
                <span className="bg-[#030A8C]/10 text-[#030A8C] px-2 py-0.5 rounded-full font-semibold">{myWaiting} aguardando ação</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50 max-h-[180px] overflow-y-auto">
              {myTasks.map(({ task, myRole, myDeadline }) => {
                const left = daysLeft(myDeadline)
                const late = isLate(task)
                return (
                  <button
                    key={task.id}
                    onClick={() => openTask(task)}
                    className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${late ? 'bg-red-500' : PRIORITY_CONFIG[task.priority].dot}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{task.title}</p>
                        <p className="text-[10px] text-gray-400 truncate">
                          {task.client?.name ? `${task.client.name} · ` : ''}
                          {COLUMNS.find((c) => c.key === task.status)?.label}
                          {task.dueDate ? ` · final ${formatDate(task.dueDate as string)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className={`text-[11px] font-semibold ${late ? 'text-red-600' : 'text-[#030A8C]'}`}>
                        {myRole}{myDeadline ? ` até ${formatDate(myDeadline)}` : ''}
                      </p>
                      {left != null && (
                        <p className={`text-[10px] ${left < 0 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                          {left < 0 ? `${Math.abs(left)} dia(s) de atraso` : left === 0 ? 'vence hoje' : `${left} dia(s) restante(s)`}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Collaborator filter bar */}
      <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        {isAdmin && (
          <button
            onClick={() => setSelectedUserId('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedUserId === 'all'
                ? 'bg-[#030A8C] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todos
          </button>
        )}
        {users.map((user) => {
          const count = tasks.filter((t) => t.assignee?.id === user.id).length
          const active = selectedUserId === user.id
          return (
            <button
              key={user.id}
              onClick={() => setSelectedUserId(user.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                active ? 'bg-[#030A8C] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-[#030A8C]/10 text-[#030A8C]'}`}>
                {user.name.charAt(0)}
              </div>
              {user.name.split(' ')[0]}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-white/20 text-white' : 'bg-[#030A8C] text-white'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}

        {/* Filtro por grupo do cliente */}
        <div className="ml-auto flex items-center gap-1">
          {[['all', 'Todos'], ['SCALE', 'Scale'], ['GROWTH', 'Growth'], ['START', 'Start']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTierFilter(key)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                tierFilter === key
                  ? key === 'SCALE' ? 'bg-[#F74A13] text-white' : 'bg-[#030A8C] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map((col) => {
            const colTasks = visibleTasks.filter((t) => t.status === col.key).sort(compareTasks)

            return (
              <div
                key={col.key}
                className="flex flex-col w-[280px] shrink-0"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragRef.current) {
                    updateTaskStatus(dragRef.current, col.key)
                    dragRef.current = null
                  }
                }}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className={`text-sm font-semibold ${col.color}`}>{col.label}</span>
                    <span className="text-xs text-gray-400 font-medium">{colTasks.length}</span>
                  </div>
                  {/* Criar demanda é ação de administrador. */}
                  {isAdmin && (
                    <button
                      onClick={() => { setShowNewForm(col.key); setNewTaskAssignee(selectedUserId !== 'all' ? selectedUserId : '') }}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {showNewForm === col.key && (
                  <div className="bg-white rounded-xl border-2 border-[#030A8C] p-3.5 mb-3 shadow-md">
                    <input
                      autoFocus
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) createTask(col.key); if (e.key === 'Escape') resetForm() }}
                      placeholder="Título da demanda..."
                      className="w-full text-sm font-semibold outline-none placeholder-gray-300 mb-1.5 text-gray-900 bg-transparent"
                    />
                    <textarea
                      value={newTaskDesc}
                      onChange={(e) => setNewTaskDesc(e.target.value)}
                      placeholder="Descrição (opcional)..."
                      rows={2}
                      className="w-full text-xs outline-none placeholder-gray-300 mb-3 text-gray-500 bg-transparent resize-none"
                    />

                    {/* Priority selector */}
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Prioridade</p>
                      <div className="grid grid-cols-4 gap-1">
                        {(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as TaskPriority[]).map((p) => {
                          const cfg = PRIORITY_CONFIG[p]
                          const active = newTaskPriority === p
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => { setNewTaskPriority(p); setPriorityTouched(true) }}
                              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                                active ? `${cfg.bg} ${cfg.text} ring-1 ring-inset ring-current` : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? cfg.dot : 'bg-gray-300'}`} />
                              {cfg.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Date, client, assignee */}
                    <div className="space-y-1.5 mb-3">
                      <input type="date" value={newTaskDue} onChange={(e) => setNewTaskDue(e.target.value)} className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 outline-none focus:border-[#030A8C]" />
                      <select value={newTaskClient} onChange={(e) => setNewTaskClient(e.target.value)} className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 outline-none focus:border-[#030A8C]">
                        <option value="">Sem cliente</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select value={newTaskAssignee} onChange={(e) => setNewTaskAssignee(e.target.value)} className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 outline-none focus:border-[#030A8C]">
                        <option value="">Responsável (padrão: produção)</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>)}
                      </select>
                      <select value={newTaskPlatform} onChange={(e) => setNewTaskPlatform(e.target.value)} className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 outline-none focus:border-[#030A8C]">
                        <option value="">Plataforma</option>
                        {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>

                    {/* Pending file list */}
                    {newTaskFiles.length > 0 && (
                      <div className="space-y-1 mb-3">
                        {newTaskFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                            <Paperclip className="w-3 h-3 text-gray-400 shrink-0" />
                            <span className="text-[11px] text-gray-600 truncate flex-1">{f.name}</span>
                            <button type="button" onClick={() => setNewTaskFiles((prev) => prev.filter((_, j) => j !== i))}>
                              <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => newTaskFileInputRef.current?.click()}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#030A8C] transition-colors"
                        title="Anexar arquivo"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <input
                        ref={newTaskFileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          if (files.length > 0) setNewTaskFiles((prev) => [...prev, ...files])
                          e.target.value = ''
                        }}
                      />
                      <div className="flex-1" />
                      <button onClick={resetForm} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                        Cancelar
                      </button>
                      <button onClick={() => createTask(col.key)} disabled={!newTaskTitle.trim() || creating} className="px-4 py-1.5 bg-[#030A8C] text-white text-xs font-semibold rounded-lg hover:bg-[#02077a] disabled:opacity-40 transition-colors">
                        {creating ? 'Criando...' : 'Criar'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex-1 space-y-2 overflow-y-auto">
                  {colTasks.length === 0 && showNewForm !== col.key && (
                    isAdmin ? (
                      <div
                        onClick={() => { setShowNewForm(col.key); setNewTaskAssignee(selectedUserId !== 'all' ? selectedUserId : '') }}
                        className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-[#030A8C]/40 hover:bg-[#030A8C]/5 transition-all"
                      >
                        <Plus className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                        <p className="text-xs text-gray-400">Adicionar demanda</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-300 text-center py-4">Nenhuma demanda</p>
                    )
                  )}

                  {colTasks.map((task) => {
                    const late = isLate(task)
                    return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => { dragRef.current = task.id }}
                      onClick={() => openTask(task)}
                      className={`bg-white rounded-xl border p-3 cursor-pointer transition-all ${
                        late ? 'border-red-300 hover:border-red-500' : 'border-gray-200 hover:border-[#030A8C]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-sm font-semibold text-gray-900 leading-snug flex-1">{task.title}</p>
                        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${PRIORITY_CONFIG[task.priority].bg} ${PRIORITY_CONFIG[task.priority].text}`}>
                          {PRIORITY_CONFIG[task.priority].label}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        {task.client && (
                          <span className="inline-block text-[10px] bg-[#030A8C]/10 text-[#030A8C] px-2 py-0.5 rounded-full font-medium">
                            {task.client.name}
                          </span>
                        )}
                        <TierBadge tier={task.client?.tier} />
                        {late && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                            <AlertTriangle className="w-2.5 h-2.5" /> Atrasada
                          </span>
                        )}
                        {task.status === 'EM_REVISAO' && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                            <Eye className="w-2.5 h-2.5" /> Aguardando revisão
                          </span>
                        )}
                        {task.status === 'APROVADO' && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-semibold">
                            <CalendarCheck className="w-2.5 h-2.5" /> Aguardando agendamento
                          </span>
                        )}
                      </div>

                      {/* Próxima ação */}
                      {task.status !== 'CONCLUIDO' && (
                        <p className="text-[11px] text-gray-500 mb-2">{nextAction(task)}</p>
                      )}

                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2">
                          {task.assignee && (
                            <div className="flex items-center gap-1">
                              <div className="w-5 h-5 bg-[#030A8C] rounded-full flex items-center justify-center">
                                <span className="text-white text-[9px] font-bold">{task.assignee.name.charAt(0)}</span>
                              </div>
                              <span className="text-[11px] text-gray-400">{task.assignee.name.split(' ')[0]}</span>
                            </div>
                          )}
                          {task.driveLink && <Link2 className="w-3 h-3 text-[#030A8C]" />}
                          {(task._count?.comments ?? 0) > 0 && (
                            <div className="flex items-center gap-0.5 text-[11px] text-gray-400">
                              <MessageSquare className="w-3 h-3" />
                              {task._count.comments}
                            </div>
                          )}
                        </div>
                        {task.dueDate && (
                          <div className={`flex items-center gap-1 text-[11px] ${late ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                            <Calendar className="w-3 h-3" />
                            {formatDate(task.dueDate as string)}
                          </div>
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Task detail drawer */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-end z-50" onClick={() => { setSelectedTask(null); setEditMode(false); setAttachments([]) }}>
          <div className="bg-white border-l border-gray-200 w-full max-w-md h-full flex flex-col" onClick={(e) => e.stopPropagation()}>

            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg ${PRIORITY_CONFIG[selectedTask.priority].bg} ${PRIORITY_CONFIG[selectedTask.priority].text}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${PRIORITY_CONFIG[selectedTask.priority].dot}`} />
                  {PRIORITY_CONFIG[selectedTask.priority].label}
                </span>
                <span className="text-xs text-gray-400 font-mono">#{selectedTask.id.slice(-6).toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Editar os dados da demanda é ação de administrador; o
                    colaborador muda o status arrastando o card. */}
                {!editMode ? (
                  isAdmin && (
                    <button
                      onClick={() => startEdit(selectedTask)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#030A8C] bg-[#030A8C]/10 rounded-lg hover:bg-[#030A8C] hover:text-white transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </button>
                  )
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditMode(false)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveTask}
                      disabled={saving || !editForm.title.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50 transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                )}
                <button onClick={() => { setSelectedTask(null); setEditMode(false); setAttachments([]) }} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* View mode */}
              {!editMode ? (
                <>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-1">{selectedTask.title}</h2>
                    {selectedTask.description && <p className="text-sm text-gray-500">{selectedTask.description}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400 mb-1 font-medium">Status</p>
                      <select
                        value={selectedTask.status}
                        onChange={(e) => updateTaskStatus(selectedTask.id, e.target.value as TaskStatus)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-900"
                      >
                        {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1 font-medium">Prioridade</p>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg ${PRIORITY_CONFIG[selectedTask.priority].bg} ${PRIORITY_CONFIG[selectedTask.priority].text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_CONFIG[selectedTask.priority].dot}`} />
                        {PRIORITY_CONFIG[selectedTask.priority].label}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1 font-medium">Responsável</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedTask.assignee?.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1 font-medium">Cliente</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedTask.client?.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1 font-medium">Plataforma</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedTask.platform || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1 font-medium">Criado por</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedTask.creator.name}</p>
                    </div>
                  </div>

                  {/* Papéis e prazos derivados da data final */}
                  {(() => {
                    const dl = deadlines(selectedTask.dueDate)
                    return (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Produção</p>
                          <p className="text-xs font-bold text-gray-900 mt-0.5">{dl ? formatDate(dl.production) : '—'}</p>
                          <p className="text-[10px] text-gray-500">{selectedTask.producer?.name.split(' ')[0] || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Revisão</p>
                          <p className="text-xs font-bold text-gray-900 mt-0.5">{dl ? formatDate(dl.review) : '—'}</p>
                          <p className="text-[10px] text-gray-500">{selectedTask.reviewer?.name.split(' ')[0] || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Data final</p>
                          <p className="text-xs font-bold text-[#030A8C] mt-0.5">{dl ? formatDate(dl.final) : '—'}</p>
                          <p className="text-[10px] text-gray-500">{selectedTask.scheduler?.name.split(' ')[0] || '—'}</p>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Link do Drive já enviado */}
                  {selectedTask.driveLink && (
                    <a
                      href={selectedTask.driveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-[#030A8C]/5 border border-[#030A8C]/20 rounded-xl px-3 py-2.5 text-sm text-[#030A8C] font-medium hover:bg-[#030A8C]/10 transition-colors"
                    >
                      <Link2 className="w-4 h-4 shrink-0" />
                      <span className="truncate">Abrir material no Google Drive</span>
                    </a>
                  )}

                  {flowError && (
                    <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {flowError}
                    </p>
                  )}

                  {/* PRODUÇÃO: enviar para revisão (produtor/responsável/admin) */}
                  {['BACKLOG', 'TODO', 'EM_ANDAMENTO'].includes(selectedTask.status) &&
                    (isAdmin || selectedTask.producer?.id === currentUserId || selectedTask.assignee?.id === currentUserId) && (
                    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Send className="w-4 h-4 text-[#030A8C]" /> Entregar produção
                      </p>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Link do Google Drive *</label>
                        <input
                          value={driveLinkInput}
                          onChange={(e) => setDriveLinkInput(e.target.value)}
                          placeholder="https://drive.google.com/..."
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Observação para o revisor (opcional)</label>
                        <input
                          value={reviewNoteInput}
                          onChange={(e) => setReviewNoteInput(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                        />
                      </div>
                      <button
                        onClick={sendToReview}
                        disabled={flowBusy || !driveLinkInput.trim()}
                        className="w-full py-2 bg-[#030A8C] text-white rounded-lg text-sm font-semibold hover:bg-[#02077a] disabled:opacity-50 transition-colors"
                      >
                        {flowBusy ? 'Enviando...' : 'Enviar para revisão'}
                      </button>
                    </div>
                  )}

                  {/* REVISÃO: aprovar ou solicitar ajustes (revisor/admin) */}
                  {selectedTask.status === 'EM_REVISAO' &&
                    (isAdmin || selectedTask.reviewer?.id === currentUserId) && (
                    <div className="border border-purple-200 bg-purple-50/40 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Eye className="w-4 h-4 text-purple-600" /> Revisão
                      </p>
                      {!showAdjustForm ? (
                        <>
                          <div>
                            <label className="text-xs font-medium text-gray-600 mb-1 block">Observação da aprovação (opcional)</label>
                            <input
                              value={reviewNoteInput}
                              onChange={(e) => setReviewNoteInput(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={approve}
                              disabled={flowBusy}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
                            >
                              <CheckCircle2 className="w-4 h-4" /> Aprovar
                            </button>
                            <button
                              onClick={() => setShowAdjustForm(true)}
                              disabled={flowBusy}
                              className="flex-1 py-2 border border-orange-300 text-orange-700 bg-orange-50 rounded-lg text-sm font-semibold hover:bg-orange-100 disabled:opacity-50 transition-colors"
                            >
                              Solicitar ajustes
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="text-xs font-medium text-gray-600 mb-1 block">O que precisa ser corrigido? *</label>
                            <textarea
                              autoFocus
                              value={adjustNote}
                              onChange={(e) => setAdjustNote(e.target.value)}
                              rows={3}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C] resize-none"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setShowAdjustForm(false); setAdjustNote('') }}
                              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={requestAdjustments}
                              disabled={flowBusy || !adjustNote.trim()}
                              className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors"
                            >
                              {flowBusy ? 'Enviando...' : 'Devolver para ajustes'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* AGENDAMENTO: confirmar (agendador/admin) */}
                  {selectedTask.status === 'APROVADO' &&
                    (isAdmin || selectedTask.scheduler?.id === currentUserId || selectedTask.assignee?.id === currentUserId) && (
                    <div className="border border-teal-200 bg-teal-50/40 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <CalendarCheck className="w-4 h-4 text-teal-600" /> Agendamento
                      </p>
                      {!showScheduleForm ? (
                        <button
                          onClick={() => setShowScheduleForm(true)}
                          className="w-full py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors"
                        >
                          Confirmar agendamento
                        </button>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Data *</label>
                              <input type="date" value={scheduleForm.date}
                                onChange={(e) => setScheduleForm((p) => ({ ...p, date: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Horário *</label>
                              <input type="time" value={scheduleForm.time}
                                onChange={(e) => setScheduleForm((p) => ({ ...p, time: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]" />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 mb-1 block">Plataforma *</label>
                            <select value={scheduleForm.platform}
                              onChange={(e) => setScheduleForm((p) => ({ ...p, platform: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]">
                              <option value="">Selecione...</option>
                              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 mb-1 block">Link da publicação (opcional)</label>
                            <input value={scheduleForm.publicationLink}
                              onChange={(e) => setScheduleForm((p) => ({ ...p, publicationLink: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 mb-1 block">Observação (opcional)</label>
                            <input value={scheduleForm.note}
                              onChange={(e) => setScheduleForm((p) => ({ ...p, note: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setShowScheduleForm(false)}
                              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                              Cancelar
                            </button>
                            <button
                              onClick={confirmSchedule}
                              disabled={flowBusy || !scheduleForm.date || !scheduleForm.time || !scheduleForm.platform}
                              className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
                            >
                              {flowBusy ? 'Confirmando...' : 'Concluir demanda'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Agendamento registrado */}
                  {selectedTask.status === 'CONCLUIDO' && selectedTask.scheduledFor && (
                    <div className="border border-green-200 bg-green-50/50 rounded-xl p-3 text-sm">
                      <p className="font-semibold text-green-800 flex items-center gap-1.5">
                        <CalendarCheck className="w-4 h-4" /> Agendado para{' '}
                        {new Date(selectedTask.scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {selectedTask.scheduledPlatform ? ` · ${selectedTask.scheduledPlatform}` : ''}
                      </p>
                      {selectedTask.publicationLink && (
                        <a href={selectedTask.publicationLink} target="_blank" rel="noopener noreferrer" className="text-xs text-green-700 underline break-all">
                          {selectedTask.publicationLink}
                        </a>
                      )}
                    </div>
                  )}

                  {/* Histórico */}
                  <div>
                    <button
                      onClick={() => setShowHistory((v) => !v)}
                      className="flex items-center gap-1.5 text-sm font-bold text-gray-900 hover:text-[#030A8C] transition-colors"
                    >
                      <History className="w-4 h-4" />
                      Histórico {events.length > 0 && <span className="text-gray-400 font-normal">({events.length})</span>}
                    </button>
                    {showHistory && (
                      <div className="mt-3 space-y-0 border-l-2 border-gray-100 ml-2">
                        {events.length === 0 ? (
                          <p className="text-xs text-gray-400 pl-4 py-2">Nenhum registro ainda</p>
                        ) : (
                          events.map((ev) => (
                            <div key={ev.id} className="relative pl-4 pb-3">
                              <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[#030A8C]" />
                              <p className="text-xs text-gray-700">{ev.detail}</p>
                              <p className="text-[10px] text-gray-400">
                                {new Date(ev.createdAt).toLocaleString('pt-BR')}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Edit mode */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Título *</label>
                    <input
                      autoFocus
                      value={editForm.title}
                      onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900 bg-white outline-none focus:border-[#030A8C]"
                      placeholder="Título da demanda"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                      rows={3}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 bg-white outline-none focus:border-[#030A8C] resize-none"
                      placeholder="Descrição opcional..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as TaskStatus }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                      >
                        {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Prioridade</label>
                      <select
                        value={editForm.priority}
                        onChange={(e) => setEditForm((p) => ({ ...p, priority: e.target.value as TaskPriority }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                      >
                        <option value="BAIXA">Baixa</option>
                        <option value="MEDIA">Média</option>
                        <option value="ALTA">Alta</option>
                        <option value="URGENTE">Urgente</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Responsável</label>
                      <select
                        value={editForm.assigneeId}
                        onChange={(e) => setEditForm((p) => ({ ...p, assigneeId: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                      >
                        <option value="">Sem responsável</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
                      <select
                        value={editForm.clientId}
                        onChange={(e) => setEditForm((p) => ({ ...p, clientId: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                      >
                        <option value="">Sem cliente</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Data final</label>
                      <input
                        type="date"
                        value={editForm.dueDate}
                        onChange={(e) => setEditForm((p) => ({ ...p, dueDate: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">Produção D-2 · Revisão D-1</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Plataforma</label>
                      <select
                        value={editForm.platform}
                        onChange={(e) => setEditForm((p) => ({ ...p, platform: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                      >
                        <option value="">Sem plataforma</option>
                        {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Produção</label>
                      <select
                        value={editForm.producerId}
                        onChange={(e) => setEditForm((p) => ({ ...p, producerId: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                      >
                        <option value="">—</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Revisão</label>
                      <select
                        value={editForm.reviewerId}
                        onChange={(e) => setEditForm((p) => ({ ...p, reviewerId: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                      >
                        <option value="">—</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Agendamento</label>
                      <select
                        value={editForm.schedulerId}
                        onChange={(e) => setEditForm((p) => ({ ...p, schedulerId: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]"
                      >
                        <option value="">—</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Attachments */}
              {!editMode && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-900">
                      Anexos {attachments.length > 0 && <span className="text-gray-400 font-normal">({attachments.length})</span>}
                    </h3>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#030A8C] bg-[#030A8C]/10 rounded-lg hover:bg-[#030A8C] hover:text-white transition-colors disabled:opacity-50"
                    >
                      <Paperclip className="w-3 h-3" />
                      {uploading ? 'Enviando...' : 'Anexar arquivo'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                      onChange={uploadFile}
                    />
                  </div>

                  {attachments.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {attachments.map((att) => {
                        const isImage = att.fileType.startsWith('image/')
                        const Icon = getFileIcon(att.fileType)
                        return (
                          <div key={att.id} className="group flex items-center gap-3 p-2.5 bg-gray-50 border border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
                            {isImage ? (
                              <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                                <img src={att.fileUrl} alt={att.fileName} className="w-full h-full object-cover" />
                              </a>
                            ) : (
                              <div className="w-10 h-10 bg-[#030A8C]/10 rounded-lg flex items-center justify-center shrink-0">
                                <Icon className="w-5 h-5 text-[#030A8C]" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">{att.fileName}</p>
                              <p className="text-[10px] text-gray-400">{formatFileSize(att.fileSize)}</p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a
                                href={att.fileUrl}
                                download={att.fileName}
                                className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                              >
                                <Download className="w-3.5 h-3.5 text-gray-500" />
                              </a>
                              <button
                                onClick={() => deleteAttachment(att.id)}
                                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Comments */}
              {!editMode && (
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3">
                    Comentários {comments.length > 0 && <span className="text-gray-400 font-normal">({comments.length})</span>}
                  </h3>
                  <div className="space-y-3 mb-3">
                    {comments.map((c) => (
                      <div key={c.id} className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-6 h-6 bg-[#030A8C] rounded-full flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold">{c.user.name.charAt(0)}</span>
                          </div>
                          <span className="text-xs font-semibold text-gray-900">{c.user.name}</span>
                          <span className="text-[10px] text-gray-400 ml-auto">
                            {new Date(c.createdAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 ml-8">{c.content}</p>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-3">Nenhum comentário ainda</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendComment()}
                      placeholder="Adicionar comentário..."
                      className="flex-1 border border-gray-200 bg-white text-gray-900 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#030A8C] placeholder-gray-400"
                    />
                    <button
                      onClick={sendComment}
                      disabled={!newComment.trim()}
                      className="px-3 py-2 bg-[#030A8C] text-white rounded-xl text-sm font-medium hover:bg-[#02077a] disabled:opacity-40 transition-colors"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="px-5 py-4 border-t border-gray-100">
                <button
                  onClick={() => deleteTask(selectedTask.id)}
                  className="w-full py-2 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors font-medium"
                >
                  Excluir demanda
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
