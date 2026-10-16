'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RotateCcw, Send, X } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { EstrelaIa } from '@/components/vex/estrela-ia'

interface Msg { role: 'user' | 'assistant'; content: string; erro?: boolean }

const CHAVE = 'vex-chat-ia'
const SUGESTOES = [
  'Quais demandas estão atrasadas?',
  'Muda o prazo da #193 para sexta',
  'Cria uma demanda de carrossel para a Giovana',
  'Como está o caixa da empresa?',
]

/** *negrito* do WhatsApp e quebras de linha, sem HTML vindo da IA. */
function Texto({ texto }: { texto: string }) {
  return (
    <>
      {texto.split('\n').map((linha, i) => (
        <span key={i} className="block min-h-[1em]">
          {linha.split(/(\*[^*\n]+\*)/g).map((parte, j) =>
            /^\*[^*]+\*$/.test(parte) ? <strong key={j}>{parte.slice(1, -1)}</strong> : <span key={j}>{parte}</span>,
          )}
        </span>
      ))}
    </>
  )
}

/**
 * Chat com o assistente, para administradores: o mesmo agente do WhatsApp
 * (cria demanda, muda prazo, anda etapa, consulta financeiro e caixa). O botão
 * fica no canto inferior direito; a conversa sobrevive à navegação.
 */
export default function ChatIA() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  // A conversa sobrevive à navegação e ao recarregar a página
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(CHAVE) ?? '[]') } catch { return [] }
  })
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try { localStorage.setItem(CHAVE, JSON.stringify(msgs.slice(-40))) } catch {}
    fim.current?.scrollIntoView({ block: 'end' })
  }, [msgs, aberto])
  useEffect(() => { if (aberto) campo.current?.focus() }, [aberto])
  useEffect(() => {
    if (!aberto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberto])

  async function enviar(conteudo: string) {
    const t = conteudo.trim()
    if (!t || busy) return
    const historico = [...msgs.filter((m) => !m.erro), { role: 'user' as const, content: t }]
    setMsgs([...msgs, { role: 'user', content: t }])
    setTexto('')
    setBusy(true)
    try {
      const r = await fetch('/api/ia/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historico.map(({ role, content }) => ({ role, content })) }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) setMsgs((m) => [...m, { role: 'assistant', content: b.error || 'Não consegui responder agora.', erro: true }])
      else {
        setMsgs((m) => [...m, { role: 'assistant', content: b.reply }])
        // O assistente pode ter mudado demandas, caixa etc.: a tela atual recarrega
        router.refresh()
      }
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'Sem conexão com a Central.', erro: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {!aberto && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="fixed z-40 bottom-5 right-5 h-11 pl-3 pr-4 rounded-full border border-border bg-card text-foreground shadow-[0_4px_16px_rgb(16_24_40/0.10)] inline-flex items-center gap-2 t-corpo font-semibold hover:bg-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Abrir o assistente"
        >
          <EstrelaIa className="w-5 h-5" /> <span className="hidden sm:inline">Assistente</span>
        </button>
      )}

      {aberto && (
        <section
          role="dialog"
          aria-label="Assistente da VEX"
          className="fixed z-50 bottom-4 right-4 left-4 sm:left-auto sm:w-[400px] h-[min(620px,calc(100dvh-2rem))] rounded-[12px] border border-border bg-card shadow-[0_12px_40px_rgb(16_24_40/0.16)] flex flex-col overflow-hidden"
        >
          <header className="h-14 px-4 flex items-center gap-2.5 border-b border-border shrink-0">
            <span className="w-8 h-8 rounded-lg bg-secondary inline-flex items-center justify-center"><EstrelaIa /></span>
            <div className="min-w-0 flex-1">
              <p className="t-secao text-foreground">Assistente VEX</p>
              <p className="t-rotulo text-muted-foreground">Demandas, prazos, financeiro e caixa</p>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setMsgs([])} title="Nova conversa" aria-label="Nova conversa"><RotateCcw /></Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setAberto(false)} aria-label="Fechar"><X /></Button>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-background">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="t-corpo text-foreground">Oi! Peça o que precisa na operação. Criar demanda e mandar mensagem eu só faço depois que você confirmar.</p>
                <div className="flex flex-col gap-1.5">
                  {SUGESTOES.map((s) => (
                    <button key={s} type="button" onClick={() => enviar(s)} className="text-left t-rotulo text-foreground bg-card border border-border rounded-lg px-3 py-2 hover:bg-accent transition-colors">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-[12px] px-3.5 py-2 t-corpo break-words ${
                  m.role === 'user' ? 'bg-card border border-border text-foreground' : m.erro ? 'bg-destructive-suave text-destructive-texto' : 'bg-[var(--balao-assistente-fundo)] text-foreground resposta-ia'
                }`}>
                  <Texto texto={m.content} />
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-[12px] bg-[var(--balao-assistente-fundo)] px-3.5 py-2 t-corpo text-muted-foreground inline-flex items-center gap-2 resposta-ia">
                  <Loader2 className="w-4 h-4 animate-spin" /> Pensando…
                </div>
              </div>
            )}
            <div ref={fim} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); enviar(texto) }}
            className="p-3 border-t border-border flex items-end gap-2 shrink-0 bg-card"
          >
            <textarea
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto) } }}
              rows={1}
              placeholder="Escreva um pedido…"
              className="flex-1 max-h-32 min-h-[40px] resize-none rounded-lg border border-border bg-card px-3 py-2.5 t-corpo text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <Button type="submit" size="icon" disabled={!texto.trim() || busy} className="h-10 w-10" aria-label="Enviar">
              <Send />
            </Button>
          </form>
        </section>
      )}
    </div>
  )
}
