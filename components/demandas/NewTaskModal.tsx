'use client'

import { useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { PLATFORMS, PRIORITY_CONFIG, type TaskPriority, type TaskStatus } from '@/lib/demandas-core'
import type { Option, Task } from './types'

/** Criação de demanda (admin). A data final é obrigatória: o processo deriva dela. */
export default function NewTaskModal({
  clients, users, defaultAssignee, onClose, onCreated,
}: {
  clients: Option[]
  users: Option[]
  defaultAssignee: string
  onClose: () => void
  onCreated: (t: Task) => void
}) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [client, setClient] = useState('')
  const [assignee, setAssignee] = useState(defaultAssignee)
  const [priority, setPriority] = useState<TaskPriority>('MEDIA')
  const [priorityTouched, setPriorityTouched] = useState(false)
  const [due, setDue] = useState('')
  const [platform, setPlatform] = useState('')
  const [status, setStatus] = useState<TaskStatus>('TODO')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function create() {
    if (!title.trim() || !due || busy) return
    setBusy(true)
    setError(null)
    const res = await fetch('/api/demandas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, description: desc || null, status,
        // Sem escolha explícita, o backend herda a prioridade do grupo do cliente
        priority: priorityTouched ? priority : null,
        clientId: client || null, assigneeId: assignee || null, dueDate: due, platform: platform || null,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Não foi possível criar a demanda.')
      setBusy(false)
      return
    }
    const task: Task = await res.json()
    for (const f of files) {
      const fd = new FormData(); fd.append('file', f)
      await fetch(`/api/demandas/${task.id}/attachments`, { method: 'POST', body: fd })
    }
    onCreated(task)
    setBusy(false)
  }

  const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 outline-none focus:border-[#030A8C]'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92dvh] sm:max-w-xl sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Nova demanda">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-bold text-gray-900">Nova demanda</p>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Título *</label>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Nobre · POST 13 · Ela achou que tinha perdido a bolsa" className={`${input} font-semibold`} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Briefing</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={5} placeholder={'COPY DA ARTE\n...\n\nLEGENDA\n...\n\nHASHTAGS\n#...'} className={`${input} resize-none font-mono text-xs`} />
            <p className="text-[10px] text-gray-400 mt-1">Cabeçalhos em caixa alta (COPY DA ARTE, LEGENDA, HASHTAGS, CTA, IMAGEM) viram blocos separados no card.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Data final *</label>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={input} />
              <p className="text-[10px] text-gray-400 mt-1">Produção D-2 · Revisão D-1</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Etapa inicial</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={input}>
                <option value="TODO">A fazer</option>
                <option value="BACKLOG">Backlog (ainda não priorizada)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Cliente</label>
              <select value={client} onChange={(e) => setClient(e.target.value)} className={input}>
                <option value="">Sem cliente</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Responsável</label>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={input}>
                <option value="">Padrão da produção</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Plataforma</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={input}>
                <option value="">—</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Prioridade</label>
              <div className="grid grid-cols-4 gap-1">
                {(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as TaskPriority[]).map((p) => {
                  const cfg = PRIORITY_CONFIG[p]
                  const on = priority === p
                  return (
                    <button key={p} type="button" onClick={() => { setPriority(p); setPriorityTouched(true) }} className={`py-2 rounded-lg text-[11px] font-semibold ${on ? `${cfg.bg} ${cfg.text} ring-1 ring-inset ring-current` : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                  <Paperclip className="w-3 h-3 text-gray-400 shrink-0" />
                  <span className="text-[11px] text-gray-600 truncate flex-1">{f.name}</span>
                  <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} aria-label="Remover anexo"><X className="w-3 h-3 text-gray-400 hover:text-gray-600" /></button>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#030A8C]" title="Anexar arquivo"><Paperclip className="w-4 h-4" /></button>
          <input ref={fileRef} type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files || [])]); e.target.value = '' }} />
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button type="button" onClick={create} disabled={!title.trim() || !due || busy} className="px-4 py-2 bg-[#030A8C] text-white text-sm font-semibold rounded-lg hover:bg-[#02077a] disabled:opacity-40">
            {busy ? 'Criando…' : 'Criar demanda'}
          </button>
        </div>
      </div>
    </div>
  )
}
