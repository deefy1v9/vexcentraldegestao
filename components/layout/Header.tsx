'use client'
import { useSession } from 'next-auth/react'
import { getInitials } from '@/lib/utils'
import { Menu, ChevronRight } from 'lucide-react'
import { Notificacoes } from './Notificacoes'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { itemAtivo } from '@/components/shell/nav-config'
import { useCasca } from '@/components/shell/ShellContext'
import { IconSun, IconMoon } from '@/components/icons/duotone'
import { useState, useEffect } from 'react'


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

  // Tema claro/escuro: classe no <html>, preferência no localStorage;
  // sem escolha salva, respeita prefers-color-scheme (script no layout)
  const [dark, setDark] = useState(false)
  useEffect(() => {
    // Sincroniza uma vez com o que o script do layout já aplicou no <html>.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains('dark'))
  }, [])
  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('vex-theme', next ? 'dark' : 'light') } catch { /* sem storage */ }
  }

  if (casca.v2) {
    return (
      <div className="shrink-0 px-4 sm:px-8 pt-6 pb-4 flex flex-wrap items-end gap-x-6 gap-y-3 v2-entrar-cima">
        <div className="min-w-0 flex-1">
          <nav aria-label="Onde você está" className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <Link href="/v2" className="hover:text-foreground">Início</Link>
            {secao && <><ChevronRight className="w-3.5 h-3.5 text-subtle" /><span>{secao}</span></>}
          </nav>
          <h1 className="mt-1 font-display text-[30px] sm:text-[34px] leading-tight font-semibold tracking-[-0.03em] text-foreground truncate">{title}</h1>
          {subtitle && <p className="mt-1 text-[14px] sm:text-[15px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    )
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

          <Notificacoes className="rounded-xl" />

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

