'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion, LayoutGroup } from 'motion/react'
import { Bell, CalendarDays, LayoutDashboard, Moon, Plus, Search, Sun, Users, Wallet, ListChecks, KanbanSquare, MessagesSquare } from 'lucide-react'
import { Logo } from '@/components/marca/Logo'
import { DockVertical, DockItem, DockIcone } from './DockVertical'
import { cn, getInitials } from '@/lib/utils'
import { BuscaGeral } from '@/components/shell/BuscaGeral'
import { navSections } from '@/components/shell/nav-config'

/**
 * Casca da versão 2 (prévia, 03/11): trilho flutuante à esquerda, abas em
 * pílula no topo com a pílula deslizando até a aba ativa e o fundo em
 * degradê suave. As cores continuam as da VEX: azul-marinho na seleção,
 * laranja na ação.
 */
const ABAS = [
  { href: '/v2', rotulo: 'Visão geral' },
  { href: '/v2/agenda', rotulo: 'Agenda' },
  { href: '/demandas', rotulo: 'Demandas' },
  { href: '/clientes', rotulo: 'Clientes' },
  { href: '/financeiro', rotulo: 'Financeiro' },
  { href: '/pipeline', rotulo: 'Pipeline' },
]

const TRILHO = [
  { href: '/v2', rotulo: 'Visão geral', icone: LayoutDashboard },
  { href: '/v2/agenda', rotulo: 'Agenda', icone: CalendarDays },
  { href: '/demandas', rotulo: 'Demandas', icone: ListChecks },
  { href: '/clientes', rotulo: 'Clientes', icone: Users },
  { href: '/financeiro', rotulo: 'Financeiro', icone: Wallet },
  { href: '/pipeline', rotulo: 'Pipeline', icone: KanbanSquare },
  { href: '/crm', rotulo: 'Conversas', icone: MessagesSquare },
]

const ativa = (pathname: string, href: string) => (href === '/v2' ? pathname === '/v2' : pathname === href || pathname.startsWith(href + '/'))

