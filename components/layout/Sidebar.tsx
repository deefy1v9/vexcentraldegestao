'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  UserPlus,
  Calendar,
  MessageCircle,
  DollarSign,
  Activity,
  Kanban,
  LogOut,
  Building2,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { useSession } from 'next-auth/react'
import { getInitials } from '@/lib/utils'

/**
 * `adminOnly` esconde o item do colaborador — que só acompanha clientes e as
 * próprias demandas. A checagem de verdade fica no servidor (cada página
 * redireciona); aqui é só para não mostrar porta que não abre.
 */
const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Building2 },
  { href: '/colaboradores', label: 'Colaboradores', icon: UserPlus, adminOnly: true },
  { href: '/demandas', label: 'Demandas', icon: Kanban },
  { href: '/calendario', label: 'Calendário', icon: Calendar, adminOnly: true },
  { href: '/crm', label: 'CRM', icon: MessageCircle, adminOnly: true },
]

const generalItems = [
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/logs', label: 'Logs', icon: Activity },
]

function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-3 px-4 py-2.5 text-sm transition-all rounded-r-xl',
        active
          ? 'text-[#030A8C] font-semibold bg-[#030A8C]/5'
          : 'text-gray-400 font-medium hover:text-gray-700 hover:bg-gray-50'
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#F74A13] rounded-r-full" />
      )}
      <Icon className={cn('w-[18px] h-[18px] shrink-0', active ? 'text-[#030A8C]' : 'text-gray-400')} />
      {label}
    </Link>
  )
}

export default function Sidebar() {
  const { data: session } = useSession()
  const name = session?.user?.name ?? ''
  const role = (session?.user as any)?.role ?? ''
  const isAdmin = role === 'ADMIN'

  return (
    <div className="p-3 shrink-0">
      <aside className="w-[220px] h-full bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">

        {/* Logo */}
        <div className="pl-4 pt-5 pb-4">
          <img src="/logo.png" alt="Logo" className="h-4 w-auto object-contain" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto space-y-5 pb-3">
          <div>
            <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
              Menu
            </p>
            <div className="space-y-0.5">
              {menuItems
                .filter((item) => isAdmin || !item.adminOnly)
                .map(({ adminOnly: _adminOnly, ...item }) => (
                  <NavItem key={item.href} {...item} />
                ))}
            </div>
          </div>

          <div>
            <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
              Geral
            </p>
            <div className="space-y-0.5">
              {/* Financeiro e Logs são exclusivos de administradores. */}
              {isAdmin &&
                generalItems.map((item) => (
                  <NavItem key={item.href} {...item} />
                ))}
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full relative flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all rounded-r-xl"
              >
                <LogOut className="w-[18px] h-[18px] shrink-0 text-gray-400" />
                Sair
              </button>
            </div>
          </div>
        </nav>

        {/* Bottom card */}
        <div className="p-3">
          <div className="bg-gray-900 rounded-xl p-4 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-[#F74A13]/20 rounded-full" />
            <div className="absolute -right-2 bottom-0 w-14 h-14 bg-[#030A8C]/20 rounded-full" />

            <div className="relative">
              <div className="w-7 h-7 bg-[#F74A13] rounded-lg flex items-center justify-center mb-3">
                <span className="text-white font-bold text-xs">V</span>
              </div>
              <p className="text-white text-sm font-bold leading-tight mb-0.5">
                Central de <br />Gestão
              </p>
              <p className="text-gray-400 text-[11px] mb-3">
                Vex Agency v1.0
              </p>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2 py-1.5">
                <div className="w-5 h-5 bg-[#030A8C] rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white text-[9px] font-bold">{getInitials(name)}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-white text-[10px] font-semibold truncate leading-none">{name}</p>
                  <p className="text-gray-400 text-[9px] leading-none mt-0.5">{role}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </aside>
    </div>
  )
}
