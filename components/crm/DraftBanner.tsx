'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Send, X, Loader2, Pencil } from 'lucide-react'

interface Draft {
  id: string
  content: string
}

/**
 * Resposta sugerida pela IA para a última mensagem do cliente.
 *
 * A IA nunca responde o cliente sozinha: o rascunho fica aqui até alguém
 * aprovar. Dá para editar o texto antes de enviar — o que sai é sempre o que
 * está na tela.
 */
export default function DraftBanner({
  conversationId,
  onSent,
}: {
  conversationId: string
  onSent: () => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const fetchDraft = useCallback(async (): Promise<Draft | null> => {
    const res = await fetch(`/api/crm/drafts?conversationId=${conversationId}`)
    if (!res.ok) return null
    const list = await res.json()
    return Array.isArray(list) && list.length > 0 ? list[0] : null
  }, [conversationId])

  useEffect(() => {
    let cancelled = false

    const apply = async () => {
      const next = await fetchDraft()
      if (cancelled) return
      setDraft((current) => {
        // Só reescreve o texto quando o rascunho é outro. Sem isso, o polling
        // apagaria a edição em andamento a cada 10 segundos.
        if (next?.id !== current?.id) {
          setText(next?.content ?? '')
          setEditing(false)
        }
        return next
      })
    }

    void apply()
    // Acompanha o ritmo do polling de mensagens: o rascunho é gerado logo
    // depois que a mensagem do cliente chega pelo webhook.
    const iv = setInterval(() => void apply(), 10000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [fetchDraft])

  if (!draft) return null

  async function approve() {
    if (!draft || !text.trim()) return
    setBusy(true)
    const res = await fetch(`/api/crm/drafts/${draft.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    })
    setBusy(false)
    if (res.ok) {
      setDraft(null)
      onSent()
    } else {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Não foi possível enviar')
    }
  }

  async function discard() {
    if (!draft) return
    setBusy(true)
    await fetch(`/api/crm/drafts/${draft.id}`, { method: 'DELETE' })
    setBusy(false)
    setDraft(null)
  }

  return (
    <div className="mx-5 mb-2 border border-ia/20 bg-ia/5 rounded-2xl px-4 py-3 shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-ia shrink-0" />
        <p className="text-[11px] font-semibold text-ia">Sugestão da IA</p>
        <span className="text-[10px] text-ia/70">revise antes de enviar</span>
        <button
          onClick={() => setEditing((v) => !v)}
          className="ml-auto p-1 text-ia/60 hover:text-ia hover:bg-ia/10 rounded transition-colors"
          title="Editar"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full border border-ia/20 rounded-lg px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-ia bg-card resize-none"
        />
      ) : (
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">{text}</p>
      )}

      <div className="flex items-center gap-2 mt-2.5">
        <button
          onClick={approve}
          disabled={busy || !text.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-ia text-ia-texto text-xs font-semibold rounded-lg hover:bg-ia/90 disabled:opacity-40 transition-colors"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Enviar
        </button>
        <button
          onClick={discard}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Descartar
        </button>
      </div>
    </div>
  )
}
