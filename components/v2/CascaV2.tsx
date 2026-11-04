'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { signOut } from 'next-auth/react'
import { AnimatePresence, motion, LayoutGroup } from 'motion/react'
import {
  Bot, Building2, CalendarDays, CalendarRange, ChevronDown, ClipboardList, FileText, Globe, History, KanbanSquare,
  LayoutDashboard, ListChecks, LogOut, Menu, MessagesSquare, Moon, Package, Plus, Search, Sun, Users, Wallet, Workflow, X,
} from 'lucide-react'
import { Logo } from '@/components/marca/Logo'
import { cn, getInitials } from '@/lib/utils'
import { BuscaGeral } from '@/components/shell/BuscaGeral'
import { navSections } from '@/components/shell/nav-config'
import { CascaContext } from '@/components/shell/ShellContext'
import { Notificacoes } from '@/components/layout/Notificacoes'
import ChatIA from '@/components/shell/ChatIA'

/**
 * A casca da Central na versão 2 (o dono, 03/11): trilho flutuante à
 * esquerda com zoom leve só no ícone sob o mouse, abas em pílula no topo
 * (a pílula desliza até a aba ativa), fundo com manchas desfocadas e vidro.
 * Cores da VEX: azul-marinho na seleção, laranja na ação, roxo na IA.
 *
 * A casca tem altura fixa (a tela): cada página rola por dentro, como no
 * painel anterior, para as telas com colunas (Demandas, CRM) continuarem
 * funcionando.
 */
type Destino = { href: string; rotulo: string; icone: React.ElementType; adminOnly?: boolean }

const DESTINOS: Destino[] = [
  { href: '/v2', rotulo: 'Visão geral', icone: LayoutDashboard, adminOnly: true },
  { href: '/v2/agenda', rotulo: 'Agenda', icone: CalendarDays, adminOnly: true },
  { href: '/demandas', rotulo: 'Demandas', icone: ListChecks },
  { href: '/clientes', rotulo: 'Clientes', icone: Building2 },
  { href: '/financeiro', rotulo: 'Financeiro', icone: Wallet, adminOnly: true },
  { href: '/pipeline', rotulo: 'Pipeline', icone: KanbanSquare, adminOnly: true },
  { href: '/crm', rotulo: 'Conversas', icone: MessagesSquare, adminOnly: true },
  { href: '/propostas', rotulo: 'Propostas', icone: FileText, adminOnly: true },
  { href: '/briefings', rotulo: 'Briefings', icone: ClipboardList, adminOnly: true },
  { href: '/processos', rotulo: 'Processos', icone: Workflow, adminOnly: true },
  { href: '/agentes', rotulo: 'Agentes', icone: Bot, adminOnly: true },
  { href: '/seo', rotulo: 'SEO', icone: Globe, adminOnly: true },
]

/** O que não cabe nas abas do topo vai para o "Mais". */
const NO_MAIS: Destino[] = [
  { href: '/dashboard', rotulo: 'Dashboard completo', icone: LayoutDashboard },
  { href: '/calendario', rotulo: 'Calendário', icone: CalendarRange },
  { href: '/servicos', rotulo: 'Serviços', icone: Package, adminOnly: true },
  { href: '/colaboradores', rotulo: 'Equipe', icone: Users, adminOnly: true },
  { href: '/logs', rotulo: 'Logs', icone: History, adminOnly: true },
]

const ABAS_TOPO = ['/v2', '/v2/agenda', '/demandas', '/clientes', '/financeiro', '/pipeline']

const ativa = (pathname: string, href: string) => (href === '/v2' ? pathname === '/v2' : pathname === href || pathname.startsWith(href + '/'))

const rolaSozinho = (el: Element) => {
  const { overflowY } = getComputedStyle(el)
  return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1
}

/** A maior área que rola dentro do conteúdo: é onde fica o corpo da página. */
function areaDaPagina(raiz: HTMLElement) {
  let maior: Element | null = null
  let maiorArea = 0
  for (const el of raiz.querySelectorAll('main [class*="overflow-y-auto"], main [class*="overflow-auto"]')) {
    const area = el.clientWidth * el.clientHeight
    if (area > maiorArea && rolaSozinho(el)) { maior = el; maiorArea = area }
  }
  return maior
}

