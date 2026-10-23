'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Bot, CalendarClock, Check, CheckCircle2, ChevronRight, CornerUpLeft, ExternalLink, History, Loader2, MessageSquare, Paperclip, Send, Shuffle, FileText,
} from 'lucide-react'
import TaskBrief from '../TaskBrief'
import { Badge } from '@/components/vex/badge'
import { Button } from '@/components/vex/button'
import { Card } from '@/components/vex/card'
import { Avatar } from './ListaTarefas'
import {
  FIELD_LABEL, checklistKey, missingToAdvance, ordered, prazoAtual, prazosDasEtapas, stageActions,
  type StageField, type StageLike,
} from '@/lib/processos'
import { TAG_AGENTE } from '@/lib/mcp/regras-agente'

interface UserRef { id: string; name: string }
interface Stage extends StageLike { defaultUser?: UserRef | null }
interface FullTask {
  id: string
  number: number
  title: string
  description?: string | null
  status: string
  priority: string
  dueDate?: string | null
  platform?: string | null
  contentType?: string | null
  driveLink?: string | null
  publicationLink?: string | null
  scheduledFor?: string | null
  stageId?: string | null
  stageEnteredAt?: string | null
  checklistDone: string[]
  processData?: Record<string, { link?: string; note?: string }> | null
  stageDeadlines?: Record<string, string> | null
  tags?: string[]
  reviewNote?: string | null
  client?: { id: string; name: string } | null
  assignee?: UserRef | null
  assigneeId?: string | null
  producer?: UserRef | null
  reviewer?: UserRef | null
  scheduler?: UserRef | null
  creator?: UserRef | null
  process?: { id: string; name: string; color: string; stages: Stage[] } | null
  team?: { id: string; name: string; color: string } | null
  comments: Array<{ id: string; content: string; createdAt: string; user: UserRef }>
  events: Array<{ id: string; kind: string; detail: string; createdAt: string; user?: UserRef | null }>
  attachments: Array<{ id: string; fileName: string; fileUrl: string }>
}

type Aba = 'briefing' | 'comentarios' | 'historico'

