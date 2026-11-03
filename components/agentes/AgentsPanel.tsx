'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Bot, Check, Clock, Eye, Loader2, Plus, Radar, Send, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Chip, Destaque, Kpi, Painel, Sobretitulo } from '@/components/vex/vireo'
import { TOOL_GROUPS, type ToolGroupKey } from '@/lib/ai/agents'
import { WEEKDAYS } from '@/lib/ai/watch-core'

interface Agent {
  id: string
  name: string
  description: string | null
  instructions: string | null
  toolGroups: string[]
  triggers: string[]
  model: string | null
  isActive: boolean
  isDefault: boolean
  watchFrequency: string
  watchWeekday: number | null
  lastWatchAt?: string | null
}

const MODELOS = [
  { value: '', label: 'Usar o modelo da integração' },
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite — rápido e barato' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash — respostas melhores' },
  { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash — o mais novo' },
]

/** Sugestões de partida: viram o formulário preenchido, não criam nada sozinhas. */
const MODELOS_PRONTOS: Array<{ nome: string; descricao: string; grupos: ToolGroupKey[]; gatilhos: string; instrucoes: string }> = [
  {
    nome: 'Financeiro',
    descricao: 'Cuida de contas a receber, atrasos e fechamento do mês.',
    grupos: ['financeiro', 'clientes'],
    gatilhos: 'cobrança, atrasado, inadimplente, recebível, faturamento, boleto',
    instrucoes: 'Você cuida do financeiro da agência. Responda com números exatos e sempre diga a competência (mês) a que eles se referem. Ao listar quem está devendo, comece pelos atrasados e informe o total no fim. Nunca dê baixa em pagamento sem confirmação explícita de quem pediu.',
  },
  {
    nome: 'Clientes',
    descricao: 'Consulta carteira, contrato e situação de cada cliente.',
    grupos: ['clientes', 'crm'],
    gatilhos: 'cliente, contrato, carteira, perfil',
    instrucoes: 'Você cuida do relacionamento com os clientes da agência. Ao falar de um cliente, traga contrato, serviços ativos e a situação financeira do mês. Antes de mandar mensagem para alguém, mostre o texto e espere a confirmação.',
  },
  {
    nome: 'Operação',
    descricao: 'Abre e acompanha as demandas da equipe.',
    grupos: ['demandas', 'clientes'],
    gatilhos: 'demanda, tarefa, post, carrossel, reel, prazo',
    instrucoes: 'Você cuida da operação de conteúdo. Ao criar demanda, confirme para quem vai, o cliente, o prazo e o tipo. Se faltar o prazo ou o responsável, pergunte em vez de supor.',
  },
]

