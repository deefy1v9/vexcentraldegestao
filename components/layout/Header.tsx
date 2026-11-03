'use client'
import { useSession } from 'next-auth/react'
import { getInitials } from '@/lib/utils'
import { X, AlertCircle, CheckCircle2, Menu, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { itemAtivo } from '@/components/shell/nav-config'
import { useCasca } from '@/components/shell/ShellContext'
import { IconBell, IconSun, IconMoon } from '@/components/icons/duotone'
import { useState, useEffect, useRef } from 'react'

interface Notification {
  id: string
  type: 'overdue_payment' | 'task_completed' | 'briefing_answered'
  title: string
  description: string
  createdAt: string
}

interface HeaderProps {
  title: string
  subtitle?: string
  /** Botões à direita do título (período, ação principal), como no Vireo. */
  acoes?: React.ReactNode
}

export default function Header({ title, subtitle, acoes }: HeaderProps) {
  const { data: session } = useSession()
  const name = session?.user?.name ?? ''
  const email = session?.user?.email ?? ''
  const casca = useCasca()
  const pathname = usePathname()
  const secao = itemAtivo(pathname)?.secao.label ?? null

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Tema claro/escuro: classe no <html>, preferência no localStorage;
  // sem escolha salva, respeita prefers-color-scheme (script no layout)
  const [dark, setDark] = useState(false)
  useEffect(() => {
    // Sincroniza uma vez com o que o script do layout já aplicou no <html>.
    // Ler no useState quebraria a hidratação (o servidor não vê a classe).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains('dark'))
  }, [])
  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('vex-theme', next ? 'dark' : 'light') } catch { /* sem storage */ }
  }

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

  // Persiste a leitura no servidor: a notificação não volta ao navegar nem
  // ao entrar de novo. O estado local só adianta a resposta visual.
  function markRead(ids: string[]) {
    setDismissed((prev) => new Set([...prev, ...ids]))
    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {})
  }

  const botaoTopo = 'w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors'

  return (
    <div className="shrink-0">
      {/* Faixa de cima: ir para, tema, sino e a pessoa (modelo Vireo) */}
      <header className="h-[60px] bg-card/80 backdrop-blur-md border-b border-border px-4 sm:px-8 flex items-center gap-3">
        {/* ☰ como no Vireo: no computador abre e recolhe o menu; no celular, a gaveta */}
        <button
          onClick={() => (window.matchMedia('(min-width: 768px)').matches ? casca.alternarMenu() : casca.abrirGaveta())}
          aria-label="Abrir ou recolher o menu"
          title="Abrir ou recolher o menu"
          className={`-ml-1.5 ${botaoTopo}`}
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <button
            onClick={toggleTheme}
            title={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            aria-label={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            className={botaoTopo}
          >
            {dark ? <IconSun className="w-5 h-5" /> : <IconMoon className="w-5 h-5" />}
          </button>

          {/* Notification bell */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setOpen((p) => !p)}
              aria-label="Notificações"
              className={`${botaoTopo} relative`}
            >
              <IconBell className="w-5 h-5" />
              {count > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-primary rounded-full flex items-center justify-center px-1">
                  <span className="text-primary-foreground text-[9px] font-bold leading-none">{count > 9 ? '9+' : count}</span>
                </span>
              )}
              {count === 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-marca rounded-full" />
              )}
            </button>
  
            {open && (
              <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-[360px] bg-card rounded-2xl shadow-xl border border-border z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <p className="font-bold text-foreground text-sm">Notificações</p>
                  {count > 0 && (
                    <button
                      onClick={() => markRead(visible.map((n) => n.id))}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Marcar todas como lidas
                    </button>
                  )}
                </div>
  
                <div className="max-h-[400px] overflow-y-auto">
                  {visible.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <IconBell className="w-8 h-8 text-subtle mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
                    </div>
                  ) : (
                    visible.map((n) => (
                      <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-secondary transition-colors group border-b border-border/60 last:border-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          n.type === 'overdue_payment' ? 'bg-destructive-suave' : 'bg-success-suave'
                        }`}>
                          {n.type === 'overdue_payment'
                            ? <AlertCircle className="w-4 h-4 text-destructive-texto" />
                            : <CheckCircle2 className="w-4 h-4 text-success" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-snug">{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{n.description}</p>
                        </div>
                        <button
                          onClick={() => markRead([n.id])}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-secondary rounded-lg transition-all"
                        >
                          <X className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
  
  
          <span aria-hidden className="hidden sm:block w-px h-6 bg-border mx-1.5" />
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-marca rounded-full flex items-center justify-center shadow-sm">
              <span className="text-white text-xs font-bold">{getInitials(name)}</span>
            </div>
            <div className="hidden md:block">
              <p className="text-[13px] font-semibold text-foreground leading-tight">{name}</p>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">{email}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Cabeçalho da página: trilha, título grande e a frase (modelo Vireo) */}
      <div className="px-4 sm:px-8 pt-5 pb-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
        <nav aria-label="Onde você está" className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">Início</Link>
          {secao && <><ChevronRight className="w-3.5 h-3.5 text-subtle" /><span>{secao}</span></>}
          <ChevronRight className="w-3.5 h-3.5 text-subtle" />
          <span className="text-foreground font-medium truncate">{title}</span>
        </nav>
        <h1 className="mt-1.5 font-display text-[26px] sm:text-[30px] leading-tight font-semibold tracking-[-0.02em] text-foreground truncate">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] sm:text-[15px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>

    </div>
  )
}