const fmtData = (d?: string | Date | null, hora = false) => {
  if (!d) return '—'
  const x = new Date(d)
  return hora
    ? x.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Data local no formato do campo de data (aaaa-mm-dd). */
const diaDoCampo = (d?: string | Date | null) => {
  if (!d) return ''
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** Dia escolhido no campo, mantendo a hora que já existia (ou 18h). */
const diaComHora = (dia: string, base?: string | null) => {
  const ref = base ? new Date(base) : null
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(a, m - 1, d, ref ? ref.getHours() : 18, ref ? ref.getMinutes() : 0).toISOString()
}

function comLinks(texto: string) {
  return texto.split(/(https?:\/\/\S+)/g).map((parte, i) => (
    /^https?:\/\//.test(parte)
      ? <a key={i} href={parte} target="_blank" rel="noopener noreferrer" className="text-link underline break-all">{parte}</a>
      : <span key={i}>{parte}</span>
  ))
}

/** Linha de etapas: feitas, atual e próximas. */
function TrilhaDeEtapas({ stages, atualId, concluida }: { stages: Stage[]; atualId?: string | null; concluida: boolean }) {
  const lista = ordered(stages)
  const iAtual = concluida ? lista.length - 1 : Math.max(0, lista.findIndex((s) => s.id === atualId))
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-0.5" aria-label="Etapas do processo">
      {lista.map((s, i) => {
        const feita = i < iAtual || (concluida && i === iAtual)
        const atual = i === iAtual && !concluida
        return (
          <li key={s.id} className="flex items-center gap-1 shrink-0" aria-current={atual ? 'step' : undefined}>
            <span className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-md text-[11.5px] font-medium border ${
              atual ? 'bg-marca text-white border-marca' : feita ? 'bg-success-suave text-success border-transparent' : 'bg-card text-muted-foreground border-border'
            }`}>
              {feita && <Check className="w-3 h-3" />}{s.name}
            </span>
            {i < lista.length - 1 && <ChevronRight className="w-3 h-3 text-subtle shrink-0" />}
          </li>
        )
      })}
    </ol>
  )
}

export default function ResumoTarefa({
  taskId, currentUserId, isAdmin, myTeamIds = [], users = [], onChanged, onVoltar,
}: {
  taskId: string
  currentUserId: string
  isAdmin: boolean
  myTeamIds?: string[]
  users?: Array<{ id: string; name: string }>
  onChanged: () => void
  onVoltar: () => void
}) {
  const [t, setT] = useState<FullTask | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('briefing')
  const [busy, setBusy] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  // campos do formulário da etapa
  const [driveLink, setDriveLink] = useState('')
  const [link, setLink] = useState('')
  const [publicationLink, setPublicationLink] = useState('')
  const [publicationDate, setPublicationDate] = useState('')
  const [nota, setNota] = useState('')
  const [moverPara, setMoverPara] = useState('')
  const [comentario, setComentario] = useState('')
  // prazos por etapa em edição (admin): stageId → aaaa-mm-dd ('' = automático)
  const [prazosEdit, setPrazosEdit] = useState<Record<string, string>>({})
  const [avisoDatas, setAvisoDatas] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  /** Busca a tarefa; null quando não abre. */
  const buscar = useCallback(async (): Promise<FullTask | null> => {
    const r = await fetch(`/api/demandas/${taskId}`, { cache: 'no-store' })
    return r.ok ? r.json() : null
  }, [taskId])

  const aplicar = useCallback((b: FullTask | null) => {
    if (!b) { setErroCarga('Não foi possível abrir esta tarefa.'); return }
    setErroCarga(null)
    setT(b)
    setDriveLink(b.driveLink ?? '')
    setPublicationLink(b.publicationLink ?? '')
    setPublicationDate(b.scheduledFor ? new Date(b.scheduledFor).toISOString().slice(0, 16) : '')
    setLink(b.stageId ? (b.processData?.[b.stageId]?.link ?? '') : '')
    setNota('')
    setMoverPara('')
    setPrazosEdit(Object.fromEntries(Object.entries(b.stageDeadlines ?? {}).map(([k, v]) => [k, diaDoCampo(v)])))
  }, [])

  const carregar = useCallback(async () => { aplicar(await buscar()) }, [buscar, aplicar])

  // O painel é remontado a cada tarefa (key na lista): basta carregar uma vez
  useEffect(() => {
    let vivo = true
    buscar().then((b) => { if (vivo) aplicar(b) })
    return () => { vivo = false }
  }, [buscar, aplicar])

  const stages = useMemo(() => (t?.process ? ordered(t.process.stages) : []), [t])
  const atual = useMemo(() => stages.find((s) => s.id === t?.stageId) ?? null, [stages, t])
  const concluida = t?.status === 'CONCLUIDO' || atual?.kind === 'FINAL'
  // Na fila de uma equipe: alguém da equipe (ou admin) assume antes de agir
  const emFila = !!t && !concluida && !t.assigneeId && !!t.team
  const podeAssumir = emFila && (isAdmin || (!!t?.team && myTeamIds.includes(t.team.id)))
  const podeAgir = !!t && !concluida && (isAdmin || t.assigneeId === currentUserId)
  const acoes = atual ? stageActions(atual) : null
  const prazoEtapa = atual && t ? prazoAtual(atual, t) : null
  const atrasada = !!prazoEtapa && !concluida && prazoEtapa.getTime() < new Date().setHours(0, 0, 0, 0)
  const planoPrazos = useMemo(() => (t && stages.length ? prazosDasEtapas(stages, t) : []), [stages, t])
  const prazosMudaram = !!t && planoPrazos.some((p) => p.situacao !== 'feita' && (prazosEdit[p.id] ?? '') !== diaDoCampo(t.stageDeadlines?.[p.id]))

  const entrada = { driveLink, link, publicationLink, publicationDate: publicationDate || undefined, note: nota }
  const falta = atual && t ? missingToAdvance(atual, t, entrada) : []

  async function etapa(action: 'avancar' | 'devolver' | 'mover', extra: Record<string, unknown> = {}) {
    setBusy(action); setAviso(null)
    try {
      const r = await fetch(`/api/demandas/${taskId}/etapa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...entrada, publicationDate: publicationDate ? new Date(publicationDate).toISOString() : undefined, ...extra }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso({ tipo: 'erro', texto: b.error || 'Não foi possível concluir.' }); return }
      setAviso({ tipo: 'ok', texto: action === 'devolver' ? 'Ajuste pedido. A tarefa voltou para a etapa anterior.' : action === 'mover' ? 'Tarefa movida.' : 'Etapa concluída. A tarefa seguiu para a próxima.' })
      await carregar()
      onChanged()
    } finally { setBusy(null) }
  }

  async function assumir() {
    setBusy('assumir'); setAviso(null)
    try {
      const r = await fetch(`/api/demandas/${taskId}/etapa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assumir' }) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso({ tipo: 'erro', texto: b.error || 'Não foi possível assumir.' }); return }
      await carregar(); onChanged()
    } finally { setBusy(null) }
  }

  /** Admin troca quem está com a etapa (ou devolve para a fila da equipe). */
  async function trocarResponsavel(id: string) {
    setBusy('responsavel'); setAviso(null)
    try {
      const r = await fetch(`/api/demandas/${taskId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigneeId: id || null }) })
      if (!r.ok) { const b = await r.json().catch(() => ({})); setAviso({ tipo: 'erro', texto: b.error || 'Não foi possível trocar o responsável.' }); return }
      await carregar(); onChanged()
    } finally { setBusy(null) }
  }

  /** Admin: grava data final e/ou prazos por etapa. */
  async function salvarDatas(body: Record<string, unknown>, ok: string) {
    setBusy('datas'); setAvisoDatas(null)
    try {
      const r = await fetch(`/api/demandas/${taskId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) { setAvisoDatas({ tipo: 'erro', texto: b.error || 'Não foi possível salvar as datas.' }); return }
      setAvisoDatas({ tipo: 'ok', texto: ok })
      await carregar(); onChanged()
    } finally { setBusy(null) }
  }

  /** Admin: põe ou tira a demanda da fila do agente de IA (tag agente-ia). */
  function filaDoAgente(ligar: boolean) {
    if (!t) return
    const tags = (t.tags ?? []).filter((x) => x !== TAG_AGENTE)
    salvarDatas({ tags: ligar ? [...tags, TAG_AGENTE] : tags }, ligar ? 'Na fila do agente de IA: ele pode trabalhar nesta demanda pelo conector.' : 'Saiu da fila do agente de IA.')
  }

  function salvarPrazos() {
    if (!t) return
    const editaveis = planoPrazos.filter((p) => p.situacao !== 'feita')
    const stageDeadlines = Object.fromEntries(editaveis.map((p) => [
      p.id, prazosEdit[p.id] ? diaComHora(prazosEdit[p.id], t.stageDeadlines?.[p.id] ?? t.dueDate) : null,
    ]))
    salvarDatas({ stageDeadlines }, 'Prazos por etapa salvos. Cada etapa assume o prazo dela quando a tarefa chegar nela.')
  }

  async function marcar(key: string, checked: boolean) {
    if (!t) return
    setT({ ...t, checklistDone: checked ? [...t.checklistDone, key] : t.checklistDone.filter((k) => k !== key) })
    const r = await fetch(`/api/demandas/${taskId}/etapa`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'checklist', checklistKey: key, checked }),
    })
    if (!r.ok) { const b = await r.json().catch(() => ({})); setAviso({ tipo: 'erro', texto: b.error || 'Não foi possível marcar.' }); carregar() }
  }

  async function comentar() {
    if (!comentario.trim()) return
    setBusy('comentar')
    const r = await fetch(`/api/demandas/${taskId}/comentarios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: comentario.trim() }),
    })
    setBusy(null)
    if (r.ok) { setComentario(''); carregar() }
  }

  if (erroCarga) return <div className="p-8 t-corpo text-destructive-texto">{erroCarga}</div>
  if (!t) {
    return (
      <div className="p-5 space-y-3 animate-pulse">
        <div className="h-4 w-1/3 bg-secondary rounded-md" /><div className="h-6 w-2/3 bg-secondary rounded-md" /><div className="h-28 bg-secondary rounded-[12px]" /><div className="h-40 bg-secondary rounded-[12px]" />
      </div>
    )
  }

  const campos = (atual?.fields ?? []) as StageField[]
  const inputCls = 'w-full h-9 px-3 rounded-lg border border-border bg-card t-corpo text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
  const rotulo = 't-rotulo text-foreground'

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* cabeçalho */}
      <div className="px-5 pt-4 pb-4 border-b border-border shrink-0 space-y-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onVoltar} className="lg:hidden -ml-2" aria-label="Voltar para a lista">
            <ArrowLeft />
          </Button>
          <p className="t-rotulo text-muted-foreground truncate flex-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.process?.color ?? 'var(--subtle)' }} />
            {t.process?.name ?? 'Sem processo'} · #{t.number}
          </p>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/demandas/${t.id}`}><ExternalLink /> Abrir página</Link>
          </Button>
        </div>
        <h2 className="t-pagina text-foreground">{t.title}</h2>
        <dl className="flex flex-wrap gap-x-6 gap-y-1">
          <div className="flex gap-1.5 t-rotulo"><dt className="text-muted-foreground">Cliente</dt><dd className="text-foreground">{t.client?.name ?? '—'}</dd></div>
          <div className="flex items-center gap-1.5 t-rotulo"><dt className="text-muted-foreground">Data final</dt>
            <dd className="text-foreground">
              {isAdmin && !concluida ? (
                <input
                  type="date"
                  value={diaDoCampo(t.dueDate)}
                  disabled={busy === 'datas'}
                  onChange={(e) => e.target.value && salvarDatas({ dueDate: diaComHora(e.target.value, t.dueDate) }, 'Data final alterada.')}
                  aria-label="Data final da demanda"
                  className="bg-transparent text-foreground font-medium rounded-md hover:bg-accent px-1 py-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                />
              ) : fmtData(t.dueDate)}
            </dd>
          </div>
          {t.platform && <div className="flex gap-1.5 t-rotulo"><dt className="text-muted-foreground">Plataforma</dt><dd className="text-foreground">{t.platform}</dd></div>}
          {isAdmin && !concluida ? (
            <label className="flex items-center gap-1.5 t-rotulo text-foreground cursor-pointer">
              <input type="checkbox" checked={(t.tags ?? []).includes(TAG_AGENTE)} disabled={busy === 'datas'} onChange={(e) => filaDoAgente(e.target.checked)} className="w-3.5 h-3.5 accent-[var(--marca)]" />
              <Bot className="w-3.5 h-3.5 text-muted-foreground" /> Fila do agente de IA
            </label>
          ) : (t.tags ?? []).includes(TAG_AGENTE) && (
            <div className="flex items-center gap-1.5 t-rotulo text-muted-foreground"><Bot className="w-3.5 h-3.5" /> Fila do agente de IA</div>
          )}
        </dl>
        {stages.length > 0 && <TrilhaDeEtapas stages={stages} atualId={t.stageId} concluida={concluida} />}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-background p-2 space-y-2">
        {/* etapa atual e ações */}
        <Card>
          <div className="p-4 flex flex-wrap items-center gap-3">
            <Avatar nome={t.assignee?.name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="t-rotulo text-muted-foreground">{concluida ? 'Tarefa' : 'Etapa atual'}</p>
              <p className="t-secao text-foreground">{concluida ? 'Concluída' : atual?.name ?? '—'}</p>
              {!concluida && (isAdmin && users.length > 0 ? (
                <label className="t-rotulo text-muted-foreground inline-flex items-center gap-1">
                  com
                  <select
                    value={t.assigneeId ?? ''}
                    onChange={(e) => trocarResponsavel(e.target.value)}
                    disabled={busy === 'responsavel'}
                    aria-label="Responsável pela etapa"
                    className="bg-transparent text-foreground font-medium rounded-md hover:bg-accent px-1 py-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <option value="">{t.team ? `Fila da equipe ${t.team.name}` : 'Ninguém'}</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </label>
              ) : (
                <p className="t-rotulo text-muted-foreground">{emFila ? `na fila da equipe ${t.team?.name}` : `com ${t.assignee?.name ?? 'ninguém'}`}</p>
              ))}
            </div>
            {!concluida && (
              <div className="text-right space-y-1">
                <p className="t-rotulo text-muted-foreground">Prazo da etapa</p>
                {atrasada
                  ? <Badge variant="danger">Atrasada · {prazoEtapa ? fmtData(prazoEtapa) : '—'}</Badge>
                  : <p className="t-secao text-foreground">{prazoEtapa ? fmtData(prazoEtapa) : '—'}</p>}
              </div>
            )}
          </div>

          {emFila && (
            <div className="mx-4 mb-4 rounded-lg bg-warning-suave px-3 py-2.5 flex flex-wrap items-center gap-3">
              <p className="t-rotulo text-warning flex-1 min-w-[180px]">
                Na fila da equipe <span className="font-semibold">{t.team?.name}</span>. Ninguém assumiu ainda.
              </p>
              {podeAssumir && (
                <Button type="button" size="sm" onClick={assumir} disabled={busy === 'assumir'}>
                  {busy === 'assumir' ? <Loader2 className="animate-spin" /> : <Check />} Assumir tarefa
                </Button>
              )}
            </div>
          )}

          {concluida ? (
            <div className="px-4 pb-4 flex items-center gap-2 t-corpo text-success"><CheckCircle2 className="w-4 h-4" /> Esta tarefa terminou o processo.</div>
          ) : emFila && !isAdmin ? null : !podeAgir ? (
            <div className="px-4 pb-4 t-corpo text-muted-foreground">Aguardando <span className="font-semibold text-foreground">{t.assignee?.name ?? 'o responsável'}</span> concluir &ldquo;{atual?.name}&rdquo;.</div>
          ) : (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-4">
              {atual?.instructions && <p className="t-corpo text-foreground bg-secondary rounded-lg px-3 py-2">{atual.instructions}</p>}
              {t.reviewNote && atual?.kind !== 'APROVACAO' && (
                <p className="t-rotulo text-warning bg-warning-suave rounded-lg px-3 py-2"><span className="font-semibold">Último ajuste pedido:</span> {t.reviewNote}</p>
              )}

              {campos.includes('LINK_DRIVE') && (
                <label className="block space-y-1.5"><span className={rotulo}>{FIELD_LABEL.LINK_DRIVE}</span>
                  <input value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/…" className={inputCls} /></label>
              )}
              {campos.includes('LINK') && (
                <label className="block space-y-1.5"><span className={rotulo}>{FIELD_LABEL.LINK}</span>
                  <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={inputCls} /></label>
              )}
              {campos.includes('DATA_PUBLICACAO') && (
                <label className="block space-y-1.5"><span className={rotulo}>{FIELD_LABEL.DATA_PUBLICACAO}</span>
                  <input type="datetime-local" value={publicationDate} onChange={(e) => setPublicationDate(e.target.value)} className={inputCls} /></label>
              )}
              {campos.includes('LINK_PUBLICACAO') && (
                <label className="block space-y-1.5"><span className={rotulo}>{FIELD_LABEL.LINK_PUBLICACAO}</span>
                  <input value={publicationLink} onChange={(e) => setPublicationLink(e.target.value)} placeholder="https://…" className={inputCls} /></label>
              )}

              {atual && atual.checklist.length > 0 && (
                <div className="space-y-2">
                  <p className={rotulo}>Checklist{atual.checklistRequired ? ' (obrigatório para concluir)' : ''}</p>
                  {atual.checklist.map((item, i) => {
                    const key = checklistKey(atual.id, i)
                    const ok = t.checklistDone.includes(key)
                    return (
                      <label key={key} className="flex items-center gap-2 t-corpo text-foreground cursor-pointer">
                        <input type="checkbox" checked={ok} onChange={(e) => marcar(key, e.target.checked)} className="w-4 h-4 accent-[var(--marca)]" />
                        <span className={ok ? 'line-through text-muted-foreground' : ''}>{item}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              <label className="block space-y-1.5">
                <span className={rotulo}>Observação <span className="text-muted-foreground font-normal">{campos.includes('NOTA') ? '(obrigatória)' : acoes?.back ? '(obrigatória para pedir ajuste)' : '(opcional)'}</span></span>
                <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className={`${inputCls} h-auto py-2 resize-y`} placeholder={acoes?.back ? 'O que precisa ser ajustado?' : 'Algo que a próxima pessoa precise saber?'} />
              </label>

              {aviso && (
                <p className={`t-rotulo rounded-lg px-3 py-2 ${aviso.tipo === 'ok' ? 'text-success bg-success-suave' : 'text-destructive-texto bg-destructive-suave'}`}>{aviso.texto}</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {acoes?.back && (
                  <Button type="button" variant="outline" disabled={!!busy || !nota.trim()} onClick={() => etapa('devolver')}
                    title={!nota.trim() ? 'Escreva o que precisa ser ajustado' : undefined}>
                    {busy === 'devolver' ? <Loader2 className="animate-spin" /> : <CornerUpLeft />} {acoes.back}
                  </Button>
                )}
                {acoes && (
                  <Button type="button" disabled={!!busy || falta.length > 0} onClick={() => etapa('avancar')} className="ml-auto"
                    title={falta.length ? `Falta: ${falta.join(', ')}` : undefined}>
                    {busy === 'avancar' ? <Loader2 className="animate-spin" /> : <Check />} {acoes.advance}
                  </Button>
                )}
              </div>
              {falta.length > 0 && <p className="t-rotulo text-muted-foreground text-right">Falta: {falta.join(', ')}</p>}

              {isAdmin && (
                <details className="pt-3 border-t border-border">
                  <summary className="t-rotulo text-muted-foreground cursor-pointer inline-flex items-center gap-1.5"><Shuffle className="w-3.5 h-3.5" /> Mover para outra etapa</summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select value={moverPara} onChange={(e) => setMoverPara(e.target.value)} className={`${inputCls} w-auto flex-1 min-w-[160px]`}>
                      <option value="">Escolha a etapa…</option>
                      {stages.filter((s) => s.id !== t.stageId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <Button type="button" variant="outline" disabled={!moverPara || !nota.trim() || !!busy} onClick={() => etapa('mover', { toStageId: moverPara })}
                      title={!nota.trim() ? 'Use a observação como justificativa' : undefined}>Mover</Button>
                  </div>
                  <p className="t-rotulo text-muted-foreground mt-1.5">A observação vira a justificativa no histórico.</p>
                </details>
              )}
            </div>
          )}
        </Card>

        {/* prazos por etapa */}
        {planoPrazos.length > 0 && (
          <Card>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-muted-foreground" />
                <p className="t-secao text-foreground flex-1">Prazos por etapa</p>
                {isAdmin && !concluida && <p className="t-rotulo text-muted-foreground">Vazio = segue o processo</p>}
              </div>
              <ol className="space-y-1.5">
                {planoPrazos.map((p) => {
                  const editavel = isAdmin && !concluida && p.situacao !== 'feita'
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${p.situacao === 'atual' ? 'bg-marca' : p.situacao === 'feita' ? 'bg-success' : 'bg-border'}`} />
                      <span className={`t-corpo flex-1 min-w-[140px] ${p.situacao === 'feita' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {p.name}{p.situacao === 'atual' && <span className="t-rotulo text-muted-foreground"> · etapa atual</span>}
                      </span>
                      {editavel ? (
                        <>
                          <input
                            type="date"
                            value={prazosEdit[p.id] ?? ''}
                            onChange={(e) => setPrazosEdit({ ...prazosEdit, [p.id]: e.target.value })}
                            aria-label={`Prazo de ${p.name}`}
                            className="h-8 px-2 rounded-lg border border-border bg-card t-rotulo text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                          />
                          <span className="t-rotulo text-muted-foreground w-[112px]">
                            {prazosEdit[p.id] ? 'data marcada' : p.prazo ? `automático: ${fmtData(p.prazo).slice(0, 5)}` : 'sem prazo'}
                          </span>
                        </>
                      ) : (
                        <span className="t-rotulo text-foreground">
                          {p.prazo ? fmtData(p.prazo) : '—'}{p.definido && <span className="text-muted-foreground"> · marcada</span>}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ol>
              {avisoDatas && (
                <p className={`t-rotulo rounded-lg px-3 py-2 ${avisoDatas.tipo === 'ok' ? 'text-success bg-success-suave' : 'text-destructive-texto bg-destructive-suave'}`}>{avisoDatas.texto}</p>
              )}
              {isAdmin && !concluida && (
                <div className="flex justify-end">
                  <Button type="button" size="sm" onClick={salvarPrazos} disabled={!prazosMudaram || busy === 'datas'}>
                    {busy === 'datas' ? <Loader2 className="animate-spin" /> : <Check />} Salvar prazos
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* abas */}
        <Card>
          <div className="flex gap-1 px-3 border-b border-border" role="tablist">
            {([['briefing', 'Briefing', FileText], ['comentarios', `Comentários ${t.comments.length ? `(${t.comments.length})` : ''}`, MessageSquare], ['historico', 'Histórico', History]] as const).map(([k, label, Icon]) => (
              <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
                className={`h-10 px-2.5 inline-flex items-center gap-1.5 t-rotulo border-b-2 -mb-px transition-colors ${aba === k ? 'border-marca text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-3">
            {aba === 'briefing' && (
              <>
                {t.description ? <TaskBrief description={t.description} /> : <p className="t-corpo text-muted-foreground">Sem briefing.</p>}
                {(t.driveLink || t.publicationLink) && (
                  <div className="t-rotulo space-y-1">
                    {t.driveLink && <p><span className="text-muted-foreground">Drive </span>{comLinks(t.driveLink)}</p>}
                    {t.publicationLink && <p><span className="text-muted-foreground">Publicado </span>{comLinks(t.publicationLink)}</p>}
                  </div>
                )}
                {t.attachments.length > 0 && (
                  <div className="space-y-1">
                    <p className="t-rotulo text-muted-foreground">Anexos</p>
                    {t.attachments.map((a) => (
                      <a key={a.id} href={a.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 t-rotulo text-link hover:underline"><Paperclip className="w-3 h-3" /> {a.fileName}</a>
                    ))}
                  </div>
                )}
              </>
            )}

            {aba === 'comentarios' && (
              <>
                {t.comments.length === 0 && <p className="t-corpo text-muted-foreground">Nenhum comentário ainda.</p>}
                {t.comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <Avatar nome={c.user.name} />
                    <div className="min-w-0 flex-1 rounded-[12px] bg-secondary px-3 py-2">
                      <p className="t-rotulo text-muted-foreground"><span className="text-foreground">{c.user.name}</span> · {fmtData(c.createdAt, true)}</p>
                      <p className="t-corpo text-foreground whitespace-pre-wrap break-words">{comLinks(c.content)}</p>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <input value={comentario} onChange={(e) => setComentario(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') comentar() }} placeholder="Escreva um comentário…" className={inputCls} />
                  <Button type="button" size="icon" onClick={comentar} disabled={!comentario.trim() || busy === 'comentar'} aria-label="Enviar comentário">
                    <Send />
                  </Button>
                </div>
              </>
            )}

            {aba === 'historico' && (
              <ol className="space-y-3">
                {[...t.events].reverse().map((e) => (
                  <li key={e.id}>
                    <p className="t-rotulo text-muted-foreground">{fmtData(e.createdAt, true)}{e.user ? ` · ${e.user.name}` : ''}</p>
                    <p className="t-corpo text-foreground">{e.detail}</p>
                  </li>
                ))}
                {t.events.length === 0 && <p className="t-corpo text-muted-foreground">Sem histórico.</p>}
              </ol>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
