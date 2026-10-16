'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCheck, ClipboardList, Code2, Flag, Loader2, Palette, PenLine, Plus, Rocket,
  Trash2, UserCheck, Users, X, Zap,
} from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Switch } from '@/components/vex/switch'
import {
  FIELD_LABEL, ROLE_LABEL, STATUS_LABEL, type StageField, type StageKind, type StageRole, type StatusEspelho,
} from '@/lib/processos'

/* ─────────────────────────── tipos ─────────────────────────── */

export interface EtapaRascunho {
  id?: string
  key: string
  name: string
  kind: StageKind
  status: StatusEspelho
  role: StageRole | ''
  defaultUserId: string
  teamId: string
  dueMode: 'DIAS_APOS_ENTRADA' | 'ANTES_DA_ENTREGA'
  dueDays: number
  fields: StageField[]
  instructions: string
  checklist: string
  checklistRequired: boolean
}

export interface ProcessoParaEditar {
  id: string | null
  name: string
  color: string
  description: string
  active: boolean
  taskCount: number
  stages: EtapaRascunho[]
}

type Pessoa = { id: string; name: string }
type Equipe = { id: string; name: string; color: string; memberCount: number }

const FIELDS: StageField[] = ['LINK_DRIVE', 'LINK', 'LINK_PUBLICACAO', 'DATA_PUBLICACAO', 'NOTA']
const STATUSES: StatusEspelho[] = ['TODO', 'EM_ANDAMENTO', 'EM_REVISAO', 'APROVADO', 'CONCLUIDO']
const STATUS_PADRAO: Record<StageKind, StatusEspelho> = { EXECUCAO: 'EM_ANDAMENTO', APROVACAO: 'EM_REVISAO', FINAL: 'CONCLUIDO' }

let seq = 0
export const novaChave = () => `n${Date.now().toString(36)}${seq++}`

function etapa(kind: StageKind, patch: Partial<EtapaRascunho> = {}): EtapaRascunho {
  return {
    key: novaChave(), name: '', kind, status: STATUS_PADRAO[kind],
    role: kind === 'APROVACAO' ? 'REVISOR' : '', defaultUserId: '', teamId: '',
    dueMode: 'DIAS_APOS_ENTRADA', dueDays: kind === 'FINAL' ? 0 : 2,
    fields: [], instructions: '', checklist: '', checklistRequired: false, ...patch,
  }
}

/* Os blocos que o "+" oferece, como o "O que acontece agora?" das automações */
const MODELOS: Array<{ grupo: string; itens: Array<{ titulo: string; texto: string; icone: React.ElementType; cria: () => EtapaRascunho }> }> = [
  {
    grupo: 'Alguém faz',
    itens: [
      { titulo: 'Briefing', texto: 'Reunir com o cliente o que é preciso: textos, fotos, acessos, referências.', icone: ClipboardList, cria: () => etapa('EXECUCAO', { name: 'Briefing', dueDays: 2, checklist: 'Objetivo e público\nReferências\nMateriais do cliente', instructions: 'Reúna com o cliente tudo o que a próxima equipe precisa.' }) },
      { titulo: 'Criação', texto: 'Design, arte, texto ou vídeo. Entrega o link do Drive.', icone: Palette, cria: () => etapa('EXECUCAO', { name: 'Criação', dueDays: 3, fields: ['LINK_DRIVE'] }) },
      { titulo: 'Desenvolvimento', texto: 'Programar site, LP ou sistema. Entrega o link da prévia.', icone: Code2, cria: () => etapa('EXECUCAO', { name: 'Desenvolvimento', dueDays: 7, fields: ['LINK'] }) },
      { titulo: 'Publicação', texto: 'Colocar no ar ou agendar. Entrega o link publicado.', icone: Rocket, cria: () => etapa('EXECUCAO', { name: 'Publicação', dueDays: 1, fields: ['LINK_PUBLICACAO'] }) },
      { titulo: 'Etapa em branco', texto: 'Você dá o nome e define o que precisa para concluir.', icone: PenLine, cria: () => etapa('EXECUCAO', { name: 'Nova etapa' }) },
    ],
  },
  {
    grupo: 'Alguém aprova',
    itens: [
      { titulo: 'Revisão interna', texto: 'Alguém da VEX confere e aprova ou devolve com o ajuste.', icone: CheckCheck, cria: () => etapa('APROVACAO', { name: 'Revisão interna', dueDays: 1 }) },
      { titulo: 'Aprovação do cliente', texto: 'O cliente vê e aprova. Quem atende registra o aceite.', icone: UserCheck, cria: () => etapa('APROVACAO', { name: 'Aprovação do cliente', dueDays: 3, instructions: 'Envie ao cliente e registre o aceite ou o pedido de ajuste.' }) },
    ],
  },
]

