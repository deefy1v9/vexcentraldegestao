'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from 'next-auth/react'
import { useSession } from 'next-auth/react'
import { getInitials } from '@/lib/utils'
import { useMobileNav } from './MobileNav'
import {
  IconDashboard, IconClientes, IconServicos, IconColaboradores, IconDemandas, IconCalendario,
  IconPipeline, IconCrm, IconSeo, IconFinanceiro, IconLogs, IconSair,
} from '@/components/icons/duotone'

/**
 * `adminOnly` esconde o item do colaborador — que só acompanha clientes e as
 * próprias demandas. A checagem de verdade fica no servidor (cada página
 * redireciona); aqui é só para não mostrar porta que não abre.
 *
 * Visual no padrão do modelo novo: painel lateral fixo, ícones duotone,
 * item ativo em bloco sólido da marca. No desktop o menu recolhe para só
 * ícones (nome aparece ao passar o mouse). Só aparência — rotas iguais.
 */
const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: IconDashboard },
  { href: '/clientes', label: 'Clientes', icon: IconClientes },
  { href: '/servicos', label: 'Serviços', icon: IconServicos, adminOnly: true },
  { href: '/colaboradores', label: 'Colaboradores', icon: IconColaboradores, adminOnly: true },
  { href: '/demandas', label: 'Demandas', icon: IconDemandas },
  { href: '/calendario', label: 'Calendário', icon: IconCalendario },
  { href: '/pipeline', label: 'Pipeline', icon: IconPipeline, adminOnly: true },
  { href: '/crm', label: 'CRM', icon: IconCrm, adminOnly: true },
  { href: '/seo', label: 'SEO', icon: IconSeo, adminOnly: true },
]

const generalItems = [
  { href: '/financeiro', label: 'Financeiro', icon: IconFinanceiro },
  { href: '/logs', label: 'Logs', icon: IconLogs },
]

interface Dica { label: string; top: number }

function NavItem({
  href, label, icon: Icon, collapsed, onNavigate, onHover,
}: {
  href: string; label: string; icon: React.ElementType; collapsed: boolean
  onNavigate?: () => void; onHover: (d: Dica | null) => void
}) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      onMouseEnter={(e) => { if (collapsed) { const r = e.currentTarget.getBoundingClientRect(); onHover({ label, top: r.top + r.height / 2 }) } }}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'group flex items-center gap-3 py-2.5 text-[13.5px] rounded-xl transition-all',
        collapsed ? 'justify-center px-0 w-11 mx-auto' : 'px-3',
        active
          ? 'bg-[#030A8C] text-white font-semibold shadow-[0_8px_18px_-8px_rgba(3,10,140,0.55)]'
          : 'text-[var(--text-secondary)] font-medium hover:bg-[var(--hover)] hover:text-[var(--text)]'
      )}
    >
      <Icon className={cn('w-5 h-5 shrink-0 transition-colors', active ? 'text-white' : 'text-[var(--text-secondary)] group-hover:text-[#030A8C]')} />
      {!collapsed && label}
    </Link>
  )
}

