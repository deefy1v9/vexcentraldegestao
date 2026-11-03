'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { IconBell } from '@/components/icons/duotone'
import { cn } from '@/lib/utils'

interface Notificacao {
  id: string
  type: 'overdue_payment' | 'task_completed' | 'briefing_answered'
  title: string
  description: string
  createdAt: string
}

/**
 * O sino com as notificações (atrasos, entregas e briefings respondidos). A
 * leitura fica gravada no servidor: a notificação não volta ao navegar.
 */
export function Notificacoes({ className }: { className?: string }) {
  const [lista, setLista] = useState<Notificacao[]>([])
  const [aberto, setAberto] = useState(false)
  const [lidas, setLidas] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/notifications')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setLista(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function fora(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    if (aberto) document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const visiveis = lista.filter((n) => !lidas.has(n.id))
  const n = visiveis.length

  function marcar(ids: string[]) {
    setLidas((prev) => new Set([...prev, ...ids]))
    fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => {})
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAberto((p) => !p)} aria-label="Notificações" className={cn('relative grid place-items-center w-10 h-10 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors', className)}>
        <IconBell className="w-5 h-5" />
        {n > 0 ? (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-primary rounded-full grid place-items-center px-1 text-primary-foreground text-[9px] font-bold leading-none">{n > 9 ? '9+' : n}</span>
        ) : (
          <span className="absolute top-2 right-2 w-2 h-2 bg-marca rounded-full" />
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-[360px] bg-card rounded-2xl shadow-xl border border-border z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="font-bold text-foreground text-sm">Notificações</p>
            {n > 0 && <button onClick={() => marcar(visiveis.map((x) => x.id))} className="text-xs text-muted-foreground hover:text-foreground">Marcar todas como lidas</button>}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {visiveis.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <IconBell className="w-8 h-8 text-subtle mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
              </div>
            ) : visiveis.map((x) => (
              <div key={x.id} className="flex items-start gap-3 px-4 py-3 hover:bg-secondary transition-colors group border-b border-border/60 last:border-0">
                <div className={cn('w-8 h-8 rounded-xl grid place-items-center shrink-0 mt-0.5', x.type === 'overdue_payment' ? 'bg-destructive-suave' : 'bg-success-suave')}>
                  {x.type === 'overdue_payment' ? <AlertCircle className="w-4 h-4 text-destructive-texto" /> : <CheckCircle2 className="w-4 h-4 text-success" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-snug">{x.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{x.description}</p>
                </div>
                <button onClick={() => marcar([x.id])} aria-label="Marcar como lida" className="opacity-0 group-hover:opacity-100 p-1 hover:bg-secondary rounded-lg transition-all">
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
