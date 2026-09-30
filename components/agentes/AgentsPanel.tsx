'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, Check, Loader2, Plus, Trash2, Sparkles } from 'lucide-react'
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
    return <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Carregando agentes...</div>
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500 max-w-2xl">
          Cada agente responde no WhatsApp da agência com um recorte do sistema: você escolhe as áreas que ele
          pode mexer e escreve como ele deve agir. Nada que mexe em dinheiro, mensagem ou demanda sai sem a sua
          confirmação na conversa.
        </p>
        <button
          onClick={() => abrirNovo()}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#030A8C] text-white text-xs font-semibold rounded-lg hover:bg-[#02077a] transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Novo agente
        </button>
      </div>

      {agents.length === 0 && (
        <div className="space-y-3">
          <div className="card p-6 text-center">
            <Bot className="w-8 h-8 mx-auto text-gray-300" />
            <p className="text-sm font-semibold text-gray-700 mt-2">Nenhum agente configurado</p>
            <p className="text-xs text-gray-400 mt-1">
              Sem agente, o assistente do WhatsApp continua respondendo com todas as áreas liberadas.
            </p>
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Comece por um pronto</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {MODELOS_PRONTOS.map((m) => (
              <button key={m.nome} onClick={() => abrirNovo(m)} className="card p-4 text-left hover:border-[#030A8C] transition-colors">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-purple-500" />{m.nome}</p>
                <p className="text-xs text-gray-500 mt-1 leading-snug">{m.descricao}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {agents.map((a) => (
          <button key={a.id} onClick={() => { setNovo(false); setEditando(a) }} className="card p-4 text-left hover:border-[#030A8C] transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#030A8C] shrink-0" /> {a.name}
                </p>
                {a.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {a.isDefault && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Padrão</span>}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {a.isActive ? 'Atendendo' : 'Parado'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-3">
              {TOOL_GROUPS.filter((g) => a.toolGroups.includes(g.key)).map((g) => (
                <span key={g.key} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#030A8C]/5 text-[#030A8C]">{g.label}</span>
              ))}
              {a.toolGroups.length === 0 && <span className="text-[10px] text-amber-600">Sem área liberada</span>}
            </div>
            {a.triggers.length > 0 && (
              <p className="text-[10px] text-gray-400 mt-2 truncate">Atende quando ouvir: {a.triggers.join(', ')}</p>
            )}
            {a.watchFrequency && a.watchFrequency !== 'DESLIGADA' && (
              <p className="text-[10px] text-[#030A8C] mt-1 font-medium">
                Vigia {a.watchFrequency === 'DIARIA'
                  ? 'todo dia'
                  : `toda ${(WEEKDAYS.find((d) => d.value === (a.watchWeekday ?? 1))?.label ?? 'segunda').toLowerCase()}`} e avisa os sócios
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
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
      <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700">← Voltar para a lista</button>

      <div className="card p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Financeiro"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#030A8C] bg-white"
            />
            <p className="text-[10px] text-gray-400 mt-1">No WhatsApp, escrever &quot;{form.name || 'Nome'}: ...&quot; chama este agente.</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Do que ele cuida (uma linha)</label>
            <input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Contas a receber, atrasos e fechamento do mês"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#030A8C] bg-white"
            />
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-2">Áreas que ele pode mexer</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TOOL_GROUPS.map((g) => (
              <label key={g.key} className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${form.toolGroups.includes(g.key) ? 'border-[#030A8C] bg-[#030A8C]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="checkbox"
                  checked={form.toolGroups.includes(g.key)}
                  onChange={() => toggleGrupo(g.key)}
                  className="mt-0.5 accent-[#030A8C]"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-gray-800">{g.label}</span>
                  <span className="block text-[10px] text-gray-500 leading-snug">{g.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Instruções</label>
          <textarea
            value={form.instructions}
            onChange={(e) => set('instructions', e.target.value)}
            rows={8}
            placeholder="Quem ele é, como responde e o que nunca deve fazer."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#030A8C] bg-white resize-y"
          />
          <p className="text-[10px] text-gray-400 mt-1">
            {form.instructions.length} caracteres. As instruções mudam o jeito de responder, nunca as permissões: a área
            liberada acima é o que vale.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Palavras que chamam este agente</label>
            <input
              value={form.triggers}
              onChange={(e) => set('triggers', e.target.value)}
              placeholder="cobrança, atrasado, inadimplente"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#030A8C] bg-white"
            />
            <p className="text-[10px] text-gray-400 mt-1">Separadas por vírgula. Sem nenhuma, ele só atende pelo nome ou como padrão.</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Modelo</label>
            <select
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-900 outline-none focus:border-[#030A8C] bg-white"
            >
              {MODELOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-700">Vigia automática</p>
            <p className="text-[10px] text-gray-500 leading-snug">
              O agente varre sozinho as áreas marcadas acima e manda um aviso para os sócios no WhatsApp. Ele nunca
              responde cliente: só avisa vocês.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Frequência</label>
              <select
                value={form.watchFrequency}
                onChange={(e) => set('watchFrequency', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
              >
                <option value="DESLIGADA">Desligada</option>
                <option value="DIARIA">Todo dia</option>
                <option value="SEMANAL">Uma vez por semana</option>
              </select>
            </div>
            {form.watchFrequency === 'SEMANAL' && (
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Dia do aviso</label>
                <select
                  value={String(form.watchWeekday)}
                  onChange={(e) => set('watchWeekday', Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
                >
                  {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            )}
          </div>
          {form.watchFrequency !== 'DESLIGADA' && (
            <p className="text-[10px] text-gray-400">
              O aviso sai junto com a rotina diária do sistema, no horário configurado nas integrações.
              {agent.lastWatchAt
                ? ` Último aviso: ${new Date(agent.lastWatchAt).toLocaleString('pt-BR')}.`
                : ' Ainda não rodou.'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="accent-[#030A8C]" />
            Atendendo
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} className="accent-[#030A8C]" />
            Agente padrão (atende o que ninguém mais pegou)
          </label>
        </div>

        {erro && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={salvar}
            disabled={salvando}
            className="flex items-center gap-2 px-4 py-2 bg-[#030A8C] text-white text-xs font-semibold rounded-lg hover:bg-[#02077a] disabled:opacity-40 transition-colors"
          >
            {salvando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : <><Check className="w-3.5 h-3.5" /> Salvar agente</>}
          </button>
          {!novo && (
            <button
              onClick={apagar}
              disabled={apagando}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remover
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
