'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'

/**
 * Navegação interna da área de Clientes: alterna entre a carteira e as
 * propostas comerciais. O menu lateral não muda.
 */
export default function ProposalsNav({ showNew = true }: { showNew?: boolean }) {
  const pathname = usePathname()
  const tabs = [
    { href: '/clientes', label: 'Clientes' },
    { href: '/propostas', label: 'Propostas' },
  ]

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        {tabs.map((t) => {
          const active = t.href === '/clientes'
            ? pathname === '/clientes' || pathname.startsWith('/clientes/')
            : pathname.startsWith('/propostas')
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                active ? 'bg-white text-[#030A8C] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>

      {showNew && (
        <Link
          href="/propostas/nova"
          className="flex items-center gap-1.5 bg-[#030A8C] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#02077a] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova proposta
        </Link>
      )}
    </div>
  )
}