export function CascaV2({ pessoa, admin = true, children }: { pessoa: { nome: string; email: string }; admin?: boolean; children: React.ReactNode }) {
  const pathname = usePathname()
  const [busca, setBusca] = useState(false)
  const [gaveta, setGaveta] = useState(false)
  const [escuro, setEscuro] = useState(false)
  const raizRef = useRef<HTMLDivElement>(null)

  const destinos = DESTINOS.filter((d) => admin || !d.adminOnly)
  // O colaborador não tem a Visão geral (é financeira): o início dele é o Dashboard das demandas
  const inicio = admin ? '/v2' : '/dashboard'
  const trilho: Destino[] = admin ? destinos : [{ href: '/dashboard', rotulo: 'Início', icone: LayoutDashboard }, { href: '/calendario', rotulo: 'Calendário', icone: CalendarRange }, ...destinos]
  const abas = admin ? destinos.filter((d) => ABAS_TOPO.includes(d.href)) : trilho
  const mais = admin ? [...destinos.filter((d) => !ABAS_TOPO.includes(d.href)), ...NO_MAIS] : []
  const maisAtivo = mais.some((d) => ativa(pathname, d.href))

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com a classe que o layout raiz já aplicou
    setEscuro(document.documentElement.classList.contains('dark'))
    const atalho = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBusca(true) }
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- a gaveta do celular fecha ao trocar de página
  useEffect(() => { setGaveta(false) }, [pathname])

  // O topo, o título e o trilho ficam fora da área que rola: a roda do mouse
  // em cima deles desce a página. Modal e gaveta (fixed) continuam de fora.
  useEffect(() => {
    const raiz = raizRef.current
    if (!raiz) return
    const aoRolar = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || !(e.target instanceof Element)) return
      if (e.target.closest('.fixed') && !e.target.closest('[data-trilho]')) return
      for (let el: Element | null = e.target; el && el !== raiz; el = el.parentElement) if (rolaSozinho(el)) return
      const area = areaDaPagina(raiz)
      if (area) area.scrollTop += e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 40 : e.deltaY
    }
    raiz.addEventListener('wheel', aoRolar, { passive: true })
    return () => raiz.removeEventListener('wheel', aoRolar)
  }, [])

  function alternarTema() {
    const novo = !escuro
    setEscuro(novo)
    document.documentElement.classList.toggle('dark', novo)
    try { localStorage.setItem('vex-theme', novo ? 'dark' : 'light') } catch { /* sem storage */ }
  }

  const casca = { v2: true, alternarMenu: () => setGaveta((g) => !g), abrirGaveta: () => setGaveta(true), abrirBusca: () => setBusca(true) }

  return (
    <CascaContext.Provider value={casca}>
      <div ref={raizRef} className="relative h-dvh flex flex-col overflow-hidden bg-background">
        <FundoDesfocado />

        {/* ── Trilho flutuante ─────────────────────────────────────────── */}
        <div data-trilho className="hidden md:block fixed left-4 top-1/2 -translate-y-1/2 z-40">
          <aside className="flex flex-col items-center gap-1 rounded-full bg-foreground/90 backdrop-blur-xl p-2 shadow-[0_20px_50px_-20px_rgba(16,24,40,0.6)] v2-entrar-esq">
            <ItemDoTrilho rotulo="Buscar" atalho="Ctrl K" onClick={() => setBusca(true)}><Search /></ItemDoTrilho>
            {admin && <ItemDoTrilho rotulo="Nova demanda" href="/demandas" destaque><Plus /></ItemDoTrilho>}
            <span aria-hidden className="w-6 h-px bg-background/15 my-1" />
            {trilho.map((d) => {
              const Icone = d.icone
              return <ItemDoTrilho key={d.href} rotulo={d.rotulo} href={d.href} ativo={ativa(pathname, d.href)}><Icone /></ItemDoTrilho>
            })}
            <span aria-hidden className="w-6 h-px bg-background/15 my-1" />
            <ItemDoTrilho rotulo={escuro ? 'Tema claro' : 'Tema escuro'} onClick={alternarTema}>{escuro ? <Sun /> : <Moon />}</ItemDoTrilho>
          </aside>
        </div>

        {/* ── Topo: marca, abas em pílula e a pessoa ───────────────────── */}
        <header className="relative z-30 shrink-0 px-4 md:pl-24 md:pr-8 pt-4">
          <div className="flex items-center gap-3 rounded-[22px] border border-white/40 dark:border-border/70 bg-card/60 backdrop-blur-2xl px-4 h-16 shadow-[0_8px_30px_-18px_rgba(16,24,40,0.35)] v2-entrar-cima">
            <button type="button" onClick={() => setGaveta(true)} aria-label="Abrir menu" className="md:hidden grid place-items-center w-10 h-10 -ml-1 rounded-full hover:bg-secondary text-muted-foreground"><Menu className="w-5 h-5" /></button>
            <Link href={inicio} className="flex items-center gap-2 shrink-0" aria-label="VEX Central">
              <Logo altura={18} palavra />
            </Link>
            <LayoutGroup id="v2-abas">
              <nav aria-label="Seções" className="hidden lg:flex items-center gap-1 ml-4 min-w-0">
                {abas.map((a) => {
                  const on = ativa(pathname, a.href)
                  return (
                    <Link key={a.href} href={a.href} aria-current={on ? 'page' : undefined}
                      className={cn('relative h-9 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors', on ? 'text-white' : 'text-muted-foreground hover:text-foreground')}>
                      {on && <motion.span layoutId="v2-pilula" className="absolute inset-0 rounded-full bg-marca shadow-[0_6px_16px_-8px_var(--marca)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                      <span className="relative leading-9">{a.rotulo}</span>
                    </Link>
                  )
                })}
                {mais.length > 0 && <Mais itens={mais} ativo={maisAtivo} pathname={pathname} />}
              </nav>
            </LayoutGroup>
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={() => setBusca(true)} aria-label="Buscar" className="lg:hidden grid place-items-center w-10 h-10 rounded-full text-muted-foreground hover:bg-secondary"><Search className="w-[18px] h-[18px]" /></button>
              <Notificacoes />
              <MenuDaPessoa pessoa={pessoa} />
            </div>
          </div>
        </header>

        {/* ── Conteúdo: cada página rola por dentro ───────────────────── */}
        <main className="relative z-10 flex-1 min-h-0 md:pl-20">
          <div className="h-full">{children}</div>
        </main>

        {/* ── Gaveta do celular ───────────────────────────────────────── */}
        <AnimatePresence>
          {gaveta && (
            <motion.div className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button aria-label="Fechar o menu" onClick={() => setGaveta(false)} className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" />
              <motion.nav initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} className="absolute inset-y-3 left-3 w-[272px] rounded-[24px] bg-card border border-border p-3 overflow-y-auto shadow-2xl">
                <div className="flex items-center justify-between px-2 h-12">
                  <Logo altura={18} palavra />
                  <button onClick={() => setGaveta(false)} aria-label="Fechar" className="grid place-items-center w-9 h-9 rounded-full hover:bg-secondary"><X className="w-4 h-4" /></button>
                </div>
                {[...trilho, ...(admin ? NO_MAIS : [])].map((d) => {
                  const Icone = d.icone
                  const on = ativa(pathname, d.href)
                  return (
                    <Link key={d.href} href={d.href} className={cn('flex items-center gap-3 h-11 px-3 rounded-xl text-[14px] font-medium', on ? 'bg-marca-suave text-marca-texto font-semibold' : 'text-foreground hover:bg-secondary')}>
                      <Icone className="w-[18px] h-[18px]" />{d.rotulo}
                    </Link>
                  )
                })}
              </motion.nav>
            </motion.div>
          )}
        </AnimatePresence>

        {busca && <BuscaGeral secoes={navSections.map((s) => ({ ...s, items: s.items.filter((i) => admin || !i.adminOnly) }))} aoFechar={() => setBusca(false)} />}
        {admin && <ChatIA />}
      </div>
    </CascaContext.Provider>
  )
}

