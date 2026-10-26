'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Copy, ExternalLink, Loader2, Lock, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Input } from '@/components/vex/input'
import { Switch } from '@/components/vex/switch'
import { Badge } from '@/components/vex/badge'
import { PAPEIS, PAPEL_LABEL, TIPOS_PERGUNTA, TIPO_LABEL, type Papel, type Pergunta, type TipoPergunta } from '@/lib/briefing-core'
import CopiarLink from './CopiarLink'

interface Inicial {
  id: string; name: string; description: string; active: boolean; perguntas: Pergunta[]; publicToken: string; respostas: number
}

const novoId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const comOpcoes = (t: TipoPergunta) => t === 'escolha' || t === 'multipla'

/**
 * Editor do briefing: nome, texto de abertura e as perguntas. Cada pergunta
 * fica fechada numa linha; clique para abrir e editar. As respostas já
 * recebidas guardam as perguntas da época, então editar é seguro.
 */
export default function EditorBriefing({ inicial }: { inicial: Inicial }) {
  const router = useRouter()
  const [nome, setNome] = useState(inicial.name)
  const [descricao, setDescricao] = useState(inicial.description)
  const [ativo, setAtivo] = useState(inicial.active)
  const [perguntas, setPerguntas] = useState<Pergunta[]>(inicial.perguntas)
  const [aberta, setAberta] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [mudou, setMudou] = useState(false)

  const atualiza = (id: string, patch: Partial<Pergunta>) => {
    setPerguntas((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    setMudou(true)
    setMsg(null)
  }
  const mover = (i: number, d: -1 | 1) => {
    setPerguntas((ps) => {
      const j = i + d
      if (j < 0 || j >= ps.length) return ps
      const n = [...ps];
      [n[i], n[j]] = [n[j], n[i]]
      return n
    })
    setMudou(true)
  }
  const inserir = (depoisDe: number, tipo: TipoPergunta = 'texto') => {
    const p: Pergunta = { id: novoId(), tipo, titulo: '', ...(comOpcoes(tipo) ? { opcoes: ['Opção 1'] } : {}) }
    setPerguntas((ps) => [...ps.slice(0, depoisDe + 1), p, ...ps.slice(depoisDe + 1)])
    setAberta(p.id)
    setMudou(true)
  }
  const duplicar = (i: number) => {
    const p = { ...perguntas[i], id: novoId(), titulo: `${perguntas[i].titulo} (cópia)` }
    setPerguntas((ps) => [...ps.slice(0, i + 1), p, ...ps.slice(i + 1)])
    setAberta(p.id)
    setMudou(true)
  }
  const remover = (id: string) => {
    setPerguntas((ps) => ps.filter((p) => p.id !== id))
    setMudou(true)
  }

  async function salvar() {
    setSalvando(true)
    setMsg(null)
    const res = await fetch(`/api/briefings/${inicial.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nome, description: descricao, active: ativo, perguntas }),
    })
    const data = await res.json().catch(() => ({}))
    setSalvando(false)
    if (!res.ok) { setMsg({ ok: false, texto: data.error ?? 'Não foi possível salvar.' }); return }
    setMsg({ ok: true, texto: 'Salvo.' })
    setMudou(false)
    router.refresh()
  }

  async function apagar() {
    const aviso = inicial.respostas > 0
      ? 'Este briefing tem respostas, então ele será só desligado (o link para de abrir). Continuar?'
      : 'Apagar este briefing de vez?'
    if (!confirm(aviso)) return
    await fetch(`/api/briefings/${inicial.id}`, { method: 'DELETE' })
    router.push('/briefings')
    router.refresh()
  }

  async function trocarLink() {
    if (!confirm('Trocar o link geral? Quem tiver o link antigo não vai conseguir mais abrir. Os links por cliente continuam.')) return
    await fetch(`/api/briefings/${inicial.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'trocar-link' }) })
    router.refresh()
  }

  const reais = perguntas.filter((p) => p.tipo !== 'secao')

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/briefings" className="h-9 px-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Briefings</Link>
        <div className="flex-1" />
        <a href={`/b/${inicial.publicToken}`} target="_blank" rel="noreferrer" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent">
          <ExternalLink className="w-3.5 h-3.5" /> Ver como o cliente vê
        </a>
        {ativo && <CopiarLink caminho={`/b/${inicial.publicToken}`} rotulo="Copiar link geral" />}
      </div>

      <div className="rounded-[12px] border border-border bg-card p-4 space-y-3">
        <label className="block text-xs text-muted-foreground">Nome do briefing
          <Input value={nome} onChange={(e) => { setNome(e.target.value); setMudou(true) }} className="mt-1" />
        </label>
        <label className="block text-xs text-muted-foreground">Texto de abertura (o cliente lê antes das perguntas)
          <textarea value={descricao} onChange={(e) => { setDescricao(e.target.value); setMudou(true) }} rows={3}
            className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-[13.5px] focus-visible:outline-none focus-visible:border-primary" />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <Switch checked={ativo} onCheckedChange={(v) => { setAtivo(v); setMudou(true) }} /> {ativo ? 'Ligado: o link abre' : 'Desligado: o link não abre'}
          </label>
          <span className="text-xs text-muted-foreground">{reais.length} perguntas · {reais.filter((p) => p.obrigatoria).length} obrigatórias · {inicial.respostas} respostas</span>
          <div className="flex-1" />
          <button type="button" onClick={trocarLink} className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">Trocar link geral</button>
          <button type="button" onClick={apagar} className="text-xs text-destructive hover:underline">{inicial.respostas > 0 ? 'Desligar' : 'Apagar'} briefing</button>
        </div>
      </div>

      <ol className="space-y-2">
        {perguntas.map((p, i) => {
          const editando = aberta === p.id
          if (!editando) {
            return (
              <li key={p.id} className={`group rounded-[12px] border border-border bg-card ${p.tipo === 'secao' ? 'bg-secondary/60' : ''}`}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button type="button" onClick={() => setAberta(p.id)} className="flex-1 min-w-0 text-left">
                    <p className={`truncate ${p.tipo === 'secao' ? 't-secao text-foreground' : 'text-sm text-foreground'}`}>
                      {p.titulo || <span className="text-muted-foreground italic">sem texto</span>}
                      {p.obrigatoria && <span className="text-destructive"> *</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-1.5">
                      {TIPO_LABEL[p.tipo]}
                      {p.opcoes && ` · ${p.opcoes.length} opções`}
                      {(p.tipo === 'senha' || p.sensivel) && <span className="inline-flex items-center gap-0.5"><Lock className="w-3 h-3" /> cifrada</span>}
                      {p.alerta && <span className="inline-flex items-center gap-0.5 text-warning"><AlertTriangle className="w-3 h-3" /> aviso</span>}
                      {p.papel && <span>· identifica: {PAPEL_LABEL[p.papel]}</span>}
                    </p>
                  </button>
                  <div className="flex items-center opacity-60 group-hover:opacity-100">
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="p-1.5 disabled:opacity-30" aria-label="Subir"><ArrowUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === perguntas.length - 1} className="p-1.5 disabled:opacity-30" aria-label="Descer"><ArrowDown className="w-4 h-4" /></button>
                  </div>
                </div>
              </li>
            )
          }
          return (
            <li key={p.id} className="rounded-[12px] border-2 border-primary/50 bg-card p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <select value={p.tipo} onChange={(e) => {
                  const tipo = e.target.value as TipoPergunta
                  atualiza(p.id, { tipo, ...(comOpcoes(tipo) && !p.opcoes?.length ? { opcoes: ['Opção 1'] } : {}), ...(tipo === 'secao' ? { obrigatoria: false } : {}) })
                }} className="h-9 rounded-lg border border-border bg-input px-2 text-[13.5px]" aria-label="Tipo da pergunta">
                  {TIPOS_PERGUNTA.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                </select>
                <div className="flex-1" />
                <button type="button" onClick={() => duplicar(i)} className="h-9 px-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /> Duplicar</button>
                <button type="button" onClick={() => remover(p.id)} className="h-9 px-2 inline-flex items-center gap-1 text-xs text-destructive"><Trash2 className="w-3.5 h-3.5" /> Apagar</button>
              </div>
              <Input value={p.titulo} onChange={(e) => atualiza(p.id, { titulo: e.target.value })} placeholder={p.tipo === 'secao' ? 'Título da seção' : 'Texto da pergunta'} autoFocus />
              <Input value={p.ajuda ?? ''} onChange={(e) => atualiza(p.id, { ajuda: e.target.value || undefined })} placeholder="Explicação ou exemplo (opcional)" />

              {comOpcoes(p.tipo) && (
                <div className="space-y-2">
                  <label className="block text-xs text-muted-foreground">Opções (uma por linha)
                    <textarea
                      value={(p.opcoes ?? []).join('\n')}
                      onChange={(e) => atualiza(p.id, { opcoes: e.target.value.split('\n') })}
                      rows={Math.min(10, Math.max(3, (p.opcoes?.length ?? 0) + 1))}
                      className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-[13.5px] focus-visible:outline-none focus-visible:border-primary"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm"><Switch checked={!!p.outro} onCheckedChange={(v) => atualiza(p.id, { outro: v || undefined })} /> Aceita &quot;Outro&quot; com texto livre</label>
                  <details className="rounded-lg bg-secondary/60 p-3" open={!!p.alerta}>
                    <summary className="text-xs text-muted-foreground cursor-pointer">Aviso para a equipe quando o cliente marcar certas opções</summary>
                    <div className="mt-2 space-y-2">
                      <Input value={p.alerta?.texto ?? ''} onChange={(e) => atualiza(p.id, { alerta: { opcoes: p.alerta?.opcoes ?? [], texto: e.target.value } })} placeholder='Ex.: Marcou Blog: site com blog tem outro valor' />
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {(p.opcoes ?? []).filter(Boolean).map((o) => (
                          <label key={o} className="inline-flex items-center gap-1.5 text-xs">
                            <input type="checkbox" checked={!!p.alerta?.opcoes.includes(o)} onChange={(e) => {
                              const atuais = p.alerta?.opcoes ?? []
                              atualiza(p.id, { alerta: { texto: p.alerta?.texto ?? '', opcoes: e.target.checked ? [...atuais, o] : atuais.filter((x) => x !== o) } })
                            }} /> {o}
                          </label>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">O cliente não vê este aviso; ele aparece só na resposta, para vocês.</p>
                    </div>
                  </details>
                </div>
              )}

              {p.tipo !== 'secao' && (
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm"><Switch checked={!!p.obrigatoria} onCheckedChange={(v) => atualiza(p.id, { obrigatoria: v || undefined })} /> Obrigatória</label>
                  {p.tipo !== 'senha' && (
                    <label className="inline-flex items-center gap-2 text-sm"><Switch checked={!!p.sensivel} onCheckedChange={(v) => atualiza(p.id, { sensivel: v || undefined })} /> Dado sensível (cifrar)</label>
                  )}
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">Identifica
                    <select value={p.papel ?? ''} onChange={(e) => atualiza(p.id, { papel: (e.target.value || undefined) as Papel | undefined })} className="h-8 rounded-lg border border-border bg-input px-2 text-xs">
                      <option value="">nada</option>
                      {PAPEIS.map((x) => <option key={x} value={x}>{PAPEL_LABEL[x]}</option>)}
                    </select>
                  </label>
                </div>
              )}
              {p.tipo !== 'secao' && <p className="text-[11px] text-muted-foreground">&quot;Identifica&quot; diz para a Central qual campo é o nome da empresa, o CNPJ ou o e-mail. Com CNPJ ou e-mail, a resposta se liga ao cliente sozinha.</p>}
              <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setAberta(null)}>Fechar</Button></div>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => inserir(perguntas.length - 1)}><Plus /> Pergunta</Button>
        <Button variant="outline" onClick={() => inserir(perguntas.length - 1, 'secao')}><Plus /> Título de seção</Button>
      </div>

      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-t border-border flex items-center gap-3">
        {msg && <p className={`text-sm ${msg.ok ? 'text-success' : 'text-destructive'}`}>{msg.texto}</p>}
        {mudou && !msg && <Badge variant="warning">Alterações não salvas</Badge>}
        <div className="flex-1" />
        <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Salvar briefing</Button>
      </div>
    </div>
  )
}
