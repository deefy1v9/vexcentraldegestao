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
        className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-100 rounded-xl shadow-lg z-30 py-1 overflow-hidden">
          <Link
            href={`/clientes/${clientId}`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Eye className="w-4 h-4 text-gray-400" />
            Ver perfil
          </Link>
          {isAdmin && (
            <>
              <Link
                href={`/clientes/${clientId}/editar`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Pencil className="w-4 h-4 text-gray-400" />
                Editar
              </Link>
              <div className="border-t border-gray-100 my-1" />
              <DeleteClientButton clientId={clientId} clientName={clientName} variant="menu" />
            </>
          )}
        </div>
      )}
    </div>
  )
}
