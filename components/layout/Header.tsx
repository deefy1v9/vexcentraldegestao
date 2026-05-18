'use client'
import { useSession } from 'next-auth/react'
import { getInitials } from '@/lib/utils'
import { Bell, Search, Mail, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

interface Notification {
  id: string
  type: 'overdue_payment' | 'task_completed'
  title: string
  description: string
  createdAt: string
}

interface HeaderProps {
  title: string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { data: session } = useSession()
  const name = session?.user?.name ?? ''
  const email = session?.user?.email ?? ''

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/notifications')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setNotifications(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const visible = notifications.filter((n) => !dismissed.has(n.id))
  const count = visible.length

  return (
    <header className="h-[72px] bg-white border-b border-gray-100 px-6 flex items-center justify-between shrink-0">
      <div>
        <h1 className="text-xl font-bold text-gray-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden lg:flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2 mr-2 text-sm text-gray-400 w-52">
          <Search className="w-4 h-4" />
          <span>Buscar...</span>
          <span className="ml-auto text-xs bg-white rounded px-1.5 py-0.5 text-gray-400 border border-gray-200">⌘F</span>
        </div>

        <button className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors">
          <Mail className="w-[18px] h-[18px] text-gray-500" />
        </button>

        {/* Notification bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen((p) => !p)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors relative"
          >
            <Bell className="w-[18px] h-[18px] text-gray-500" />
            {count > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-[#F74A13] rounded-full flex items-center justify-center px-1">
                <span className="text-white text-[9px] font-bold leading-none">{count > 9 ? '9+' : count}</span>
              </span>
            )}
            {count === 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#030A8C] rounded-full" />
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-[360px] bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="font-bold text-gray-900 text-sm">Notificações</p>
                {count > 0 && (
                  <button
                    onClick={() => setDismissed(new Set(notifications.map((n) => n.id)))}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    Marcar todas como lidas
                  </button>
                )}
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {visible.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Nenhuma notificação</p>
                  </div>
                ) : (
                  visible.map((n) => (
                    <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group border-b border-gray-50 last:border-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        n.type === 'overdue_payment' ? 'bg-red-50' : 'bg-green-50'
                      }`}>
                        {n.type === 'overdue_payment'
                          ? <AlertCircle className="w-4 h-4 text-red-500" />
                          : <CheckCircle2 className="w-4 h-4 text-green-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 leading-snug">{n.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{n.description}</p>
                      </div>
                      <button
                        onClick={() => setDismissed((prev) => new Set([...prev, n.id]))}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded-lg transition-all"
                      >
                        <X className="w-3 h-3 text-gray-500" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User */}
        <div className="flex items-center gap-2.5 ml-2 pl-3 border-l border-gray-100">
          <div className="w-9 h-9 bg-[#030A8C] rounded-full flex items-center justify-center shadow-sm">
            <span className="text-white text-xs font-bold">{getInitials(name)}</span>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-gray-900 leading-tight">{name}</p>
            <p className="text-[11px] text-gray-400 leading-none">{email}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