export default function AgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<Agent | null>(null)
  const [novo, setNovo] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => {
    return fetch('/api/agentes')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falhou'))))
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => setErro('Não consegui carregar os agentes.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const abrirNovo = (preset?: (typeof MODELOS_PRONTOS)[number]) => {
    setErro('')
    setNovo(true)
    setEditando({
      id: '', name: preset?.nome ?? '', description: preset?.descricao ?? '', instructions: preset?.instrucoes ?? '',
      toolGroups: preset?.grupos ?? [], triggers: preset ? preset.gatilhos.split(',').map((t) => t.trim()) : [],
      model: '', isActive: true, isDefault: agents.length === 0,
      watchFrequency: preset ? 'SEMANAL' : 'DESLIGADA', watchWeekday: 1, lastWatchAt: null,
    })
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando agentes...</div>
  }

  if (editando) {
    return (
      <AgentForm
        agent={editando}
        novo={novo}
        erro={erro}
        setErro={setErro}
        onClose={() => { setEditando(null); setNovo(false); setErro('') }}
        onSaved={async () => { setEditando(null); setNovo(false); await carregar() }}
      />
    )
  }

  const atendendo = agents.filter((a) => a.isActive).length
  const comVigia = agents.filter((a) => a.watchFrequency && a.watchFrequency !== 'DESLIGADA')
  const ultimaVigia = agents
    .map((a) => a.lastWatchAt)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1) ?? null
  const vigiasSemRodar = comVigia.filter((a) => !a.lastWatchAt).length

  return (
    <div className="space-y-5">
      <Destaque
        rotulo="Assistentes de IA"
        titulo="Agentes da agência"
        sub="Cada agente responde no WhatsApp da agência com um recorte do sistema: você escolhe as áreas que ele pode mexer e escreve como ele deve agir. Nada que mexe em dinheiro, mensagem ou demanda sai sem a sua confirmação na conversa."
        acoes={<Button onClick={() => abrirNovo()}><Plus /> Novo agente</Button>}
      />

      {agents.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icone={Bot} tom="ia" rotulo="Atendendo agora" valor={atendendo} nota={`de ${agents.length} agente(s)`} />
          <Kpi icone={Radar} tom="ia" rotulo="Vigias ligadas" valor={comVigia.length} nota="avisam os sócios no WhatsApp" />
          <Kpi icone={Clock} tom="marca" rotulo="Última vigia" valor={ultimaVigia ? quandoCurto(ultimaVigia) : '—'} nota={ultimaVigia ? 'a mais recente entre os agentes' : 'nenhuma rodou ainda'} />
          <Kpi
            icone={AlertTriangle}
            tom={vigiasSemRodar > 0 ? 'atencao' : 'sucesso'}
            rotulo="Vigias sem rodar"
            valor={vigiasSemRodar}
            nota={vigiasSemRodar > 0 ? 'ligadas, mas ainda sem aviso' : 'todas já mandaram aviso'}
          />
        </div>
      )}

      {agents.length === 0 && (
        <div className="space-y-3">
          <Painel className="text-center">
            <Chip icone={Bot} tom="ia" tamanho="lg" className="mx-auto" />
            <p className="t-secao text-foreground mt-3">Nenhum agente configurado</p>
            <p className="t-legenda mt-1">
              Sem agente, o assistente do WhatsApp continua respondendo com todas as áreas liberadas.
            </p>
          </Painel>
          <Sobretitulo>Comece por um pronto</Sobretitulo>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {MODELOS_PRONTOS.map((m) => (
              <button key={m.nome} onClick={() => abrirNovo(m)} className="rounded-[20px] border border-border bg-card p-5 text-left hover:border-ia/40 transition-colors">
                <p className="font-display text-[15px] font-semibold text-foreground flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-ia" />{m.nome}</p>
                <p className="t-legenda mt-1 leading-snug">{m.descricao}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.map((a) => {
          const vigia = a.watchFrequency && a.watchFrequency !== 'DESLIGADA'
          return (
            <button
              key={a.id}
              onClick={() => { setNovo(false); setEditando(a) }}
              className="group rounded-[24px] border border-border bg-card p-6 text-left hover:border-ia/40 transition-colors shadow-[0_1px_2px_rgba(16,24,40,0.04)] flex flex-col"
            >
              <div className="flex items-start gap-3">
                <Chip icone={Bot} tom="ia" tamanho="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[17px] font-semibold tracking-[-0.01em] text-foreground truncate group-hover:text-ia">{a.name}</p>
                  {a.description && <p className="t-legenda mt-0.5 line-clamp-2">{a.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {a.isDefault && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-ia/10 text-ia">Padrão</span>}
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md ${a.isActive ? 'bg-success-suave text-success' : 'bg-secondary text-muted-foreground'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${a.isActive ? 'bg-success' : 'bg-subtle'}`} />
                    {a.isActive ? 'Atendendo' : 'Parado'}
                  </span>
                </div>
              </div>

              {/* Em destaque: quando rodou e se a vigia está em dia */}
              <dl className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
                  <dt className="t-meta flex items-center gap-1"><Clock className="w-3 h-3" /> Último aviso</dt>
                  <dd className="t-corpo font-semibold text-foreground mt-0.5">
                    {a.lastWatchAt ? quandoCurto(a.lastWatchAt) : vigia ? <span className="text-warning">Ainda não rodou</span> : '—'}
                  </dd>
                </div>
                <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
                  <dt className="t-meta flex items-center gap-1"><Radar className="w-3 h-3" /> Vigia</dt>
                  <dd className="t-corpo font-semibold text-foreground mt-0.5">
                    {vigia
                      ? a.watchFrequency === 'DIARIA'
                        ? 'Todo dia'
                        : `Toda ${(WEEKDAYS.find((d) => d.value === (a.watchWeekday ?? 1))?.label ?? 'segunda').toLowerCase()}`
                      : <span className="text-muted-foreground font-normal">Desligada</span>}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-1 mt-4">
                {TOOL_GROUPS.filter((g) => a.toolGroups.includes(g.key)).map((g) => (
                  <span key={g.key} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-secondary text-foreground">{g.label}</span>
                ))}
                {a.toolGroups.length === 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-warning-suave text-warning"><AlertTriangle className="w-3 h-3" /> Sem área liberada</span>
                )}
              </div>
              {a.triggers.length > 0 && (
                <p className="t-legenda mt-3 truncate">Atende quando ouvir: {a.triggers.join(', ')}</p>
              )}
              {vigia && (
                <p className="t-legenda mt-1">Vigia e avisa os sócios</p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** "03/11, 18:00" — data e hora curtas para o cartão. */
function quandoCurto(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function AgentForm({ agent, novo, erro, setErro, onClose, onSaved }: {
  agent: Agent
  novo: boolean
  erro: string
  setErro: (v: string) => void
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [form, setForm] = useState({
    name: agent.name,
    description: agent.description ?? '',
    instructions: agent.instructions ?? '',
    toolGroups: agent.toolGroups,
    triggers: agent.triggers.join(', '),
    model: agent.model ?? '',
    isActive: agent.isActive,
    isDefault: agent.isDefault,
    watchFrequency: agent.watchFrequency ?? 'DESLIGADA',
    watchWeekday: agent.watchWeekday ?? 1,
  })
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [preview, setPreview] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)

  // Prévia usa o agente salvo: mostra exatamente o que sairia hoje.
  const previa = async (enviar: boolean) => {
    setPreviewBusy(true)
    setErro('')
    const r = await fetch(`/api/agentes/${agent.id}/vigia`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enviar }),
    })
    const d = await r.json().catch(() => ({}))
    setPreviewBusy(false)
    if (!r.ok) { setErro(d.error ?? 'Não consegui montar o aviso.'); return }
    const enviados: string[] = d.enviadoPara ?? []
    setPreview(enviar && enviados.length > 0 ? `Enviado para ${enviados.join(' e ')}.\n\n${d.texto}` : d.texto)
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const toggleGrupo = (key: string) =>
    setForm((f) => ({ ...f, toolGroups: f.toolGroups.includes(key) ? f.toolGroups.filter((g) => g !== key) : [...f.toolGroups, key] }))

  const salvar = async () => {
    setSalvando(true)
    setErro('')
    const payload = { ...form, triggers: form.triggers.split(',').map((t) => t.trim()).filter(Boolean) }
    const r = await fetch(novo ? '/api/agentes' : `/api/agentes/${agent.id}`, {
      method: novo ? 'POST' : 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSalvando(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setErro(d.error ?? 'Não consegui salvar o agente.')
      return
    }
    await onSaved()
  }

  const apagar = async () => {
    if (!confirm(`Remover o agente "${agent.name}"? Ele para de atender no WhatsApp.`)) return
    setApagando(true)
    const r = await fetch(`/api/agentes/${agent.id}`, { method: 'DELETE' })
    setApagando(false)
    if (r.ok) await onSaved()
    else setErro('Não consegui remover o agente.')
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <button onClick={onClose} className="inline-flex items-center gap-1 t-corpo text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Voltar para a lista</button>

      <div className="rounded-[24px] border border-border bg-card p-6 space-y-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Financeiro"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-marca bg-card"
            />
            <p className="text-[10px] text-muted-foreground mt-1">No WhatsApp, escrever &quot;{form.name || 'Nome'}: ...&quot; chama este agente.</p>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Do que ele cuida (uma linha)</label>
            <input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Contas a receber, atrasos e fechamento do mês"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-marca bg-card"
            />
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Áreas que ele pode mexer</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TOOL_GROUPS.map((g) => (
              <label key={g.key} className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${form.toolGroups.includes(g.key) ? 'border-marca bg-marca/5' : 'border-border hover:border-subtle'}`}>
                <input
                  type="checkbox"
                  checked={form.toolGroups.includes(g.key)}
                  onChange={() => toggleGrupo(g.key)}
                  className="mt-0.5 accent-marca"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground">{g.label}</span>
                  <span className="block text-[10px] text-muted-foreground leading-snug">{g.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Instruções</label>
          <textarea
            value={form.instructions}
            onChange={(e) => set('instructions', e.target.value)}
            rows={8}
            placeholder="Quem ele é, como responde e o que nunca deve fazer."
            className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-marca bg-card resize-y"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {form.instructions.length} caracteres. As instruções mudam o jeito de responder, nunca as permissões: a área
            liberada acima é o que vale.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Palavras que chamam este agente</label>
            <input
              value={form.triggers}
              onChange={(e) => set('triggers', e.target.value)}
              placeholder="cobrança, atrasado, inadimplente"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-marca bg-card"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Separadas por vírgula. Sem nenhuma, ele só atende pelo nome ou como padrão.</p>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Modelo</label>
            <select
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              className="w-full border border-border rounded-lg px-2 py-2 text-sm text-foreground outline-none focus:border-marca bg-card"
            >
              {MODELOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-ia/20 bg-ia/5 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-foreground">Vigia automática</p>
            <p className="text-[10px] text-muted-foreground leading-snug">
              O agente varre sozinho as áreas marcadas acima e manda um aviso para os sócios no WhatsApp. Ele nunca
              responde cliente: só avisa vocês.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1">Frequência</label>
              <select
                value={form.watchFrequency}
                onChange={(e) => set('watchFrequency', e.target.value)}
                className="w-full border border-border rounded-lg px-2 py-2 text-xs text-foreground outline-none focus:border-marca bg-card"
              >
                <option value="DESLIGADA">Desligada</option>
                <option value="DIARIA">Todo dia</option>
                <option value="SEMANAL">Uma vez por semana</option>
              </select>
            </div>
            {form.watchFrequency === 'SEMANAL' && (
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Dia do aviso</label>
                <select
                  value={String(form.watchWeekday)}
                  onChange={(e) => set('watchWeekday', Number(e.target.value))}
                  className="w-full border border-border rounded-lg px-2 py-2 text-xs text-foreground outline-none focus:border-marca bg-card"
                >
                  {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            )}
          </div>
          {form.watchFrequency !== 'DESLIGADA' && (
            <p className="text-[10px] text-muted-foreground">
              O aviso sai junto com a rotina diária do sistema, no horário configurado nas integrações.
              {agent.lastWatchAt
                ? ` Último aviso: ${new Date(agent.lastWatchAt).toLocaleString('pt-BR')}.`
                : ' Ainda não rodou.'}
            </p>
          )}

          {!novo && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => previa(false)}
                  disabled={previewBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-marca-texto border border-marca/30 rounded-lg hover:bg-marca/5 disabled:opacity-40 transition-colors"
                >
                  {previewBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />} Ver o aviso de hoje
                </button>
                <button
                  onClick={() => previa(true)}
                  disabled={previewBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-muted-foreground border border-border rounded-lg hover:border-subtle disabled:opacity-40 transition-colors"
                >
                  <Send className="w-3 h-3" /> Mandar agora para os sócios
                </button>
              </div>
              {preview && (
                <pre className="text-[11px] text-foreground bg-secondary/60 border border-border rounded-lg p-3 whitespace-pre-wrap font-sans">{preview}</pre>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="accent-marca" />
            Atendendo
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} className="accent-marca" />
            Agente padrão (atende o que ninguém mais pegou)
          </label>
        </div>

        {erro && <p className="text-xs text-destructive-texto bg-destructive-suave rounded-lg px-3 py-2">{erro}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={salvar}
            disabled={salvando}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary-hover disabled:opacity-40 transition-colors"
          >
            {salvando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : <><Check className="w-3.5 h-3.5" /> Salvar agente</>}
          </button>
          {!novo && (
            <button
              onClick={apagar}
              disabled={apagando}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-destructive-texto hover:bg-destructive-suave rounded-lg disabled:opacity-40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remover
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
