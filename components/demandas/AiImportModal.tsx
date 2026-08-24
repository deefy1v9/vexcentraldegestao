'use client'

import { useRef, useState } from 'react'
import { X, Sparkles, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface Client { id: string; name: string; tier?: string | null }
interface User { id: string; name: string }

interface ReviewRow {
  itemId: string
  selected: boolean
  title: string
  description: string
  clientId: string | null
  clientNameDetected: string | null
  responsibleId: string | null
  reviewerId: string | null
  schedulerId: string | null
  dueDate: string | null
  productionDue: string | null
  reviewDue: string | null
  priority: string
  contentType: string | null
  platform: string | null
  confidence: number
  warnings: string[]
}

const PRIORITIES = [
  ['urgent', 'Urgente'], ['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa'],
] as const

/**
 * Importação de calendário com IA — 4 etapas: enviar conteúdo, analisar,
 * revisar sugestões e confirmar. A IA nunca cria nada sozinha: a criação
 * em lote só acontece na confirmação do administrador.
 */
export default function AiImportModal({
  clients, users, onClose, onCreated,
}: {
  clients: Client[]
  users: User[]
  onClose: () => void
  onCreated: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [mode, setMode] = useState<'texto' | 'pdf' | 'csv'>('texto')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [defaultResponsible, setDefaultResponsible] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [importId, setImportId] = useState('')
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ created: number; ignored: number } | null>(null)

  async function analyze() {
    setError(null)
    setStep(2)
    try {
      let res: Response
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        // Com arquivo, o texto digitado vira instruções para a IA
        if (text.trim()) fd.append('note', text.trim())
        if (defaultResponsible) fd.append('defaultResponsibleId', defaultResponsible)
        res = await fetch('/api/demandas/importar/analisar', { method: 'POST', body: fd })
      } else {
        res = await fetch('/api/demandas/importar/analisar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, defaultResponsibleId: defaultResponsible || undefined }),
        })
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Falha na análise.')
        setStep(1)
        return
      }
      setImportId(body.importId)
      setRows((body.items as Array<{ id: string; payload: Record<string, unknown> }>).map((item) => {
        const p = item.payload as never as {
          title: string; description: string; client_id: string | null
          client_name_detected: string | null; responsible_id: string | null
          reviewer_id: string | null; scheduler_id: string | null
          publication_at: string | null; production_due_at: string | null
          review_due_at: string | null; manual_priority: string
          content_type: string | null; platform: string[]
          confidence: number; warnings: string[]
        }
        return {
          itemId: item.id,
          selected: true,
          title: p.title ?? '',
          description: p.description ?? '',
          clientId: p.client_id,
          clientNameDetected: p.client_name_detected,
          responsibleId: p.responsible_id,
          reviewerId: p.reviewer_id,
          schedulerId: p.scheduler_id,
          dueDate: p.publication_at ? p.publication_at.slice(0, 10) : null,
          productionDue: p.production_due_at,
          reviewDue: p.review_due_at,
          priority: p.manual_priority ?? 'medium',
          contentType: p.content_type,
          platform: p.platform?.[0] ?? null,
          confidence: p.confidence ?? 0.5,
          warnings: p.warnings ?? [],
        }
      }))
      setStep(3)
    } catch {
      setError('Falha de conexão. Tente de novo.')
      setStep(1)
    }
  }

  function update<K extends keyof ReviewRow>(i: number, key: K, value: ReviewRow[K]) {
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r
      const next = { ...r, [key]: value }
      // Data final editada: rederiva produção D-2 e revisão D-1
      if (key === 'dueDate' && typeof value === 'string' && value) {
        const base = new Date(`${value}T12:00:00Z`)
        const fmt = (d: Date) => d.toISOString().slice(0, 10)
        next.productionDue = fmt(new Date(base.getTime() - 2 * 86400_000))
        next.reviewDue = fmt(new Date(base.getTime() - 1 * 86400_000))
      }
      return next
    }))
  }

  const selected = rows.filter((r) => r.selected)
  const incomplete = selected.filter((r) => !r.title.trim() || !r.clientId || !r.responsibleId || !r.dueDate)

  async function confirm() {
    if (confirming || selected.length === 0 || incomplete.length > 0) return
    setConfirming(true)
    setError(null)
    try {
      const res = await fetch('/api/demandas/importar/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importId,
          items: selected.map((r) => ({
            itemId: r.itemId,
            title: r.title,
            description: r.description,
            clientId: r.clientId,
            responsibleId: r.responsibleId,
            reviewerId: r.reviewerId,
            schedulerId: r.schedulerId,
            dueDate: r.dueDate,
            priority: r.priority,
            contentType: r.contentType,
            platform: r.platform,
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Não foi possível criar as demandas.')
        return
      }
      setResult({ created: body.created, ignored: body.ignored })
      setStep(4)
      onCreated()
    } catch {
      setError('Falha de conexão. Tente de novo.')
    } finally {
      setConfirming(false)
    }
  }

  const fmtDate = (s: string | null) => (s ? s.split('-').reverse().join('/') : '—')

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-5xl max-h-[90dvh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-100 shrink-0">
          <p className="font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#030A8C]" />
            Importar calendário com IA
          </p>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-400 hidden sm:inline">
              {step === 1 ? '1 · Enviar conteúdo' : step === 2 ? '2 · Analisando' : step === 3 ? '3 · Revisar demandas' : '4 · Concluído'}
            </span>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {error && (
            <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-4">
              {error}
            </p>
          )}

          {/* Etapa 1: escolher o formato e enviar o conteúdo */}
          {step === 1 && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <p className="text-sm text-gray-500">
                Escolha como enviar o calendário. A IA separa as atividades, identifica o cliente
                e sugere o responsável — nada é criado sem a sua confirmação.
              </p>

              {/* Seletor do formato */}
              <div className="grid grid-cols-3 gap-2">
                {([['texto', 'Colar texto'], ['pdf', 'Enviar PDF'], ['csv', 'Enviar CSV']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setMode(key)
                      setFile(null)
                      if (fileRef.current) fileRef.current.value = ''
                    }}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                      mode === key
                        ? 'bg-[#030A8C] text-white border-[#030A8C]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#030A8C] hover:text-[#030A8C]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Conteúdo conforme o formato */}
              {mode === 'texto' ? (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Conteúdo do calendário</label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={8}
                    placeholder={'Ex:\n18/08 - Post carrossel dicas de costura - Nobre\n20/08 - Reels bastidores - CX Lab...'}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-white outline-none focus:border-[#030A8C] resize-none"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-600 hover:border-[#030A8C] hover:text-[#030A8C] transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    {file ? file.name : mode === 'pdf' ? 'Clique para escolher o PDF' : 'Clique para escolher o CSV'}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept={mode === 'pdf' ? '.pdf' : '.csv'}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }}
                  />
                  {file && (
                    <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }} className="text-xs text-gray-400 hover:text-red-500">
                      remover arquivo
                    </button>
                  )}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Instruções para a IA (opcional) — ex: &quot;o primeiro post já foi feito, não precisa&quot;
                    </label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={2}
                      placeholder="Instruções adicionais sobre o arquivo..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white outline-none focus:border-[#030A8C] resize-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Responsável padrão (opcional) — aplica a todas as demandas; dá pra trocar uma a uma na revisão
                </label>
                <select
                  value={defaultResponsible}
                  onChange={(e) => setDefaultResponsible(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                >
                  <option value="">Deixar a IA sugerir</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={analyze}
                  disabled={mode === 'texto' ? text.trim().length < 10 : !file}
                  className="w-full sm:w-auto px-5 py-2 bg-[#030A8C] text-white rounded-lg text-sm font-semibold hover:bg-[#02077a] disabled:opacity-50 transition-colors"
                >
                  Analisar com IA
                </button>
              </div>
            </div>
          )}

          {/* Etapa 2: analisando */}
          {step === 2 && (
            <div className="py-16 text-center">
              <div className="w-10 h-10 border-2 border-[#030A8C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm font-semibold text-gray-900">Analisando o calendário e organizando as demandas…</p>
              <p className="text-xs text-gray-400 mt-1">
                Normalmente leva menos de um minuto. Se o modelo estiver sobrecarregado, tentamos de novo sozinhos — aguarde nesta tela.
              </p>
              <div className="max-w-md mx-auto mt-6 space-y-2 animate-pulse">
                {[...Array(3)].map((_, i) => <div key={i} className="h-9 bg-gray-100 rounded-lg" />)}
              </div>
            </div>
          )}

          {/* Etapa 3: revisão */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Análise concluída. Revise as sugestões antes de criar as demandas.
              </p>
              {rows.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">A IA não identificou nenhuma demanda no conteúdo.</p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-xs min-w-[980px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500 uppercase tracking-wide">
                        <th className="px-2 py-2 w-8">
                          <input
                            type="checkbox"
                            checked={selected.length === rows.length}
                            onChange={(e) => setRows((prev) => prev.map((r) => ({ ...r, selected: e.target.checked })))}
                          />
                        </th>
                        <th className="px-2 py-2">Demanda</th>
                        <th className="px-2 py-2">Cliente</th>
                        <th className="px-2 py-2">Responsável</th>
                        <th className="px-2 py-2">Data final</th>
                        <th className="px-2 py-2">Produção / Revisão</th>
                        <th className="px-2 py-2">Prioridade</th>
                        <th className="px-2 py-2">IA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const missing = r.selected && (!r.title.trim() || !r.clientId || !r.responsibleId || !r.dueDate)
                        return (
                          <tr key={r.itemId} className={`border-b border-gray-100 ${missing ? 'bg-orange-50/40' : ''}`}>
                            <td className="px-2 py-2 align-top">
                              <input type="checkbox" checked={r.selected} onChange={(e) => update(i, 'selected', e.target.checked)} />
                            </td>
                            <td className="px-2 py-2 align-top min-w-[220px]">
                              <input
                                value={r.title}
                                onChange={(e) => update(i, 'title', e.target.value)}
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs font-semibold text-gray-900"
                              />
                              <textarea
                                value={r.description}
                                onChange={(e) => update(i, 'description', e.target.value)}
                                rows={2}
                                className="w-full border border-gray-100 rounded px-2 py-1 text-[11px] text-gray-600 mt-1 resize-none"
                              />
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="text-[9px] bg-[#030A8C]/10 text-[#030A8C] px-1.5 py-0.5 rounded-full font-semibold">IA sugeriu</span>
                                {r.contentType && <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{r.contentType}</span>}
                                {r.platform && <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{r.platform}</span>}
                                {r.warnings.map((w) => (
                                  <span key={w} className="inline-flex items-center gap-0.5 text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">
                                    <AlertTriangle className="w-2 h-2" /> {w}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-2 py-2 align-top">
                              <select
                                value={r.clientId ?? ''}
                                onChange={(e) => update(i, 'clientId', e.target.value || null)}
                                className={`border rounded px-1.5 py-1 text-xs bg-white ${!r.clientId ? 'border-orange-300 text-orange-700' : 'border-gray-200 text-gray-900'}`}
                              >
                                <option value="">Selecionar...</option>
                                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              {r.clientNameDetected && !r.clientId && (
                                <p className="text-[9px] text-gray-400 mt-0.5">detectado: {r.clientNameDetected}</p>
                              )}
                            </td>
                            <td className="px-2 py-2 align-top">
                              <select
                                value={r.responsibleId ?? ''}
                                onChange={(e) => update(i, 'responsibleId', e.target.value || null)}
                                className={`border rounded px-1.5 py-1 text-xs bg-white ${!r.responsibleId ? 'border-orange-300 text-orange-700' : 'border-gray-200 text-gray-900'}`}
                              >
                                <option value="">Selecionar...</option>
                                {users.map((u) => <option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-2 align-top">
                              <input
                                type="date"
                                value={r.dueDate ?? ''}
                                onChange={(e) => update(i, 'dueDate', e.target.value || null)}
                                className={`border rounded px-1.5 py-1 text-xs bg-white ${!r.dueDate ? 'border-orange-300' : 'border-gray-200'} text-gray-900`}
                              />
                            </td>
                            <td className="px-2 py-2 align-top text-gray-500 whitespace-nowrap">
                              {fmtDate(r.productionDue)}<br />{fmtDate(r.reviewDue)}
                            </td>
                            <td className="px-2 py-2 align-top">
                              <select
                                value={r.priority}
                                onChange={(e) => update(i, 'priority', e.target.value)}
                                className="border border-gray-200 rounded px-1.5 py-1 text-xs bg-white text-gray-900"
                              >
                                {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-2 align-top">
                              <span className={`text-[10px] font-bold ${r.confidence >= 0.7 ? 'text-green-600' : r.confidence >= 0.4 ? 'text-orange-600' : 'text-red-500'}`}>
                                {Math.round(r.confidence * 100)}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Etapa 4: concluído */}
          {step === 4 && result && (
            <div className="py-14 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" />
              <p className="text-base font-bold text-gray-900">
                {result.created} demanda(s) criada(s)
              </p>
              {result.ignored > 0 && (
                <p className="text-sm text-gray-500 mt-1">{result.ignored} ignorada(s) por duplicidade.</p>
              )}
              <p className="text-xs text-gray-400 mt-2">Os responsáveis foram avisados pelo WhatsApp.</p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2 bg-[#030A8C] text-white rounded-lg text-sm font-semibold hover:bg-[#02077a] transition-colors"
              >
                Fechar
              </button>
            </div>
          )}
        </div>

        {/* Footer da revisão */}
        {step === 3 && rows.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-t border-gray-100 shrink-0">
            <p className="text-xs text-gray-500">
              {selected.length} de {rows.length} selecionada(s)
              {incomplete.length > 0 && (
                <span className="text-orange-600 font-medium"> · {incomplete.length} com pendências (cliente, responsável ou data)</span>
              )}
            </p>
            <button
              onClick={confirm}
              disabled={confirming || selected.length === 0 || incomplete.length > 0}
              className="w-full sm:w-auto px-5 py-2 bg-[#030A8C] text-white rounded-lg text-sm font-semibold hover:bg-[#02077a] disabled:opacity-50 transition-colors"
            >
              {confirming ? 'Criando...' : `Criar ${selected.length} demanda(s)`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