export function CascaV2({ pessoa, children }: { pessoa: { nome: string; email: string }; children: React.ReactNode }) {
  const pathname = usePathname()
  const [busca, setBusca] = useState(false)
  const [escuro, setEscuro] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com a classe que o layout raiz já aplicou
    setEscuro(document.documentElement.classList.contains('dark'))
    const atalho = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBusca(true) }
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])

  function alternarTema() {
    const novo = !escuro
    setEscuro(novo)
    document.documentElement.classList.toggle('dark', novo)
    try { localStorage.setItem('vex-theme', novo ? 'dark' : 'light') } catch { /* sem storage */ }
  }

  return (
    <div className="relative min-h-dvh bg-background">
      {/* ── Fundo: manchas de cor desfocadas, como no modelo ─────────── */}
      <FundoDesfocado />

      {/* ── Trilho flutuante, com o zoom de dock ─────────────────────── */}
      <div className="hidden md:block fixed left-4 top-1/2 -translate-y-1/2 z-40">
        <aside className="rounded-full bg-foreground/90 backdrop-blur-xl p-2 shadow-[0_20px_50px_-20px_rgba(16,24,40,0.6)] v2-entrar-esq">
          <DockVertical>
            <DockItem rotulo="Buscar" atalho="Ctrl K">
              {(t) => (
                <button type="button" onClick={() => setBusca(true)} aria-label="Buscar" className="w-full h-full grid place-items-center rounded-full text-background/70 hover:text-background hover:bg-background/10 transition-colors">
                  <DockIcone tamanho={t}><Search /></DockIcone>
                </button>
              )}
            </DockItem>
            <DockItem rotulo="Nova demanda">
              {(t) => (
                <Link href="/demandas" aria-label="Nova demanda" className="w-full h-full grid place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover shadow-[0_6px_16px_-6px_var(--primary)]">
                  <DockIcone tamanho={t}><Plus /></DockIcone>
                </Link>
              )}
            </DockItem>
            <span aria-hidden className="w-6 h-px bg-background/15 my-0.5" />
            {TRILHO.map((i) => {
              const on = ativa(pathname, i.href)
              const Icone = i.icone
              return (
                <DockItem key={i.href} rotulo={i.rotulo}>
                  {(t) => (
                    <Link href={i.href} aria-label={i.rotulo} aria-current={on ? 'page' : undefined}
                      className={cn('relative w-full h-full grid place-items-center rounded-full transition-colors', on ? 'text-foreground' : 'text-background/60 hover:text-background hover:bg-background/10')}>
                      {on && <motion.span layoutId="v2-trilho" className="absolute inset-0 rounded-full bg-background" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                      <DockIcone tamanho={t}><Icone /></DockIcone>
                    </Link>
                  )}
                </DockItem>
              )
            })}
            <span aria-hidden className="w-6 h-px bg-background/15 my-0.5" />
            <DockItem rotulo={escuro ? 'Tema claro' : 'Tema escuro'}>
              {(t) => (
                <button type="button" onClick={alternarTema} aria-label="Trocar tema" className="w-full h-full grid place-items-center rounded-full text-background/70 hover:text-background hover:bg-background/10 transition-colors">
                  <DockIcone tamanho={t}>{escuro ? <Sun /> : <Moon />}</DockIcone>
                </button>
              )}
            </DockItem>
          </DockVertical>
        </aside>
      </div>

      {/* ── Topo: marca, abas em pílula e a pessoa ───────────────────── */}
      <header className="sticky top-0 z-30 px-4 md:pl-24 md:pr-8 pt-4">
        <div className="flex items-center gap-4 rounded-[22px] border border-white/40 bg-card/60 backdrop-blur-2xl px-4 h-16 shadow-[0_8px_30px_-18px_rgba(16,24,40,0.35)] v2-entrar-cima">
          <Link href="/v2" className="flex items-center gap-2 shrink-0" aria-label="VEX Central">
            <Logo altura={18} palavra />
          </Link>
          <LayoutGroup id="v2-abas">
            <nav aria-label="Seções" className="hidden lg:flex items-center gap-1 ml-4">
              {ABAS.map((a) => {
                const on = ativa(pathname, a.href)
                return (
                  <Link key={a.href} href={a.href} aria-current={on ? 'page' : undefined}
                    className={cn('relative h-9 px-4 rounded-full text-[13px] font-semibold transition-colors', on ? 'text-white' : 'text-muted-foreground hover:text-foreground')}>
                    {on && <motion.span layoutId="v2-pilula" className="absolute inset-0 rounded-full bg-marca shadow-[0_6px_16px_-8px_var(--marca)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                    <span className="relative leading-9">{a.rotulo}</span>
                  </Link>
                )
              })}
            </nav>
          </LayoutGroup>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/dashboard" className="hidden sm:inline-flex h-9 items-center rounded-full border border-border px-3.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Versão atual</Link>
            <button type="button" aria-label="Notificações" className="relative grid place-items-center w-11 h-11 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-[18px] h-[18px]" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary ring-2 ring-card" />
            </button>
            <span className="w-11 h-11 rounded-full bg-marca text-white grid place-items-center text-[12px] font-bold" title={`${pessoa.nome} · ${pessoa.email}`}>{getInitials(pessoa.nome)}</span>
          </div>
        </div>
      </header>

      <main className="relative px-4 md:pl-24 md:pr-8 pb-10 pt-6">{children}</main>
      {busca && <BuscaGeral secoes={navSections} aoFechar={() => setBusca(false)} />}
    </div>
  )
}


/**
 * O fundo das imagens de referência: três manchas grandes e desfocadas
 * (azul-marinho, laranja da marca e um azul claro) que se mexem devagar
 * atrás de tudo. Fixo e sem clique; no tema escuro fica mais discreto.
 */
export function FundoDesfocado() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      <span className="v2-mancha absolute -top-40 right-[-10%] h-[520px] w-[620px] rounded-full bg-marca/25 blur-[110px] dark:bg-marca/20" />
      <span className="v2-mancha v2-mancha-2 absolute top-[35%] -left-40 h-[460px] w-[520px] rounded-full bg-primary/20 blur-[120px] dark:bg-primary/10" />
      <span className="v2-mancha v2-mancha-3 absolute -bottom-48 right-[25%] h-[480px] w-[560px] rounded-full bg-info/20 blur-[120px] dark:bg-info/10" />
    </div>
  )
}