const ICONE_DO_TIPO: Record<StageKind, { icone: React.ElementType; cls: string; rotulo: string }> = {
  EXECUCAO: { icone: PenLine, cls: 'bg-secondary text-foreground', rotulo: 'Alguém faz' },
  APROVACAO: { icone: CheckCheck, cls: 'bg-warning-suave text-warning', rotulo: 'Alguém aprova' },
  FINAL: { icone: Flag, cls: 'bg-success-suave text-success', rotulo: 'Fim' },
}

/* ─────────────────────────── regras de conferência ─────────────────────────── */

function quemAssume(e: EtapaRascunho, pessoas: Pessoa[], equipes: Equipe[]) {
  if (e.role) return ROLE_LABEL[e.role]
  if (e.defaultUserId) return pessoas.find((p) => p.id === e.defaultUserId)?.name ?? 'Pessoa removida'
  if (e.teamId) return `Equipe ${equipes.find((t) => t.id === e.teamId)?.name ?? 'removida'}`
  return 'Quem já está com a demanda'
}

function pendencias(etapas: EtapaRascunho[], equipes: Equipe[]): Array<{ key?: string; texto: string }> {
  const p: Array<{ key?: string; texto: string }> = []
  const finais = etapas.filter((e) => e.kind === 'FINAL')
  if (etapas.filter((e) => e.kind !== 'FINAL').length === 0) p.push({ texto: 'Adicione ao menos uma etapa de trabalho.' })
  if (finais.length !== 1 || etapas[etapas.length - 1]?.kind !== 'FINAL') p.push({ texto: 'O processo precisa terminar numa etapa final.' })
  if (etapas[0]?.kind === 'APROVACAO') p.push({ key: etapas[0].key, texto: 'A primeira etapa não pode ser de aprovação: não há o que devolver.' })
  const primeira = etapas[0]
  if (primeira && primeira.kind !== 'FINAL' && !primeira.role && !primeira.defaultUserId && !primeira.teamId) {
    p.push({ key: primeira.key, texto: `Defina quem assume "${primeira.name || 'a primeira etapa'}".` })
  }
  for (const e of etapas) {
    if (!e.name.trim()) p.push({ key: e.key, texto: 'Há uma etapa sem nome.' })
    const eq = equipes.find((t) => t.id === e.teamId)
    if (e.teamId && eq && eq.memberCount === 0) p.push({ key: e.key, texto: `A equipe ${eq.name} está sem ninguém: "${e.name}" ficaria parada.` })
  }
  return p
}

/* ─────────────────────────── construtor ─────────────────────────── */

