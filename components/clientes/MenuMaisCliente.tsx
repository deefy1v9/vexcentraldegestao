'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FilePlus2, History, MoreHorizontal, Pencil } from 'lucide-react'
import { Button } from '@/components/vex/button'

/** Ações secundárias do perfil do cliente, num menu só (⋯). */
export default function MenuMaisCliente({ clientId }: { clientId: string }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  const itens = [
    { href: `/clientes/${clientId}/editar`, label: 'Editar cliente', icon: Pencil },
    { href: `/propostas/nova?clientId=${clientId}&kind=ADITIVO`, label: 'Criar aditivo', icon: FilePlus2 },
    { href: `/clientes/${clientId}/propostas`, label: 'Histórico de propostas', icon: History },
  ]

  return (
    <div className="relative" ref={ref}>
      <Button type="button" variant="outline" size="icon" onClick={() => setAberto((v) => !v)} aria-haspopup="menu" aria-expanded={aberto} aria-label="Mais ações">
        <MoreHorizontal />
      </Button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-[12px] shadow-[0_8px_24px_rgb(16_24_40/0.12)] z-30 py-1">
          {itens.map((it) => (
            <Link key={it.href} href={it.href} role="menuitem" onClick={() => setAberto(false)} className="flex items-center gap-2 px-3 py-2 text-[13.5px] text-foreground hover:bg-accent">
              <it.icon className="w-4 h-4 text-muted-foreground" /> {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