export default function Sidebar() {
  const { data: session } = useSession()
  const name = session?.user?.name ?? ''
  const role = session?.user?.role ?? ''
  const isAdmin = role === 'ADMIN'
  const { open, close, collapsed, toggleCollapsed } = useMobileNav()
  const [dica, setDica] = useState<Dica | null>(null)

  // No celular o drawer sempre mostra os nomes; recolhido é só no desktop
  const recolhido = collapsed && !open

  return (
    <>
      {/* Backdrop: só no mobile, quando o drawer está aberto. */}
      <div
        onClick={close}
        aria-hidden
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* No mobile é um drawer fixo que desliza da esquerda; no desktop (lg+)
          volta a ser uma coluna estática no fluxo. */}
      <div
        className={cn(
          'shrink-0 z-50 transition-transform duration-200 ease-out',
          'fixed inset-y-0 left-0 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
      <aside
        className={cn(
          'h-full bg-[var(--surface)] border-r border-[var(--border)] flex flex-col overflow-hidden transition-[width] duration-200',
          recolhido ? 'w-[76px]' : 'w-[248px]',
        )}
      >

        {/* Logo — mesma altura do cabeçalho das páginas */}
        <div className={cn('h-[72px] flex items-center border-b border-[var(--border)] shrink-0', recolhido ? 'justify-center px-2' : 'px-5 justify-between')}>
          {recolhido ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expandir menu"
              title="Expandir menu"
              className="w-10 h-10 rounded-xl bg-[#030A8C] text-white font-black text-base flex items-center justify-center hover:bg-[#02077a] transition-colors"
            >
              V
            </button>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- logo estático, sem ganho em otimizar */}
              <img src="/logo.png" alt="Logo" className="h-4 w-auto object-contain" />
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Recolher menu"
                title="Recolher menu"
                className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className={cn('flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-6', recolhido ? 'px-2' : 'px-3')}>
          <div>
            {!recolhido && (
              <p className="px-3 text-[10.5px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.14em] mb-2">Menu</p>
            )}
            <div className="space-y-1">
              {menuItems
                .filter((item) => isAdmin || !item.adminOnly)
                .map((item) => (
                  <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} collapsed={recolhido} onNavigate={close} onHover={setDica} />
                ))}
            </div>
          </div>

          <div>
            {!recolhido && (
              <p className="px-3 text-[10.5px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.14em] mb-2">Geral</p>
            )}
            {recolhido && <div className="mx-3 mb-2 border-t border-[var(--border)]" />}
            <div className="space-y-1">
              {/* Financeiro e Logs são exclusivos de administradores. */}
              {isAdmin &&
                generalItems.map((item) => (
                  <NavItem key={item.href} {...item} collapsed={recolhido} onNavigate={close} onHover={setDica} />
                ))}
              <button
                onClick={() => { close(); signOut({ callbackUrl: '/login' }) }}
                aria-label="Sair"
                onMouseEnter={(e) => { if (recolhido) { const r = e.currentTarget.getBoundingClientRect(); setDica({ label: 'Sair', top: r.top + r.height / 2 }) } }}
                onMouseLeave={() => setDica(null)}
                className={cn(
                  'group flex items-center gap-3 py-2.5 text-[13.5px] font-medium text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-600 transition-all rounded-xl',
                  recolhido ? 'justify-center w-11 mx-auto' : 'w-full px-3',
                )}
              >
                <IconSair className="w-5 h-5 shrink-0 text-[var(--text-secondary)] group-hover:text-red-500 transition-colors" />
                {!recolhido && 'Sair'}
              </button>
            </div>
          </div>
        </nav>

        {/* Usuário */}
        <div className={cn('border-t border-[var(--border)]', recolhido ? 'p-2' : 'p-3')}>
          {recolhido ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              title={`${name} · expandir menu`}
              aria-label="Expandir menu"
              className="w-11 h-11 mx-auto rounded-full bg-[#030A8C] text-white flex items-center justify-center text-xs font-bold ring-2 ring-[var(--surface)] shadow-sm hover:bg-[#02077a]"
            >
              {getInitials(name)}
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-[var(--hover)] px-3 py-2.5">
              <div className="w-9 h-9 rounded-full bg-[#030A8C] text-white flex items-center justify-center text-xs font-bold shrink-0 ring-2 ring-[var(--surface)] shadow-sm">
                {getInitials(name)}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--text)] truncate leading-tight">{name}</p>
                <p className="text-[11px] text-[var(--text-secondary)] leading-tight mt-0.5">{role === 'ADMIN' ? 'Administrador' : 'Colaborador'} · Central VEX</p>
              </div>
            </div>
          )}
        </div>

      </aside>
      </div>

      {/* Nome do item quando o menu está recolhido: fixo na viewport para não
          ser cortado pela rolagem do menu */}
      {recolhido && dica && (
        <div
          role="tooltip"
          className="hidden lg:block fixed left-[84px] z-[60] -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-[var(--text)] text-[var(--surface)] text-xs font-semibold shadow-lg pointer-events-none whitespace-nowrap"
          style={{ top: dica.top }}
        >
          {dica.label}
        </div>
      )}
    </>
  )
}
