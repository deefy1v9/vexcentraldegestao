'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'

/**
 * Navegação interna da área de Clientes: alterna entre a carteira, as
 * propostas comerciais e os contratos para assinar. O menu lateral não muda.
 */
export default function ProposalsNav({ showNew = true }: { showNew?: boolean }) {
  const pathname = usePathname()
  const tabs = [
    { href: '/clientes', label: 'Clientes' },
    { href: '/propostas', label: 'Propostas' },
    { href: '/propostas/assinaturas', label: 'Assinaturas' },
  ]
  const ativa = (href: string) => {
    if (href === '/clientes') return pathname === '/clientes' || pathname.startsWith('/clientes/')
    if (href === '/propostas/assinaturas') return pathname.startsWith('/propostas/assinaturas')
    return pathname.startsWith('/propostas') && !pathname.startsWith('/propostas/assinaturas')
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
      {/* Abas em pílula, como "Contacts · Companies · Deals" do modelo Vireo */}
      <nav aria-label="Área comercial" className="flex items-center gap-1">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={ativa(t.href) ? 'page' : undefined}
            className={`h-9 px-4 inline-flex items-center rounded-full text-[13px] font-semibold transition-colors ${
              ativa(t.href) ? 'bg-marca-suave text-marca-texto' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {showNew && (
        <Link
          href="/propostas/nova"
          className="h-9 px-3.5 inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg text-[13.5px] font-medium hover:bg-primary-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova proposta
        </Link>
      )}
    </div>
  )
}
