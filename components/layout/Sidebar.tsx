'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
 * item ativo em bloco sólido da marca. Só aparência — rotas e regras iguais.
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

function NavItem({ href, label, icon: Icon, onNavigate }: { href: string; label: string; icon: React.ElementType; onNavigate?: () => void }) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 text-[13.5px] rounded-xl transition-all',
        active
          ? 'bg-[#030A8C] text-white font-semibold shadow-[0_8px_18px_-8px_rgba(3,10,140,0.55)]'
          : 'text-gray-500 font-medium hover:bg-gray-100/80 hover:text-gray-900'
      )}
    >
      <Icon className={cn('w-5 h-5 shrink-0 transition-colors', active ? 'text-white' : 'text-gray-400 group-hover:text-[#030A8C]')} />
      {label}
    </Link>
  )
}

export default function Sidebar() {
  const { data: session } = useSession()
  const name = session?.user?.name ?? ''
  const role = session?.user?.role ?? ''
  const isAdmin = role === 'ADMIN'
  const { open, close } = useMobileNav()

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
      <aside className="w-[248px] h-full bg-white border-r border-gray-200/70 flex flex-col overflow-hidden">

        {/* Logo — mesma altura do cabeçalho das páginas */}
        <div className="h-[72px] px-5 flex items-center border-b border-gray-100 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo estático, sem ganho em otimizar */}
          <img src="/logo.png" alt="Logo" className="h-4 w-auto object-contain" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            <p className="px-3 text-[10.5px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-2">
              Menu
            </p>
            <div className="space-y-1">
              {menuItems
                .filter((item) => isAdmin || !item.adminOnly)
                .map((item) => (
                  <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} onNavigate={close} />
                ))}
            </div>
          </div>

          <div>
            <p className="px-3 text-[10.5px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-2">
              Geral
            </p>
            <div className="space-y-1">
              {/* Financeiro e Logs são exclusivos de administradores. */}
              {isAdmin &&
                generalItems.map((item) => (
                  <NavItem key={item.href} {...item} onNavigate={close} />
                ))}
              <button
                onClick={() => { close(); signOut({ callbackUrl: '/login' }) }}
                className="group w-full flex items-center gap-3 px-3 py-2.5 text-[13.5px] font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all rounded-xl"
              >
                <IconSair className="w-5 h-5 shrink-0 text-gray-400 group-hover:text-red-500 transition-colors" />
                Sair
              </button>
            </div>
          </div>
        </nav>

        {/* Usuário */}
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
            <div className="w-9 h-9 rounded-full bg-[#030A8C] text-white flex items-center justify-center text-xs font-bold shrink-0 ring-2 ring-white shadow-sm">
              {getInitials(name)}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-900 truncate leading-tight">{name}</p>
              <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{role === 'ADMIN' ? 'Administrador' : 'Colaborador'} · Central VEX</p>
            </div>
          </div>
        </div>

      </aside>
      </div>
    </>
  )
}
