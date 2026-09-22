'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Pencil, Save, Paperclip, Download, Trash2, ImageIcon, FileText, File as FileIcon, Link2,
  Eye, CalendarCheck, Send, CheckCircle2, History, Check, Clock,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import TaskBrief from '@/components/demandas/TaskBrief'
import ClientLinkChips from '@/components/clientes/ClientLinkChips'
import {
  STAGES, STAGE_BY_KEY, PRIORITY_CONFIG, PLATFORMS, PRODUCTION_STATUSES, deadlines, currentActor, isLate,
  type TaskStatus, type TaskPriority,
} from '@/lib/demandas-core'
import type { Option, Task, TaskEvent } from './types'

interface Attachment { id: string; fileName: string; fileUrl: string; fileSize: number; fileType: string }
interface Comment { id: string; content: string; user: { name: string }; createdAt: string }

function fileIcon(fileType: string) {
  if (fileType.startsWith('image/')) return ImageIcon
  if (fileType.includes('pdf') || fileType.includes('text')) return FileText
  return FileIcon
}
function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]'

/* ------------------------------ passo a passo ------------------------------ */

function Stepper({ task }: { task: Task }) {
  const steps = STAGES.filter((s) => s.key !== 'BACKLOG')
  const atual = task.status === 'BACKLOG' ? 'TODO' : task.status
  const idx = steps.findIndex((s) => s.key === atual)
  const dl = deadlines(task.dueDate)
  const pessoa = (k: TaskStatus) => k === 'TODO' || k === 'EM_ANDAMENTO' ? task.producer : k === 'EM_REVISAO' ? task.reviewer : k === 'APROVADO' ? task.scheduler : null
  const data = (k: TaskStatus) => k === 'EM_ANDAMENTO' ? dl?.production : k === 'EM_REVISAO' ? dl?.review : k === 'APROVADO' ? dl?.final : null
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Etapas do processo">
      {steps.map((s, i) => {
        const feito = i < idx || task.status === 'CONCLUIDO'
        const on = i === idx && task.status !== 'CONCLUIDO'
        const p = pessoa(s.key)
        const d = data(s.key)
        return (
          <li key={s.key} className="min-w-0">
            <div className={`h-1.5 rounded-full mb-1.5 ${feito ? 'bg-green-500' : on ? s.dot : 'bg-gray-200'}`} />
            <p className={`text-[11px] font-bold truncate ${on ? s.color : feito ? 'text-green-700' : 'text-gray-400'}`}>
              {feito && <Check className="inline w-3 h-3 mr-0.5 -mt-0.5" />}{task.status === 'BACKLOG' && s.key === 'TODO' ? 'Backlog' : s.short}
            </p>
            <p className="text-[10px] text-gray-500 truncate">{p ? p.name.split(' ')[0] : s.key === 'CONCLUIDO' ? (dl ? formatDate(dl.final) : '') : '—'}</p>
            {d && <p className={`text-[10px] truncate ${on ? 'text-gray-700 font-semibold' : 'text-gray-400'}`}>até {formatDate(d)}</p>}
          </li>
        )
      })}
    </ol>
  )
}

/* ---------------------------------- modal ---------------------------------- */