export default function ConstrutorProcesso({ inicial, pessoas, equipes }: { inicial: ProcessoParaEditar; pessoas: Pessoa[]; equipes: Equipe[] }) {
  const router = useRouter()
  const [id, setId] = useState(inicial.id)
  const [nome, setNome] = useState(inicial.name)
  const [cor, setCor] = useState(inicial.color)
  const [descricao, setDescricao] = useState(inicial.description)
  const [ativo, setAtivo] = useState(inicial.active)
  const [etapas, setEtapas] = useState<EtapaRascunho[]>(inicial.stages)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [inserirEm, setInserirEm] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [mudou, setMudou] = useState(false)

  const atual = etapas.find((e) => e.key === selecionada) ?? null
  const falta = useMemo(() => pendencias(etapas, equipes), [etapas, equipes])
  const prazoTotal = etapas.filter((e) => e.kind !== 'FINAL' && e.dueMode === 'DIAS_APOS_ENTRADA').reduce((a, e) => a + e.dueDays, 0)
  const equipesUsadas = [...new Set(etapas.map((e) => e.teamId).filter(Boolean))].map((t) => equipes.find((x) => x.id === t)?.name).filter(Boolean)

  const muda = (key: string, patch: Partial<EtapaRascunho>) => { setEtapas((l) => l.map((s) => (s.key === key ? { ...s, ...patch } : s))); setMudou(true) }
  const mover = (key: string, d: -1 | 1) => {
    setEtapas((l) => {
      const i = l.findIndex((x) => x.key === key); const j = i + d
      if (i < 0 || j < 0 || j >= l.length || l[j].kind === 'FINAL' || l[i].kind === 'FINAL') return l
      const c = [...l];[c[i], c[j]] = [c[j], c[i]]; return c
    })
    setMudou(true)
  }
  const remover = (key: string) => { setEtapas((l) => l.filter((x) => x.key !== key)); setSelecionada(null); setMudou(true) }
  const inserir = (nova: EtapaRascunho) => {
    setEtapas((l) => { const c = [...l]; c.splice(inserirEm ?? l.length, 0, nova); return c })
    setInserirEm(null); setSelecionada(nova.key); setMudou(true)
  }

  async function salvar() {
    setBusy(true); setAviso(null)
    const corpo = {
      name: nome, color: cor, description: descricao, active: ativo,
      stages: etapas.map((s) => ({
        id: s.id, name: s.name, kind: s.kind, status: s.status, role: s.role || null, defaultUserId: s.defaultUserId || null,
        teamId: s.teamId || null, dueMode: s.dueMode, dueDays: s.dueDays, fields: s.fields, instructions: s.instructions,
        checklist: s.checklist.split('\n').map((c) => c.trim()).filter(Boolean), checklistRequired: s.checklistRequired,
      })),
    }
    const r = id
      ? await fetch(`/api/processos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      : await fetch('/api/processos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    const b = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setAviso({ tipo: 'erro', texto: b.error || 'Não foi possível salvar.' }); return }
    setAviso({ tipo: 'ok', texto: 'Processo salvo.' }); setMudou(false)
    if (!id && b.id) { setId(b.id); router.replace(`/processos/${b.id}`) } else router.refresh()
  }

  const input = 'w-full h-9 px-3 rounded-lg border border-border bg-card t-corpo text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
  const rotulo = 't-rotulo text-foreground mb-1.5 block'

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 p-2">
      {/* barra de cima */}
      <div className="rounded-[12px] border border-border bg-card px-3 h-14 flex items-center gap-3 shrink-0">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Voltar para Processos"><Link href="/processos"><ArrowLeft /></Link></Button>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor }} />
        <input
          value={nome}
          onChange={(e) => { setNome(e.target.value); setMudou(true) }}
          placeholder="Nome do processo"
          aria-label="Nome do processo"
          className="t-secao text-foreground bg-transparent rounded-md px-2 h-9 min-w-0 flex-1 max-w-[360px] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        />
        <label className="inline-flex items-center gap-2 t-rotulo text-muted-foreground">
          <Switch checked={ativo} onCheckedChange={(v) => { setAtivo(v); setMudou(true) }} aria-label="Processo ativo" />
          {ativo ? 'Ativo' : 'Desligado'}
        </label>
        <div className="ml-auto flex items-center gap-2">
          {aviso && <span className={`t-rotulo ${aviso.tipo === 'ok' ? 'text-success' : 'text-destructive-texto'}`}>{aviso.texto}</span>}
          {mudou && !aviso && <span className="t-legenda">Alterações não salvas</span>}
          <Button type="button" onClick={salvar} disabled={busy || !nome.trim()}>
            {busy && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_340px] gap-2">
        {/* tela com os blocos */}
        <section className="min-h-0 rounded-[12px] border border-border bg-background flex flex-col overflow-hidden">
          <div
            className="flex-1 min-h-0 overflow-auto"
            style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
            onClick={(e) => { if (e.target === e.currentTarget) setSelecionada(null) }}
          >
            <div className="min-w-max flex items-center gap-0 p-10 min-h-full" onClick={(e) => { if (e.target === e.currentTarget) setSelecionada(null) }}>
              {/* entrada */}
              <div className="w-[200px] rounded-[12px] border border-border bg-card p-3.5 shrink-0">
                <div className="flex items-start gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-marca-suave text-marca-texto grid place-items-center shrink-0"><Zap className="w-4 h-4" /></span>
                  <div className="min-w-0">
                    <p className="t-legenda">Início</p>
                    <p className="t-corpo font-semibold text-foreground leading-snug">Demanda criada</p>
                    <p className="t-legenda mt-0.5">neste processo, à mão, pelo planejamento ou pelo assistente</p>
                  </div>
                </div>
              </div>

              {etapas.map((e, i) => {
                const tipo = ICONE_DO_TIPO[e.kind]
                const Icone = tipo.icone
                const sel = selecionada === e.key
                const avisos = falta.filter((f) => f.key === e.key)
                const eq = equipes.find((t) => t.id === e.teamId)
                return (
                  <Fragment key={e.key}>
                    {/* conector com o "+" para inserir antes desta etapa (não antes do início) */}
                    <div className="flex items-center shrink-0">
                      <span className="w-6 h-px bg-subtle/60" />
                      {e.kind !== 'FINAL' || i > 0 ? (
                        <button
                          type="button"
                          onClick={() => setInserirEm(i)}
                          aria-label="Adicionar etapa aqui"
                          className="w-6 h-6 rounded-full border border-dashed border-subtle bg-card text-muted-foreground grid place-items-center hover:border-marca hover:text-marca-texto transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                      <span className="w-6 h-px bg-subtle/60" />
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelecionada(sel ? null : e.key)}
                      aria-pressed={sel}
                      className={`w-[220px] text-left rounded-[12px] border bg-card p-3.5 shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                        sel ? 'border-marca ring-2 ring-marca/20' : avisos.length ? 'border-warning/50' : 'border-border hover:border-subtle'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${tipo.cls}`}><Icone className="w-4 h-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="t-legenda">{tipo.rotulo}</p>
                          <p className="t-corpo font-semibold text-foreground leading-snug truncate">{e.name || 'Sem nome'}</p>
                          {e.kind !== 'FINAL' && (
                            <>
                              <p className="t-legenda mt-1 flex items-center gap-1 truncate">
                                {eq ? <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: eq.color }} /> : <Users className="w-3 h-3 shrink-0" />}
                                {quemAssume(e, pessoas, equipes)}
                              </p>
                              <p className="t-legenda">
                                {e.dueDays} dia(s) {e.dueMode === 'ANTES_DA_ENTREGA' ? 'antes da entrega' : 'para fazer'}
                                {e.fields.length > 0 && ` · pede ${e.fields.map((f) => FIELD_LABEL[f].toLowerCase()).join(', ')}`}
                              </p>
                            </>
                          )}
                          {avisos.length > 0 && (
                            <p className="t-legenda text-warning mt-1 flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {avisos[0].texto}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  </Fragment>
                )
              })}

              {/* adicionar no fim (antes da etapa final) */}
              {!etapas.some((e) => e.kind === 'FINAL') && (
                <div className="flex items-center shrink-0">
                  <span className="w-6 h-px bg-subtle/60" />
                  <button type="button" onClick={() => setInserirEm(etapas.length)} className="h-9 px-3 rounded-lg border border-dashed border-subtle bg-card t-rotulo text-muted-foreground inline-flex items-center gap-1.5 hover:border-marca hover:text-marca-texto">
                    <Plus className="w-3.5 h-3.5" /> Adicionar etapa
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* o que falta, como nas automações */}
          {falta.length > 0 && (
            <div className="border-t border-border bg-card px-4 py-3 shrink-0">
              <p className="t-rotulo text-warning flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Falta ajustar ({falta.length})</p>
              <ul className="mt-1 space-y-0.5">
                {falta.map((f, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => f.key && setSelecionada(f.key)} className="t-legenda hover:text-foreground text-left">{f.texto}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* painel da direita: a etapa escolhida ou o processo */}
        <aside className="min-h-0 overflow-y-auto rounded-[12px] border border-border bg-card">
          {atual ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="t-secao text-foreground">{ICONE_DO_TIPO[atual.kind].rotulo}</p>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setSelecionada(null)} aria-label="Fechar"><X /></Button>
              </div>

              <label className="block"><span className={rotulo}>Nome da etapa</span>
                <input value={atual.name} onChange={(e) => muda(atual.key, { name: e.target.value })} className={input} /></label>

              {atual.kind !== 'FINAL' && (
                <>
                  <div>
                    <span className={rotulo}>Tipo</span>
                    <div className="grid grid-cols-2 gap-1 p-0.5 bg-secondary rounded-lg">
                      {(['EXECUCAO', 'APROVACAO'] as const).map((k) => (
                        <button key={k} type="button" onClick={() => muda(atual.key, { kind: k, status: STATUS_PADRAO[k] })} aria-pressed={atual.kind === k}
                          className={`h-8 rounded-md t-rotulo ${atual.kind === k ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground'}`}>
                          {k === 'EXECUCAO' ? 'Alguém faz' : 'Alguém aprova'}
                        </button>
                      ))}
                    </div>
                    <p className="t-legenda mt-1">{atual.kind === 'APROVACAO' ? 'Aprova e segue, ou devolve para a etapa anterior com o ajuste.' : 'Faz a entrega e conclui a etapa.'}</p>
                  </div>

                  <label className="block"><span className={rotulo}>Quem assume</span>
                    <select
                      value={atual.teamId ? `team:${atual.teamId}` : atual.role ? `role:${atual.role}` : atual.defaultUserId ? `user:${atual.defaultUserId}` : ''}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v.startsWith('team:')) muda(atual.key, { teamId: v.slice(5), role: '', defaultUserId: '' })
                        else if (v.startsWith('role:')) muda(atual.key, { role: v.slice(5) as StageRole, teamId: '', defaultUserId: '' })
                        else if (v.startsWith('user:')) muda(atual.key, { defaultUserId: v.slice(5), teamId: '', role: '' })
                        else muda(atual.key, { teamId: '', role: '', defaultUserId: '' })
                      }}
                      className={input}
                    >
                      <option value="">Quem já está com a demanda</option>
                      {equipes.length > 0 && (
                        <optgroup label="Equipe (entra na fila dela)">
                          {equipes.map((t) => <option key={t.id} value={`team:${t.id}`}>{t.name} · {t.memberCount} pessoa(s)</option>)}
                        </optgroup>
                      )}
                      <optgroup label="Papel na demanda">
                        {(Object.keys(ROLE_LABEL) as StageRole[]).map((r) => <option key={r} value={`role:${r}`}>{ROLE_LABEL[r]}</option>)}
                      </optgroup>
                      <optgroup label="Pessoa fixa">
                        {pessoas.map((u) => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}
                      </optgroup>
                    </select>
                    {equipes.length === 0 && <span className="t-legenda mt-1 block">Crie equipes na aba Equipes para mandar etapas para a fila delas.</span>}
                  </label>

                  <div><span className={rotulo}>Prazo</span>
                    <div className="flex gap-2">
                      <input type="number" min={0} max={90} value={atual.dueDays} onChange={(e) => muda(atual.key, { dueDays: Number(e.target.value) })} className={`${input} w-20`} />
                      <select value={atual.dueMode} onChange={(e) => muda(atual.key, { dueMode: e.target.value as EtapaRascunho['dueMode'] })} className={input}>
                        <option value="DIAS_APOS_ENTRADA">dia(s) depois de chegar</option>
                        <option value="ANTES_DA_ENTREGA">dia(s) antes da data final</option>
                      </select>
                    </div>
                  </div>

                  <div><span className={rotulo}>Para concluir, pedir</span>
                    <div className="space-y-1.5">
                      {FIELDS.map((f) => (
                        <label key={f} className="flex items-center gap-2 t-corpo text-foreground">
                          <input type="checkbox" checked={atual.fields.includes(f)} onChange={(e) => muda(atual.key, { fields: e.target.checked ? [...atual.fields, f] : atual.fields.filter((x) => x !== f) })} className="w-4 h-4 accent-[var(--marca)]" />
                          {FIELD_LABEL[f]}
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="block"><span className={rotulo}>Instruções para quem está na etapa</span>
                    <textarea value={atual.instructions} onChange={(e) => muda(atual.key, { instructions: e.target.value })} rows={3} className={`${input} h-auto py-2`} /></label>

                  <label className="block"><span className={rotulo}>Checklist (um item por linha)</span>
                    <textarea value={atual.checklist} onChange={(e) => muda(atual.key, { checklist: e.target.value })} rows={3} className={`${input} h-auto py-2`} /></label>
                  <label className="flex items-center gap-2 t-corpo text-foreground">
                    <input type="checkbox" checked={atual.checklistRequired} onChange={(e) => muda(atual.key, { checklistRequired: e.target.checked })} className="w-4 h-4 accent-[var(--marca)]" />
                    Só conclui com o checklist completo
                  </label>

                  <details>
                    <summary className="t-rotulo text-muted-foreground cursor-pointer">Avançado</summary>
                    <label className="block mt-2"><span className={rotulo}>Coluna no quadro</span>
                      <select value={atual.status} onChange={(e) => muda(atual.key, { status: e.target.value as StatusEspelho })} className={input}>
                        {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
                      </select>
                    </label>
                  </details>

                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Button type="button" variant="outline" size="sm" onClick={() => mover(atual.key, -1)} aria-label="Mover para a esquerda"><ArrowLeft /></Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => mover(atual.key, 1)} aria-label="Mover para a direita"><ArrowRight /></Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => remover(atual.key)} className="ml-auto text-destructive-texto hover:text-destructive-texto">
                      <Trash2 /> Remover etapa
                    </Button>
                  </div>
                </>
              )}
              {atual.kind === 'FINAL' && <p className="t-corpo text-muted-foreground">A demanda termina aqui e sai das filas. Só dá para mudar o nome.</p>}
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div>
                <p className="t-secao text-foreground">Sobre o processo</p>
                <p className="t-legenda mt-1">Clique numa etapa para ajustar. O &ldquo;+&rdquo; entre duas etapas insere uma nova ali.</p>
              </div>
              <label className="block"><span className={rotulo}>Descrição</span>
                <textarea value={descricao} onChange={(e) => { setDescricao(e.target.value); setMudou(true) }} rows={3} placeholder="Para que serve, em uma frase" className={`${input} h-auto py-2`} /></label>
              <label className="block"><span className={rotulo}>Cor</span>
                <input type="color" value={cor} onChange={(e) => { setCor(e.target.value); setMudou(true) }} className="w-full h-9 rounded-lg border border-border bg-card p-1" /></label>
              <dl className="space-y-2 pt-3 border-t border-border">
                {([
                  ['Etapas', String(etapas.filter((e) => e.kind !== 'FINAL').length)],
                  ['Equipes', equipesUsadas.length ? equipesUsadas.join(', ') : 'Nenhuma'],
                  ['Prazo estimado', prazoTotal ? `${prazoTotal} dia(s)` : '—'],
                  ['Demandas', String(inicial.taskCount)],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="t-rotulo text-muted-foreground">{k}</dt><dd className="t-rotulo text-foreground text-right">{v}</dd></div>
                ))}
              </dl>
            </div>
          )}
        </aside>
      </div>

      {/* "O que acontece agora?" */}
      {inserirEm !== null && (
        <div className="fixed inset-0 z-50 bg-foreground/40 grid place-items-center p-4" onClick={() => setInserirEm(null)}>
          <div role="dialog" aria-label="O que acontece agora?" onClick={(e) => e.stopPropagation()} className="w-full max-w-[720px] max-h-[85dvh] overflow-y-auto rounded-[12px] border border-border bg-card p-5 shadow-[0_12px_40px_rgb(16_24_40/0.2)]">
            <h2 className="t-secao text-foreground text-[16px]">O que acontece agora?</h2>
            <p className="t-rotulo text-muted-foreground mt-1">Uma etapa de trabalho entrega algo; uma aprovação aprova ou devolve com o ajuste.</p>
            {MODELOS.map((g) => (
              <div key={g.grupo} className="mt-4">
                <p className="t-rotulo text-muted-foreground flex items-center gap-1.5 mb-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${g.grupo === 'Alguém faz' ? 'bg-marca' : 'bg-warning'}`} /> {g.grupo}
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {g.itens.map((m) => (
                    <button key={m.titulo} type="button" onClick={() => inserir(m.cria())}
                      className="text-left rounded-[12px] border border-border bg-card p-3 flex items-start gap-3 hover:border-marca hover:bg-accent transition-colors focus-visible:outline-2 focus-visible:outline-ring">
                      <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${g.grupo === 'Alguém faz' ? 'bg-marca-suave text-marca-texto' : 'bg-warning-suave text-warning'}`}><m.icone className="w-4 h-4" /></span>
                      <span className="min-w-0">
                        <span className="block t-corpo font-semibold text-foreground">{m.titulo}</span>
                        <span className="block t-legenda mt-0.5">{m.texto}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-5 flex justify-end">
              <Button type="button" variant="outline" onClick={() => setInserirEm(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
