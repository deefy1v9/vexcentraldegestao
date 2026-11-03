'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Sparkles, X, Upload, FileText, ArrowRight, ArrowLeft, Check, AlertTriangle,
  Trash2, Pencil, CalendarDays, List, Layers, Loader2, Info, RefreshCw,
} from 'lucide-react'

/* ---------------------------------- tipos ---------------------------------- */

interface ClientOption { id: string; name: string; tier?: string | null; operationalGroup?: string | null }
interface UserOption { id: string; name: string; position?: string | null; specialties?: string[] }
interface ServiceOption { id: string; serviceName: string; description?: string | null }

interface Conflict { kind: string; message: string; blocking: boolean }

export interface PlanItem {
  id: string
  ref: string
  title: string
  description?: string | null
  serviceKey: string
  competence: string
  publishAt: string
  productionAt?: string | null
  reviewAt?: string | null
  approvalAt?: string | null
  scheduleAt?: string | null
  assigneeId?: string | null
  reviewerId?: string | null
  schedulerId?: string | null
  priority: string
  weekGroup?: string | null
  origin: string
  sourceRef?: string | null
  confidence?: number | null
  conflicts?: Conflict[] | null
  notes: string[]
  status: string
  editedFields: string[]
  contentType?: string | null
  platform?: string | null
}

interface Delivery {
  service_label: string
  quantity: number | null
  quantity_period: string
  frequency: string
  weekdays: number[]
  specific_dates: string[]
  source_ref: string | null
  inferred_fields: string[]
  confidence: number
}

interface PreviewData {
  analysis: {
    id: string
    status: string
    fileName: string | null
    confidence: number | null
    warnings: string[]
    missing: string[]
    error: string | null
    deliveries: Delivery[]
    contractStart: string | null
    contractEnd: string | null
    responsibilities: { agency: string[]; client: string[]; approvals: string[] }
    observations: string[]
  }
  client: { id: string; name: string; tier: string | null; operationalGroup: string | null }
  proposal: {
    id: string
    status: string
    weekGroup: string | null
    groupReason: string | null
    summary: { notes?: string[]; periodStart?: string; periodEnd?: string; missing?: string[] } | null
    items: PlanItem[]
  } | null
  users: UserOption[]
}

const STEPS = ['Cliente e contrato', 'Instrução', 'Análise', 'Prévia', 'Confirmação']
const WEEKDAY_LABEL = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const PRIORITY_LABEL: Record<string, string> = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente' }