export default function TaskDetail({
  task, users, clients, currentUserId, isAdmin, onApply, onDelete, onStatusChange,
}: {
  task: Task
  users: Option[]
  clients: Option[]
  currentUserId: string
  isAdmin: boolean
  onApply: (updated: Task) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [uploading, setUploading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({
    title: task.title, description: task.description || '', status: task.status, priority: task.priority,
    dueDate: task.dueDate ? new Date(task.dueDate as string).toISOString().split('T')[0] : '',
    clientId: task.client?.id || '', assigneeId: task.assignee?.id || '', platform: task.platform || '',
    producerId: task.producer?.id || '', reviewerId: task.reviewer?.id || '', schedulerId: task.scheduler?.id || '',
  })
  const [saving, setSaving] = useState(false)

  const [flowError, setFlowError] = useState<string | null>(null)
  const [flowBusy, setFlowBusy] = useState(false)
  const [driveLinkInput, setDriveLinkInput] = useState(task.driveLink || '')
  const [reviewNoteInput, setReviewNoteInput] = useState('')
  const [showAdjustForm, setShowAdjustForm] = useState(false)
  const [adjustNote, setAdjustNote] = useState('')
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ date: '', time: '', platform: task.platform || '', publicationLink: '', note: '' })
  const [showHistory, setShowHistory] = useState(false)

  // O componente é montado por demanda (key = id): carrega o detalhe uma vez
  useEffect(() => {
    let vivo = true
    fetch(`/api/demandas/${task.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!vivo) return
        setComments(data.comments || [])
        setAttachments(data.attachments || [])
        setEvents(data.events || [])
        if (data.driveLink) setDriveLinkInput(data.driveLink)
        onApply(data)
      })
      .catch(() => {})
    return () => { vivo = false }
    // onApply é estável o bastante; depender dele recarregaria a cada render do pai
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])


  async function refreshEvents() {
    const res = await fetch(`/api/demandas/${task.id}`)
    if (res.ok) setEvents((await res.json()).events || [])
  }

  async function saveTask() {
    if (!editForm.title.trim()) return
    setSaving(true)
    const payload: Record<string, unknown> = {
      title: editForm.title, description: editForm.description || null, priority: editForm.priority,
      dueDate: editForm.dueDate || null, clientId: editForm.clientId || null, assigneeId: editForm.assigneeId || null,
      platform: editForm.platform || null, producerId: editForm.producerId || null,
      reviewerId: editForm.reviewerId || null, schedulerId: editForm.schedulerId || null,
    }
    if (editForm.status !== task.status) payload.status = editForm.status
    const res = await fetch(`/api/demandas/${task.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.ok) { onApply(await res.json()); setEditMode(false); refreshEvents() }
    else { const b = await res.json().catch(() => ({})); alert(b.error || 'Não foi possível salvar.') }
    setSaving(false)
  }

  async function flowAction(url: string, payload: Record<string, unknown>) {
    setFlowBusy(true); setFlowError(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setFlowError(body.error || 'Não foi possível concluir a ação.'); return }
      onApply(body)
      refreshEvents()
      setShowAdjustForm(false); setAdjustNote(''); setShowScheduleForm(false); setReviewNoteInput('')
    } catch { setFlowError('Falha de conexão. Tente de novo.') }
    finally { setFlowBusy(false) }
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    const fd = new FormData(); fd.append('file', f)
    const res = await fetch(`/api/demandas/${task.id}/attachments`, { method: 'POST', body: fd })
    if (res.ok) { const att: Attachment = await res.json(); setAttachments((p) => [...p, att]) }
    else { const err = await res.json().catch(() => ({})); alert(err.error || 'Não foi possível enviar o arquivo') }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function deleteAttachment(id: string) {
    await fetch(`/api/demandas/${task.id}/attachments`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attachmentId: id }) })
    setAttachments((p) => p.filter((a) => a.id !== id))
  }

  async function sendComment() {
    if (!newComment.trim()) return
    const res = await fetch(`/api/demandas/${task.id}/comentarios`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newComment }) })
    if (res.ok) {
      const c: Comment = await res.json()
      setComments((p) => [...p, c])
      onApply({ ...task, _count: { comments: (task._count?.comments ?? 0) + 1 } })
      setNewComment('')
    }
  }

  const stage = STAGE_BY_KEY[task.status]
  const pr = PRIORITY_CONFIG[task.priority]
  const late = isLate(task)
  const actor = currentActor(task)
  const canProduce = PRODUCTION_STATUSES.includes(task.status) && (isAdmin || task.producer?.id === currentUserId || task.assignee?.id === currentUserId)
  const canReview = task.status === 'EM_REVISAO' && (isAdmin || task.reviewer?.id === currentUserId)
  const canSchedule = task.status === 'APROVADO' && (isAdmin || task.scheduler?.id === currentUserId || task.assignee?.id === currentUserId)
  const canChangeStatus = isAdmin || (task.assignee?.id === currentUserId && PRODUCTION_STATUSES.includes(task.status))

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="w-full p-4 sm:p-6">
      <Link href="/demandas" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#030A8C] mb-3">
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar para demandas
      </Link>
      <div className="bg-white rounded-2xl border border-gray-200 flex flex-col overflow-hidden">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full ${stage.bg} ${stage.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />{stage.label}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${pr.bg} ${pr.text}`}>{pr.label}</span>
            {late && <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700">Atrasada</span>}
            <span className="text-xs text-gray-400 font-mono">#{task.number}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!editMode ? (
              isAdmin && (
                <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#030A8C] bg-[#030A8C]/10 rounded-lg hover:bg-[#030A8C] hover:text-white transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
              )
            ) : (
              <>
                <button onClick={() => setEditMode(false)} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
                <button onClick={saveTask} disabled={saving || !editForm.title.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#030A8C] text-white rounded-lg hover:bg-[#02077a] disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {!editMode ? (
            <>
              <div>
                <h2 className="text-xl font-bold text-gray-900 leading-snug">{task.title}</h2>
                {(task.client || task.platform || task.contentType) && (
                  <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-2">
                    {task.client && <span className="font-semibold text-gray-700">{task.client.name}</span>}
                    {task.platform && <span>· {task.platform}</span>}
                    {task.contentType && <span>· {task.contentType}</span>}
                  </p>
                )}
                <div className="mt-2"><ClientLinkChips client={task.client} /></div>
              </div>

              {/* Processo: onde está e com quem */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                <Stepper task={task} />
              </div>

              {flowError && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{flowError}</p>}

              {/* Ação da etapa, no topo: é o que a pessoa veio fazer */}
              {canProduce && (
                <div className="border border-[#030A8C]/30 bg-[#030A8C]/[0.03] rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-2"><Send className="w-4 h-4 text-[#030A8C]" /> Entregar produção</p>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Link do Google Drive *</label>
                    <input value={driveLinkInput} onChange={(e) => setDriveLinkInput(e.target.value)} placeholder="https://drive.google.com/..." className={INPUT} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Observação para o revisor (opcional)</label>
                    <input value={reviewNoteInput} onChange={(e) => setReviewNoteInput(e.target.value)} className={INPUT} />
                  </div>
                  <button
                    onClick={() => flowAction(`/api/demandas/${task.id}/enviar-revisao`, { driveLink: driveLinkInput, note: reviewNoteInput })}
                    disabled={flowBusy || !driveLinkInput.trim()}
                    className="w-full py-2 bg-[#030A8C] text-white rounded-lg text-sm font-semibold hover:bg-[#02077a] disabled:opacity-50"
                  >
                    {flowBusy ? 'Enviando…' : 'Enviar para revisão'}
                  </button>
                </div>
              )}

              {canReview && (
                <div className="border border-purple-200 bg-purple-50/40 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-2"><Eye className="w-4 h-4 text-purple-600" /> Revisão</p>
                  {!showAdjustForm ? (
                    <>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Observação da aprovação (opcional)</label>
                        <input value={reviewNoteInput} onChange={(e) => setReviewNoteInput(e.target.value)} className={INPUT} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => flowAction(`/api/demandas/${task.id}/revisar`, { action: 'aprovar', note: reviewNoteInput })} disabled={flowBusy} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                          <CheckCircle2 className="w-4 h-4" /> Aprovar
                        </button>
                        <button onClick={() => setShowAdjustForm(true)} disabled={flowBusy} className="flex-1 py-2 border border-orange-300 text-orange-700 bg-orange-50 rounded-lg text-sm font-semibold hover:bg-orange-100 disabled:opacity-50">
                          Solicitar ajustes
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">O que precisa ser corrigido? *</label>
                        <textarea autoFocus value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} rows={3} className={`${INPUT} resize-none`} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setShowAdjustForm(false); setAdjustNote('') }} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                        <button onClick={() => flowAction(`/api/demandas/${task.id}/revisar`, { action: 'ajustes', note: adjustNote })} disabled={flowBusy || !adjustNote.trim()} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-50">
                          {flowBusy ? 'Enviando…' : 'Devolver para ajustes'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {canSchedule && (
                <div className="border border-teal-200 bg-teal-50/40 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-2"><CalendarCheck className="w-4 h-4 text-teal-600" /> Agendamento</p>
                  {!showScheduleForm ? (
                    <button onClick={() => setShowScheduleForm(true)} className="w-full py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700">Confirmar agendamento</button>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Data *</label>
                          <input type="date" value={scheduleForm.date} onChange={(e) => setScheduleForm((p) => ({ ...p, date: e.target.value }))} className={INPUT} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Horário *</label>
                          <input type="time" value={scheduleForm.time} onChange={(e) => setScheduleForm((p) => ({ ...p, time: e.target.value }))} className={INPUT} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Plataforma *</label>
                        <select value={scheduleForm.platform} onChange={(e) => setScheduleForm((p) => ({ ...p, platform: e.target.value }))} className={INPUT}>
                          <option value="">Selecione...</option>
                          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Link da publicação (opcional)</label>
                        <input value={scheduleForm.publicationLink} onChange={(e) => setScheduleForm((p) => ({ ...p, publicationLink: e.target.value }))} className={INPUT} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Observação (opcional)</label>
                        <input value={scheduleForm.note} onChange={(e) => setScheduleForm((p) => ({ ...p, note: e.target.value }))} className={INPUT} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setShowScheduleForm(false)} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                        <button onClick={() => flowAction(`/api/demandas/${task.id}/agendar`, scheduleForm)} disabled={flowBusy || !scheduleForm.date || !scheduleForm.time || !scheduleForm.platform} className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                          {flowBusy ? 'Confirmando…' : 'Concluir demanda'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {!canProduce && !canReview && !canSchedule && task.status !== 'CONCLUIDO' && (
                <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  Aguardando {actor ? <strong className="text-gray-700">{actor.name.split(' ')[0]}</strong> : 'definição de responsável'} · {stage.hint.toLowerCase()}
                </p>
              )}

              {task.status === 'CONCLUIDO' && task.scheduledFor && (
                <div className="border border-green-200 bg-green-50/50 rounded-xl p-3 text-sm">
                  <p className="font-semibold text-green-800 flex items-center gap-1.5">
                    <CalendarCheck className="w-4 h-4" /> Agendado para {new Date(task.scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {task.scheduledPlatform ? ` · ${task.scheduledPlatform}` : ''}
                  </p>
                  {task.publicationLink && <a href={task.publicationLink} target="_blank" rel="noopener noreferrer" className="text-xs text-green-700 underline break-all">{task.publicationLink}</a>}
                </div>
              )}

              {/* Briefing */}
              {task.description && (
                <div>
                  <p className="text-xs text-gray-400 mb-2 font-medium">Briefing</p>
                  <TaskBrief description={task.description} />
                </div>
              )}

              {task.driveLink && (
                <a href={task.driveLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#030A8C]/5 border border-[#030A8C]/20 rounded-xl px-3 py-2.5 text-sm text-[#030A8C] font-medium hover:bg-[#030A8C]/10">
                  <Link2 className="w-4 h-4 shrink-0" /><span className="truncate">Abrir material no Google Drive</span>
                </a>
              )}

              {/* Dados */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 mb-1 font-medium">Etapa</p>
                  {canChangeStatus ? (
                    <select value={task.status} onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-900">
                      {STAGES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  ) : (
                    <p className={`text-sm font-semibold ${stage.color}`}>{stage.label}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1 font-medium">Responsável</p>
                  {isAdmin ? (
                    <select
                      value={task.assignee?.id || ''}
                      onChange={async (e) => {
                        const res = await fetch(`/api/demandas/${task.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigneeId: e.target.value || null }) })
                        if (res.ok) { onApply(await res.json()); refreshEvents() }
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-900"
                    >
                      <option value="">Sem responsável</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  ) : <p className="text-sm font-semibold text-gray-900">{task.assignee?.name || '—'}</p>}
                </div>
                <div><p className="text-xs text-gray-400 mb-1 font-medium">Data final</p><p className={`text-sm font-semibold ${late ? 'text-red-600' : 'text-gray-900'}`}>{task.dueDate ? formatDate(task.dueDate) : '—'}</p></div>
                <div><p className="text-xs text-gray-400 mb-1 font-medium">Cliente</p><p className="text-sm font-semibold text-gray-900 truncate">{task.client?.name || '—'}</p></div>
                <div><p className="text-xs text-gray-400 mb-1 font-medium">Plataforma</p><p className="text-sm font-semibold text-gray-900">{task.platform || '—'}</p></div>
                <div><p className="text-xs text-gray-400 mb-1 font-medium">Criado por</p><p className="text-sm font-semibold text-gray-900 truncate">{task.creator?.name || '—'}</p></div>
              </div>

              {/* Histórico */}
              <div>
                <button onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-1.5 text-sm font-bold text-gray-900 hover:text-[#030A8C]">
                  <History className="w-4 h-4" /> Histórico {events.length > 0 && <span className="text-gray-400 font-normal">({events.length})</span>}
                </button>
                {showHistory && (
                  <div className="mt-3 border-l-2 border-gray-100 ml-2">
                    {events.length === 0 ? <p className="text-xs text-gray-400 pl-4 py-2">Nenhum registro ainda</p> : events.map((ev) => (
                      <div key={ev.id} className="relative pl-4 pb-3">
                        <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[#030A8C]" />
                        <p className="text-xs text-gray-700">{ev.detail}</p>
                        <p className="text-[10px] text-gray-400">{new Date(ev.createdAt).toLocaleString('pt-BR')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Edição (admin) */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Título *</label>
                <input autoFocus value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} className={`${INPUT} font-semibold`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Briefing</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} rows={10} className={`${INPUT} resize-y font-mono text-xs`} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Etapa</label>
                  <select value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as TaskStatus }))} className={INPUT}>
                    {STAGES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Prioridade</label>
                  <select value={editForm.priority} onChange={(e) => setEditForm((p) => ({ ...p, priority: e.target.value as TaskPriority }))} className={INPUT}>
                    <option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Responsável</label>
                  <select value={editForm.assigneeId} onChange={(e) => setEditForm((p) => ({ ...p, assigneeId: e.target.value }))} className={INPUT}>
                    <option value="">Sem responsável</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
                  <select value={editForm.clientId} onChange={(e) => setEditForm((p) => ({ ...p, clientId: e.target.value }))} className={INPUT}>
                    <option value="">Sem cliente</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Data final</label>
                  <input type="date" value={editForm.dueDate} onChange={(e) => setEditForm((p) => ({ ...p, dueDate: e.target.value }))} className={INPUT} />
                  <p className="text-[10px] text-gray-400 mt-1">Produção D-2 · Revisão D-1</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Plataforma</label>
                  <select value={editForm.platform} onChange={(e) => setEditForm((p) => ({ ...p, platform: e.target.value }))} className={INPUT}>
                    <option value="">Sem plataforma</option>
                    {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                {([['producerId', 'Produção'], ['reviewerId', 'Revisão'], ['schedulerId', 'Agendamento']] as const).map(([k, label]) => (
                  <div key={k}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                    <select value={editForm[k]} onChange={(e) => setEditForm((p) => ({ ...p, [k]: e.target.value }))} className={INPUT}>
                      <option value="">—</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Anexos */}
          {!editMode && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900">Anexos {attachments.length > 0 && <span className="text-gray-400 font-normal">({attachments.length})</span>}</h3>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#030A8C] bg-[#030A8C]/10 rounded-lg hover:bg-[#030A8C] hover:text-white disabled:opacity-50">
                  <Paperclip className="w-3 h-3" /> {uploading ? 'Enviando…' : 'Anexar arquivo'}
                </button>
                <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={uploadFile} />
              </div>
              {attachments.length > 0 && (
                <div className="space-y-2">
                  {attachments.map((att) => {
                    const Icon = fileIcon(att.fileType)
                    return (
                      <div key={att.id} className="group flex items-center gap-3 p-2.5 bg-gray-50 border border-gray-100 rounded-xl hover:border-gray-200">
                        {att.fileType.startsWith('image/') ? (
                          <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                            {/* eslint-disable-next-line @next/next/no-img-element -- anexo enviado pelo time, servido fora do otimizador */}
                            <img src={att.fileUrl} alt={att.fileName} className="w-full h-full object-cover" />
                          </a>
                        ) : (
                          <div className="w-10 h-10 bg-[#030A8C]/10 rounded-lg flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-[#030A8C]" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{att.fileName}</p>
                          <p className="text-[10px] text-gray-400">{fileSize(att.fileSize)}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                          <a href={att.fileUrl} download={att.fileName} className="p-1.5 hover:bg-gray-200 rounded-lg"><Download className="w-3.5 h-3.5 text-gray-500" /></a>
                          <button onClick={() => deleteAttachment(att.id)} className="p-1.5 hover:bg-red-50 rounded-lg" aria-label="Remover anexo"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Comentários */}
          {!editMode && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Comentários {comments.length > 0 && <span className="text-gray-400 font-normal">({comments.length})</span>}</h3>
              <div className="space-y-3 mb-3">
                {comments.map((c) => (
                  <div key={c.id} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 bg-[#030A8C] rounded-full flex items-center justify-center"><span className="text-white text-[10px] font-bold">{c.user.name.charAt(0)}</span></div>
                      <span className="text-xs font-semibold text-gray-900">{c.user.name}</span>
                      <span className="text-[10px] text-gray-400 ml-auto">{new Date(c.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="text-sm text-gray-700 ml-8">{c.content}</p>
                  </div>
                ))}
                {comments.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Nenhum comentário ainda</p>}
              </div>
              <div className="flex gap-2">
                <input value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendComment()} placeholder="Adicionar comentário..." className={`${INPUT} flex-1`} />
                <button onClick={sendComment} disabled={!newComment.trim()} className="px-3 py-2 bg-[#030A8C] text-white rounded-lg text-sm font-medium hover:bg-[#02077a] disabled:opacity-40">Enviar</button>
              </div>
            </div>
          )}
        </div>

        {isAdmin && !editMode && (
          <div className="px-5 py-3 border-t border-gray-100">
            <button onClick={() => { if (confirm('Remover esta demanda?')) onDelete(task.id) }} className="w-full py-2 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl font-medium">Excluir demanda</button>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
