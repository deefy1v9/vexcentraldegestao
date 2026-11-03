'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MoreVertical, Eye, Pencil } from 'lucide-react'
import DeleteClientButton from './DeleteClientButton'

/**
 * Menu de contexto da linha do cliente: Ver perfil para todos; Editar e
 * Excluir só para admin — a exclusão continua exigindo confirmação por
 * digitação do nome (modal do DeleteClientButton).
 */
export default function ClientRowActions({
  clientId,
  clientName,
  isAdmin,
}: {
  clientId: string
  clientName: string
  isAdmin: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Ações de ${clientName}`}
        aria-expanded={open}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-[12px] shadow-[0_8px_24px_rgb(16_24_40/0.12)] z-30 py-1 overflow-hidden">
          <Link
            href={`/clientes/${clientId}`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60 transition-colors"
          >
            <Eye className="w-4 h-4 text-muted-foreground" />
            Ver perfil
          </Link>
          {isAdmin && (
            <>
              <Link
                href={`/clientes/${clientId}/editar`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60 transition-colors"
              >
                <Pencil className="w-4 h-4 text-muted-foreground" />
                Editar
              </Link>
              <div className="border-t border-border my-1" />
              <DeleteClientButton clientId={clientId} clientName={clientName} variant="menu" />
            </>
          )}
        </div>
      )}
    </div>
  )
}
