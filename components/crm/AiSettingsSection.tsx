'use client'
import { useState, useEffect } from 'react'
import { Sparkles, Loader2, Check } from 'lucide-react'

/**
 * Configuração da IA. Os modelos ficam aqui de propósito: trocar custo por
 * capacidade vira um dropdown em vez de um deploy.
 */
const AGENT_MODELS = [
  { value: 'claude-sonnet-5', label: 'Sonnet 5 — equilibrado (recomendado)' },
  { value: 'claude-opus-5', label: 'Opus 5 — melhor raciocínio, ~3x o custo' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5 — mais barato, erra mais data/hora' },
]

const DRAFT_MODELS = [
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5 — barato (recomendado)' },
  { value: 'claude-sonnet-5', label: 'Sonnet 5 — rascunhos melhores, ~3x o custo' },
]

interface AiForm {
  AI_ENABLED: string
  AI_DRAFTS_ENABLED: string
  AI_COMMAND_NUMBERS: string
  AI_AGENT_MODEL: string
  AI_DRAFT_MODEL: string
  ANTHROPIC_API_KEY: string
}

const EMPTY: AiForm = {
  AI_ENABLED: 'false',
  AI_DRAFTS_ENABLED: 'false',
  AI_COMMAND_NUMBERS: '',
  AI_AGENT_MODEL: 'claude-sonnet-5',
  AI_DRAFT_MODEL: 'claude-haiku-4-5',
  ANTHROPIC_API_KEY: '',
}

export default function AiSettingsSection() {
  const [form, setForm] = useState<AiForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(async (r) => (r.ok ? ((await r.json()) as Record<string, string>) : {}))
      .then((d) =>
        setForm({
          AI_ENABLED: d.AI_ENABLED || 'false',
          AI_DRAFTS_ENABLED: d.AI_DRAFTS_ENABLED || 'false',
          AI_COMMAND_NUMBERS: d.AI_COMMAND_NUMBERS || '',
          AI_AGENT_MODEL: d.AI_AGENT_MODEL || 'claude-sonnet-5',
          AI_DRAFT_MODEL: d.AI_DRAFT_MODEL || 'claude-haiku-4-5',
          ANTHROPIC_API_KEY: d.ANTHROPIC_API_KEY || '',
        }),
      )
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const set = <K extends keyof AiForm>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const toggle = (key: 'AI_ENABLED' | 'AI_DRAFTS_ENABLED', label: string, hint: string) => (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={form[key] === 'true'}
        onChange={(e) => set(key, e.target.checked ? 'true' : 'false')}
        className="mt-0.5 accent-[#030A8C]"
      />
      <span className="min-w-0">
        <span className="block text-xs text-gray-700 font-medium">{label}</span>
        <span className="block text-[10px] text-gray-400 leading-snug">{hint}</span>
      </span>
    </label>
  )

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
        Assistente de IA
      </p>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Chave da API Anthropic</label>
        <input
          value={form.ANTHROPIC_API_KEY}
          onChange={(e) => set('ANTHROPIC_API_KEY', e.target.value)}
          placeholder="sk-ant-..."
          type="password"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          Guardada criptografada. Você paga por uso direto à Anthropic.
        </p>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Números que comandam a IA</label>
        <input
          value={form.AI_COMMAND_NUMBERS}
          onChange={(e) => set('AI_COMMAND_NUMBERS', e.target.value)}
          placeholder="5511999998888, 5511888887777"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
        />
        <p className="text-[10px] text-gray-400 mt-1 leading-snug">
          Seu número pessoal, com DDI e DDD, separados por vírgula. Mande mensagem
          para o WhatsApp da agência a partir dele e a IA responde. Qualquer outro
          número é tratado como cliente comum.
        </p>
      </div>

      <div className="space-y-2 pt-1">
        {toggle(
          'AI_ENABLED',
          'Ativar assistente',
          'Libera os comandos por WhatsApp vindos dos números acima.',
        )}
        {toggle(
          'AI_DRAFTS_ENABLED',
          'Sugerir respostas para clientes',
          'A IA escreve um rascunho quando um cliente manda mensagem. Nada é enviado sem sua aprovação.',
        )}
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Modelo do assistente</label>
        <select
          value={form.AI_AGENT_MODEL}
          onChange={(e) => set('AI_AGENT_MODEL', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
        >
          {AGENT_MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Modelo dos rascunhos</label>
        <select
          value={form.AI_DRAFT_MODEL}
          onChange={(e) => set('AI_DRAFT_MODEL', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-900 outline-none focus:border-[#030A8C] bg-white"
        >
          {DRAFT_MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2 bg-[#030A8C] text-white text-xs font-semibold rounded-lg hover:bg-[#02077a] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
      >
        {saving ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
        ) : saved ? (
          <><Check className="w-3.5 h-3.5" /> Salvo!</>
        ) : (
          'Salvar configurações da IA'
        )}
      </button>
    </div>
  )
}