function fmtISO(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.slice(0, 10)
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

/* -------------------------------- componente -------------------------------- */

/**
 * "Organizar com IA": contrato → análise → proposta → revisão → demandas.
 *
 * Nenhuma demanda é criada antes da confirmação explícita. Todo o trabalho
 * pesado (leitura do arquivo, IA, conflitos) acontece no backend; aqui só
 * fica a revisão do administrador.
 */
export default function PlannerWizard({
  clients,
  onCreated,
}: {
  clients: ClientOption[]
  onCreated?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [clientId, setClientId] = useState('')
  const [services, setServices] = useState<ServiceOption[]>([])
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [data, setData] = useState<PreviewData | null>(null)
  const [view, setView] = useState<'lista' | 'calendario' | 'competencia'>('lista')
  const [editing, setEditing] = useState<PlanItem | null>(null)
  const [result, setResult] = useState<{ created: number; skipped: number; blocked: Array<{ ref: string; reason: string }> } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStep(0); setClientId(''); setServices([]); setSelectedServices([]); setFile(null)
    setNote(''); setError(null); setAnalysisId(null); setData(null); setResult(null)
    setEditing(null); setView('lista')
  }, [])

  // Serviços ativos do cliente escolhido (dados reais do cadastro)
  useEffect(() => {
    if (!clientId) return
    fetch(`/api/clientes/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        const list: ServiceOption[] = (c?.services ?? [])
          .filter((s: { status?: string }) => (s.status ?? 'ATIVO') === 'ATIVO')
          .map((s: ServiceOption) => ({ id: s.id, serviceName: s.serviceName, description: s.description }))
        setServices(list)
        setSelectedServices(list.map((s) => s.id))
      })
      .catch(() => setServices([]))
  }, [clientId])

  // Esc fecha o painel (sem perder o trabalho já confirmado)
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy])

  async function loadPreview(id: string) {
    const res = await fetch(`/api/planejamento/${id}`)
    if (!res.ok) { setError('Não foi possível carregar a prévia.'); return }
    setData(await res.json())
  }

  async function runAnalysis() {
    setBusy(true); setError(null); setStep(2)
    try {
      const form = new FormData()
      form.set('clientId', clientId)
      form.set('adminNote', note)
      form.set('serviceIds', selectedServices.join(','))
      if (file) form.set('file', file)
      const res = await fetch('/api/planejamento/analisar', { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Falha na análise.'); return }
      setAnalysisId(body.analysisId)
      await loadPreview(body.analysisId)
      setStep(3)
    } catch {
      setError('Falha de conexão com o servidor.')
    } finally {
      setBusy(false)
    }
  }

  async function rebuild() {
    if (!analysisId) return
    setBusy(true)
    try {
      await fetch(`/api/planejamento/${analysisId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      })
      await loadPreview(analysisId)
    } finally { setBusy(false) }
  }

  async function saveItem(item: PlanItem, patch: Record<string, unknown>) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/planejamento/itens/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível salvar.'); return }
      if (analysisId) await loadPreview(analysisId)
      setEditing(null)
    } finally { setBusy(false) }
  }

  async function discardItem(item: PlanItem) {
    setBusy(true)
    try {
      await fetch(`/api/planejamento/itens/${item.id}`, { method: 'DELETE' })
      if (analysisId) await loadPreview(analysisId)
    } finally { setBusy(false) }
  }

  async function confirmAll(itemIds?: string[]) {
    if (!analysisId || busy) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/planejamento/${analysisId}/confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: itemIds ?? [] }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || 'Não foi possível confirmar.'); return }
      setResult(body)
      setStep(4)
      onCreated?.()
    } finally { setBusy(false) }
  }

  async function cancelPlan() {
    if (analysisId) {
      await fetch(`/api/planejamento/${analysisId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      }).catch(() => {})
    }
    reset()
    setOpen(false)
  }

  const pending = useMemo(
    () => (data?.proposal?.items ?? []).filter((i) => i.status === 'PENDENTE' || i.status === 'APROVADO'),
    [data],
  )
  const blockingCount = useMemo(
    () => pending.filter((i) => (i.conflicts ?? []).some((c) => c.blocking)).length,
    [pending],
  )
  const noAssignee = useMemo(() => pending.filter((i) => !i.assigneeId).length, [pending])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-8 bg-ia text-ia-texto px-3 sm:px-4 rounded-lg text-xs font-semibold hover:bg-ia/90 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span className="hidden xs:inline sm:inline">Organizar com IA</span>
        <span className="xs:hidden sm:hidden">IA</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-veu flex items-stretch sm:items-center sm:justify-center sm:p-4 overflow-y-auto">
          <div className="bg-card w-full sm:max-w-5xl sm:rounded-[24px] shadow-xl flex flex-col sm:max-h-[92dvh] min-h-full sm:min-h-0">
            {/* Cabeçalho + passos */}
            <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-border shrink-0">
              <div className="min-w-0">
                <h2 className="font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-ia shrink-0" />
                  <span className="truncate">Organizar com IA</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  Etapa {step + 1} de {STEPS.length} · {STEPS[step]}
                </p>
              </div>
              <button
                onClick={() => (busy ? null : setOpen(false))}
                aria-label="Fechar"
                className="p-1.5 hover:bg-secondary rounded-lg transition-colors shrink-0"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Trilha de progresso (some no mobile estreito) */}
            <div className="hidden sm:flex items-center gap-1 px-5 py-3 border-b border-border shrink-0 overflow-x-auto">
              {STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-1 shrink-0">
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                      i === step ? 'bg-marca text-white'
                        : i < step ? 'bg-marca/10 text-marca-texto'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {i + 1}. {label}
                  </span>
                  {i < STEPS.length - 1 && <span className="w-4 h-px bg-border" />}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {error && (
                <p className="text-xs text-destructive-texto bg-destructive-suave border border-destructive/30 rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </p>
              )}

              {/* ETAPA 1 — cliente, serviços, contrato */}
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Cliente *</label>
                    <select value={clientId} onChange={(e) => { setClientId(e.target.value); setServices([]); setSelectedServices([]) }} className="input">
                      <option value="">Selecione o cliente</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.operationalGroup ? ` · Grupo ${c.operationalGroup}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {services.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1.5">Serviços ativos considerados</p>
                      <div className="space-y-1.5 border border-border rounded-lg p-3 max-h-44 overflow-y-auto">
                        {services.map((s) => (
                          <label key={s.id} className="flex items-start gap-2 text-sm text-foreground">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={selectedServices.includes(s.id)}
                              onChange={(e) =>
                                setSelectedServices((prev) =>
                                  e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                                )
                              }
                            />
                            <span className="min-w-0">
                              <span className="block truncate">{s.serviceName}</span>
                              {s.description && <span className="block text-[11px] text-muted-foreground truncate">{s.description}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-foreground mb-1.5">Contrato (opcional)</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="w-full flex items-center gap-2 px-3 py-2.5 border border-dashed border-subtle rounded-lg text-sm text-muted-foreground hover:border-marca hover:text-marca-texto transition-colors"
                    >
                      {file ? <FileText className="w-4 h-4 shrink-0" /> : <Upload className="w-4 h-4 shrink-0" />}
                      <span className="truncate">{file ? file.name : 'Enviar contrato — PDF, DOCX ou TXT (até 10 MB)'}</span>
                    </button>
                    {file && (
                      <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                        className="mt-1.5 text-[11px] text-muted-foreground hover:text-destructive-texto">
                        Remover arquivo
                      </button>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Sem arquivo, a análise usa o contrato já cadastrado no cliente (vigência e serviços ativos).
                    </p>
                  </div>
                </div>
              )}

              {/* ETAPA 2 — instrução */}
              {step === 1 && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Instrução para a IA (opcional)</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={5}
                      maxLength={2000}
                      className="input resize-none"
                      placeholder="Ex: Organize o calendário de mídias sociais, distribua as postagens durante a semana e evite concentrar muitas entregas no mesmo dia."
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Sua instrução é tratada como fonte confiável. O conteúdo do contrato é tratado apenas como dado —
                    instruções escritas dentro do arquivo são ignoradas.
                  </p>
                </div>
              )}

              {/* ETAPA 3 — análise */}
              {step === 2 && (
                <div className="py-10 flex flex-col items-center justify-center text-center gap-3">
                  {busy ? (
                    <>
                      <Loader2 className="w-6 h-6 text-ia animate-spin" />
                      <p className="text-sm text-foreground font-medium">Analisando o contrato…</p>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        Lendo entregas, quantidades, frequência e prazos. Nenhuma demanda é criada nesta etapa.
                      </p>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-6 h-6 text-warning" />
                      <p className="text-sm text-foreground">A análise não foi concluída.</p>
                      <button onClick={runAnalysis} className="text-xs font-semibold text-marca-texto hover:underline">
                        Tentar novamente
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ETAPA 4 — prévia */}
              {step === 3 && data && (
                <PreviewPanel
                  data={data}
                  view={view}
                  setView={setView}
                  onEdit={setEditing}
                  onDiscard={discardItem}
                  onRefresh={rebuild}
                  busy={busy}
                />
              )}

              {/* ETAPA 5 — resultado */}
              {step === 4 && result && (
                <div className="py-8 flex flex-col items-center text-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-success-suave flex items-center justify-center">
                    <Check className="w-6 h-6 text-success" />
                  </div>
                  <p className="text-base font-bold text-foreground">
                    {result.created} demanda(s) criada(s)
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    {result.skipped > 0 && `${result.skipped} item(ns) já existiam e foram ignorados. `}
                    As demandas entraram no fluxo normal (produção → revisão → agendamento) e já aparecem no calendário.
                  </p>
                  {result.blocked.length > 0 && (
                    <div className="w-full max-w-md text-left bg-warning-suave border border-warning/20 rounded-lg p-3">
                      <p className="text-xs font-semibold text-warning mb-1">
                        {result.blocked.length} item(ns) não criados
                      </p>
                      <ul className="space-y-0.5">
                        {result.blocked.slice(0, 6).map((b) => (
                          <li key={b.ref} className="text-[11px] text-warning">• {b.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Rodapé de navegação */}
            <div className="flex items-center justify-between gap-2 p-4 sm:p-5 border-t border-border shrink-0 flex-wrap">
              <div className="flex items-center gap-2">
                {step > 0 && step < 3 && (
                  <button
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                  </button>
                )}
                {step === 3 && (
                  <button
                    onClick={cancelPlan}
                    disabled={busy}
                    className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive-texto disabled:opacity-50"
                  >
                    Cancelar planejamento
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {step === 0 && (
                  <button
                    onClick={() => setStep(1)}
                    disabled={!clientId}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary-hover disabled:opacity-40 transition-colors"
                  >
                    Continuar <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {step === 1 && (
                  <button
                    onClick={runAnalysis}
                    disabled={busy || !clientId}
                    className="flex items-center gap-1.5 px-4 py-2 bg-ia text-ia-texto rounded-lg text-xs font-semibold hover:bg-ia/90 disabled:opacity-40 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Analisar
                  </button>
                )}
                {step === 3 && (
                  <>
                    {(blockingCount > 0 || noAssignee > 0) && (
                      <span className="text-[11px] text-warning mr-1">
                        {blockingCount > 0 && `${blockingCount} com conflito bloqueante`}
                        {blockingCount > 0 && noAssignee > 0 && ' · '}
                        {noAssignee > 0 && `${noAssignee} sem responsável`}
                      </span>
                    )}
                    <button
                      onClick={() => confirmAll()}
                      disabled={busy || pending.length === 0}
                      className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary-hover disabled:opacity-40 transition-colors"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Criar {pending.length} demanda(s)
                    </button>
                  </>
                )}
                {step === 4 && (
                  <button
                    onClick={() => { reset(); setOpen(false) }}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary-hover transition-colors"
                  >
                    Concluir
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Edição de um item sugerido */}
          {editing && data && (
            <ItemEditor
              item={editing}
              users={data.users}
              busy={busy}
              onClose={() => setEditing(null)}
              onSave={(patch) => saveItem(editing, patch)}
            />
          )}
        </div>
      )}
    </>
  )
}

/* --------------------------------- prévia --------------------------------- */

function PreviewPanel({
  data, view, setView, onEdit, onDiscard, onRefresh, busy,
}: {
  data: PreviewData
  view: 'lista' | 'calendario' | 'competencia'
  setView: (v: 'lista' | 'calendario' | 'competencia') => void
  onEdit: (i: PlanItem) => void
  onDiscard: (i: PlanItem) => void
  onRefresh: () => void
  busy: boolean
}) {
  const items = (data.proposal?.items ?? []).filter((i) => i.status !== 'DESCARTADO')
  const summary = data.proposal?.summary ?? null
  const userName = (id?: string | null) => data.users.find((u) => u.id === id)?.name ?? null

  return (
    <div className="space-y-4">
      {/* Resumo da extração — origem e lacunas */}
      <div className="bg-secondary/60 border border-border rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold text-foreground">
            {data.client.name}
            {data.proposal?.weekGroup && (
              <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-marca/10 text-marca-texto">
                Grupo {data.proposal.weekGroup}
              </span>
            )}
            {data.analysis.confidence != null && (
              <span className="ml-2 text-[10px] text-muted-foreground">
                confiança {(data.analysis.confidence * 100).toFixed(0)}%
              </span>
            )}
          </p>
          <button onClick={onRefresh} disabled={busy} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-marca-texto disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} /> Recalcular conflitos
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Vigência: {fmtISO(data.analysis.contractStart)} → {fmtISO(data.analysis.contractEnd)}
          {summary?.periodStart && ` · planejado de ${fmtISO(summary.periodStart)} a ${fmtISO(summary.periodEnd)}`}
        </p>
        {data.proposal?.groupReason && (
          <p className="text-[11px] text-muted-foreground">{data.proposal.groupReason}</p>
        )}

        {data.analysis.deliveries.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.analysis.deliveries.map((d, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground">
                {d.service_label}
                {d.quantity != null && ` · ${d.quantity}/${d.quantity_period === 'semana' ? 'semana' : d.quantity_period === 'mes' ? 'mês' : 'total'}`}
                {d.weekdays.length > 0 && ` · ${d.weekdays.map((w) => WEEKDAY_LABEL[w]).join('/')}`}
                {d.inferred_fields.length > 0 && ' · sugerido pela IA'}
              </span>
            ))}
          </div>
        )}

        {(data.analysis.missing.length > 0 || (summary?.notes?.length ?? 0) > 0) && (
          <div className="space-y-1 pt-1">
            {data.analysis.missing.slice(0, 5).map((m, i) => (
              <p key={`m${i}`} className="text-[11px] text-warning flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {m}
              </p>
            ))}
            {(summary?.notes ?? []).slice(0, 5).map((n, i) => (
              <p key={`n${i}`} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <Info className="w-3 h-3 shrink-0 mt-0.5" /> {n}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Alternador de visão + legenda */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
          {([['lista', List], ['calendario', CalendarDays], ['competencia', Layers]] as const).map(([key, Icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold capitalize transition-colors ${
                view === key ? 'bg-card text-marca-texto shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {key === 'competencia' ? 'Por mês' : key}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-marca" /> Do contrato</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ia" /> Sugerido pela IA</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-info" /> Editado</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive" /> Conflito</span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhuma entrega sugerida. Verifique as lacunas apontadas acima.
        </p>
      ) : view === 'lista' ? (
        <div className="space-y-2">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} userName={userName} onEdit={onEdit} onDiscard={onDiscard} busy={busy} />
          ))}
        </div>
      ) : view === 'competencia' ? (
        <div className="space-y-4">
          {[...new Set(items.map((i) => i.competence))].sort().map((comp) => (
            <div key={comp}>
              <p className="text-xs font-bold text-foreground mb-1.5">
                {comp.split('-').reverse().join('/')} · {items.filter((i) => i.competence === comp).length} entrega(s)
              </p>
              <div className="space-y-2">
                {items.filter((i) => i.competence === comp).map((item) => (
                  <ItemRow key={item.id} item={item} userName={userName} onEdit={onEdit} onDiscard={onDiscard} busy={busy} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <PreviewCalendar items={items} onEdit={onEdit} />
      )}
    </div>
  )
}

function ItemRow({
  item, userName, onEdit, onDiscard, busy,
}: {
  item: PlanItem
  userName: (id?: string | null) => string | null
  onEdit: (i: PlanItem) => void
  onDiscard: (i: PlanItem) => void
  busy: boolean
}) {
  const conflicts = item.conflicts ?? []
  const blocking = conflicts.filter((c) => c.blocking)
  const dot = blocking.length > 0 ? 'bg-destructive'
    : item.editedFields.length > 0 ? 'bg-info'
    : item.origin === 'CONTRATO' ? 'bg-marca' : 'bg-ia'

  return (
    <div className={`border rounded-xl p-3 ${blocking.length > 0 ? 'border-destructive/30 bg-destructive-suave' : 'border-border bg-card'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
            <span className="truncate">{item.title}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Publicação {fmtISO(item.publishAt)} · produção {fmtISO(item.productionAt)} · revisão {fmtISO(item.reviewAt)}
            {item.scheduleAt ? ` · agendamento ${fmtISO(item.scheduleAt)}` : ''}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {userName(item.assigneeId) ?? <span className="text-warning font-medium">Não atribuído</span>}
            {item.reviewerId && ` · revisão: ${userName(item.reviewerId)}`}
            {' · '}{PRIORITY_LABEL[item.priority] ?? item.priority}
            {item.weekGroup && ` · Grupo ${item.weekGroup}`}
          </p>
          {item.sourceRef && (
            <p className="text-[10px] text-muted-foreground mt-1 italic truncate" title={item.sourceRef}>
              origem: “{item.sourceRef}”
            </p>
          )}
          {item.notes.map((n, i) => (
            <p key={i} className="text-[10px] text-muted-foreground mt-0.5">{n}</p>
          ))}
          {conflicts.map((c, i) => (
            <p key={i} className={`text-[11px] mt-1 flex items-start gap-1.5 ${c.blocking ? 'text-destructive-texto font-medium' : 'text-warning'}`}>
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {c.message}
            </p>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(item)}
            disabled={busy}
            aria-label={`Editar ${item.title}`}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-marca-texto hover:bg-secondary disabled:opacity-50 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDiscard(item)}
            disabled={busy}
            aria-label={`Remover ${item.title}`}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive-texto hover:bg-destructive-suave disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Mini-calendário da prévia: entregas por dia, com alerta de concentração. */
function PreviewCalendar({ items, onEdit }: { items: PlanItem[]; onEdit: (i: PlanItem) => void }) {
  const byDate = new Map<string, PlanItem[]>()
  for (const i of items) {
    const key = i.publishAt.slice(0, 10)
    byDate.set(key, [...(byDate.get(key) ?? []), i])
  }
  const dates = [...byDate.keys()].sort()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {dates.map((date) => {
        const list = byDate.get(date)!
        return (
          <div key={date} className={`border rounded-xl p-2.5 ${list.length > 3 ? 'border-warning/30 bg-warning-suave' : 'border-border bg-card'}`}>
            <p className="text-[11px] font-bold text-foreground mb-1.5">
              {fmtISO(date)}
              <span className="ml-1.5 font-normal text-muted-foreground">{list.length} entrega(s)</span>
            </p>
            <div className="space-y-1">
              {list.map((i) => (
                <button
                  key={i.id}
                  onClick={() => onEdit(i)}
                  className="w-full text-left text-[11px] px-2 py-1 rounded-lg bg-secondary/60 hover:bg-secondary text-foreground truncate transition-colors"
                >
                  {i.title}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------- edição -------------------------------- */

function ItemEditor({
  item, users, busy, onClose, onSave,
}: {
  item: PlanItem
  users: UserOption[]
  busy: boolean
  onClose: () => void
  onSave: (patch: Record<string, unknown>) => void
}) {
  const [title, setTitle] = useState(item.title)
  const [publishAt, setPublishAt] = useState(item.publishAt.slice(0, 10))
  const [assigneeId, setAssigneeId] = useState(item.assigneeId ?? '')
  const [reviewerId, setReviewerId] = useState(item.reviewerId ?? '')
  const [priority, setPriority] = useState(item.priority)
  const [weekGroup, setWeekGroup] = useState(item.weekGroup ?? '')
  const [editNote, setEditNote] = useState('')

  return (
    <div className="fixed inset-0 z-[60] bg-veu flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] shadow-xl max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <p className="font-semibold text-foreground text-sm">Editar sugestão</p>
          <button onClick={onClose} aria-label="Fechar" className="p-1 hover:bg-secondary rounded-lg">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Publicação</label>
              <input type="date" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Prioridade</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input">
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Produção</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="input">
                <option value="">Não atribuído</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Revisão</label>
              <select value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} className="input">
                <option value="">Não atribuído</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Grupo</label>
              <select value={weekGroup} onChange={(e) => setWeekGroup(e.target.value)} className="input">
                <option value="">Sem grupo</option>
                <option value="A">Grupo A</option>
                <option value="B">Grupo B</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Motivo da alteração (opcional)</label>
            <input value={editNote} onChange={(e) => setEditNote(e.target.value)} className="input" placeholder="Fica registrado para melhorar as próximas sugestões" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Mudar a data recalcula automaticamente produção, revisão e agendamento.
          </p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} disabled={busy} className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={() => onSave({
              title, publishAt,
              assigneeId: assigneeId || null,
              reviewerId: reviewerId || null,
              priority,
              weekGroup: weekGroup || null,
              editNote: editNote || undefined,
            })}
            disabled={busy || !title.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary-hover disabled:opacity-40 transition-colors"
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