/**
 * Um destino do trilho. Ao passar o mouse, SÓ ele cresce um pouco (zoom leve,
 * sem mexer no tamanho do trilho) e o nome aparece ao lado.
 */
function ItemDoTrilho({ rotulo, atalho, href, onClick, ativo, destaque, children }: {
  rotulo: string; atalho?: string; href?: string; onClick?: () => void; ativo?: boolean; destaque?: boolean; children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const classe = cn(
    'relative grid place-items-center w-11 h-11 [@media(max-height:860px)]:w-9 [@media(max-height:860px)]:h-9 rounded-full transition-colors [&>svg]:relative [&>svg]:w-[18px] [&>svg]:h-[18px]',
    destaque ? 'bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_var(--primary)]'
      : ativo ? 'text-foreground' : 'text-background/65 hover:text-background',
  )
  const conteudo = (
    <>
      {ativo && <motion.span layoutId="v2-trilho" className="absolute inset-0 rounded-full bg-background" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
      {children}
    </>
  )
  return (
    <motion.div
      className="relative"
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      onHoverStart={() => setAberto(true)}
      onHoverEnd={() => setAberto(false)}
      onFocusCapture={() => setAberto(true)}
      onBlurCapture={() => setAberto(false)}
    >
      {href
        ? <Link href={href} aria-label={rotulo} aria-current={ativo ? 'page' : undefined} className={classe}>{conteudo}</Link>
        : <button type="button" onClick={onClick} aria-label={rotulo} className={classe}>{conteudo}</button>}
      <AnimatePresence>
        {aberto && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-4 whitespace-nowrap rounded-xl border border-border bg-card/95 backdrop-blur-md px-3 py-1.5 text-[12.5px] font-semibold text-foreground shadow-[0_10px_30px_-12px_rgba(16,24,40,0.45)]"
          >
            {rotulo}
            {atalho && <span className="ml-2 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{atalho}</span>}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** A aba "Mais" do topo, com as telas que não cabem nas pílulas. */
function Mais({ itens, ativo, pathname }: { itens: Destino[]; ativo: boolean; pathname: string }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    if (aberto) document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fecha ao trocar de página
  useEffect(() => { setAberto(false) }, [pathname])
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className={cn('relative h-9 px-4 rounded-full text-[13px] font-semibold inline-flex items-center gap-1 transition-colors', ativo ? 'text-white' : 'text-muted-foreground hover:text-foreground')}>
        {ativo && <motion.span layoutId="v2-pilula" className="absolute inset-0 rounded-full bg-marca" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
        <span className="relative">Mais</span><ChevronDown className={cn('relative w-3.5 h-3.5 transition-transform', aberto && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 w-[240px] rounded-2xl border border-border bg-card/95 backdrop-blur-xl p-1.5 shadow-2xl z-50">
            {itens.map((d) => {
              const Icone = d.icone
              const on = ativa(pathname, d.href)
              return (
                <Link key={d.href} href={d.href} className={cn('flex items-center gap-3 h-10 px-3 rounded-xl text-[13px] font-medium transition-colors', on ? 'bg-marca-suave text-marca-texto font-semibold' : 'text-foreground hover:bg-secondary')}>
                  <Icone className="w-4 h-4" />{d.rotulo}
                </Link>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A pessoa logada: iniciais, e ao clicar o nome, o e-mail e Sair. */
function MenuDaPessoa({ pessoa }: { pessoa: { nome: string; email: string } }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    if (aberto) document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-label="Sua conta" className="w-10 h-10 rounded-full bg-marca text-white grid place-items-center text-[12px] font-bold hover:ring-4 hover:ring-marca/15 transition-shadow">{getInitials(pessoa.nome)}</button>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-[240px] rounded-2xl border border-border bg-card p-1.5 shadow-2xl z-50">
            <div className="px-3 py-2.5 border-b border-border mb-1">
              <p className="text-[13px] font-semibold text-foreground truncate">{pessoa.nome}</p>
              <p className="text-[11.5px] text-muted-foreground truncate">{pessoa.email}</p>
            </div>
            <button type="button" onClick={() => signOut({ callbackUrl: '/login' })} className="w-full flex items-center gap-3 h-10 px-3 rounded-xl text-[13px] font-medium text-destructive-texto hover:bg-destructive-suave">
              <LogOut className="w-4 h-4" />Sair
            </button>
          </motion.div>
        )}
      </AnimatePresence>
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
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <span className="v2-mancha absolute -top-40 right-[-10%] h-[520px] w-[620px] rounded-full bg-marca/25 blur-[110px] dark:bg-marca/20" />
      <span className="v2-mancha v2-mancha-2 absolute top-[35%] -left-40 h-[460px] w-[520px] rounded-full bg-primary/20 blur-[120px] dark:bg-primary/10" />
      <span className="v2-mancha v2-mancha-3 absolute -bottom-48 right-[25%] h-[480px] w-[560px] rounded-full bg-info/20 blur-[120px] dark:bg-info/10" />
    </div>
  )
}
