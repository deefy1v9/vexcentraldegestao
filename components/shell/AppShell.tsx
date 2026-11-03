'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import * as Tooltip from '@radix-ui/react-tooltip'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { itemAtivo, navSections, TITULOS, type NavSection } from '@/components/shell/nav-config'
import { Sidebar } from './Sidebar'
import { ColunaDeSecao } from './ColunaDeSecao'
import { TopHeader, type PessoaDoCabecalho } from './TopHeader'
import ChatIA from './ChatIA'
import { TituloDaTela } from './TituloDaTela'
import { CascaContext } from './ShellContext'
import { BuscaGeral } from './BuscaGeral'
import { FundoDesfocado } from '@/components/v2/CascaV2'
import type { Contexto } from './TrocarContexto'

/**
 * A casca da Central, no mesmo desenho do painel da VEX Sales: trilho de
 * ícones à esquerda, cabeçalho global de 52px e o conteúdo rolando embaixo.
 *
 * Quem decide o que aparece é o servidor (quem está logado, se é admin, quais
 * contextos pode abrir); aqui só se desenha. Os ícones do menu são
 * componentes e não atravessam a fronteira servidor → cliente como props,
 * por isso a casca importa o nav-config por conta própria.
 *
 * No celular o trilho vira gaveta: abre pelo botão do cabeçalho e fecha ao
 * navegar, ao tocar fora ou no Esc.
 */
export function AppShell({
  pessoa,
  contextos,
  admin = true,
  children,
}: {
  pessoa: PessoaDoCabecalho
  contextos?: Contexto[]
  /** O colaborador não vê o que é de administração. */
  admin?: boolean
  children: React.ReactNode
}) {
  const secoes: NavSection[] = navSections
    .map((s) => ({ ...s, items: s.items.filter((i) => admin || !i.adminOnly) }))
    .filter((s) => s.items.length > 0)

  const [gaveta, setGaveta] = useState(false)
  // O trilho abre e fecha, e a escolha fica no navegador: quem trabalha o dia
  // todo aqui não quer reabrir o menu a cada visita.
  // Aberto por padrão, com os nomes, como no modelo Vireo (o dono, 03/11);
  // recolhe para só ícones e a escolha fica salva.
  const [aberta, setAberta] = useState(true)
  useEffect(() => {
    // Preferência salva só existe no navegador: ler no useState quebraria a hidratação
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setAberta(localStorage.getItem('vex-menu') !== 'fechado') } catch {}
  }, [])
  const alternarMenu = () => {
    setAberta((v) => {
      const novo = !v
      try { localStorage.setItem('vex-menu', novo ? 'aberto' : 'fechado') } catch {}
      return novo
    })
  }
  const pathname = usePathname()
  const [busca, setBusca] = useState(false)
  // Ctrl K / ⌘K abre a busca geral em qualquer tela
  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBusca(true) }
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])
  const casca = { alternarMenu, abrirGaveta: () => setGaveta(true), abrirBusca: () => setBusca(true) }

  // Numa tela de Configurações a coluna da seção abre ao lado do trilho.
  const atual = itemAtivo(pathname, secoes)
  const colunaDaSecao = atual?.secao.coluna ? atual.secao : null

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fecha a gaveta ao trocar de página
  useEffect(() => { setGaveta(false) }, [pathname])
  useEffect(() => {
    if (!gaveta) return
    const aoEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setGaveta(false) }
    window.addEventListener('keydown', aoEsc)
    return () => window.removeEventListener('keydown', aoEsc)
  }, [gaveta])

  return (
    <CascaContext.Provider value={casca}>
    <Tooltip.Provider delayDuration={300} skipDelayDuration={200}>
      <div className="relative flex h-dvh overflow-hidden bg-background">
        {/* Fundo com manchas desfocadas, como na versão 2 (o dono, 03/11) */}
        <FundoDesfocado />
        {/* ── Trilho (computador) ─────────────────────────────────────── */}
        <div className="relative hidden md:flex">
          <Sidebar
            marca={{ nome: 'VEX Growth', href: '/dashboard' }}
            secoes={secoes}
            contextos={contextos}
            pessoa={pessoa}
            aberta={aberta}
            aoBuscar={() => setBusca(true)}
          />
        </div>

        {/* A coluna da seção de Configurações, ao lado do trilho. */}
        {colunaDaSecao && (
          <div className="hidden lg:flex">
            <ColunaDeSecao secao={colunaDaSecao} ativoHref={atual?.item.href ?? null} />
          </div>
        )}

        {/* ── Gaveta (celular) ────────────────────────────────────────── */}
        {gaveta && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              aria-label="Fechar o menu"
              onClick={() => setGaveta(false)}
              className="absolute inset-0 bg-foreground/30 backdrop-blur-[1px]"
            />
            <div className="absolute inset-y-0 left-0 flex">
              <Sidebar
                marca={{ nome: 'VEX Growth', href: '/dashboard' }}
                secoes={secoes}
                contextos={contextos}
                pessoa={pessoa}
                modo="gaveta"
                assinatura
                aoBuscar={() => { setGaveta(false); setBusca(true) }}
                aoNavegar={() => setGaveta(false)}
              />
              <button
                aria-label="Fechar"
                onClick={() => setGaveta(false)}
                className="m-2 grid h-9 w-9 place-items-center self-start rounded-lg bg-card text-muted-foreground shadow-sm"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Cabeçalho + conteúdo ────────────────────────────────────── */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <TopHeader secoes={secoes} titulos={TITULOS} pessoa={pessoa} abrirMenu={() => setGaveta(true)} />
          <main className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto')}>
            <TituloDaTela titulos={TITULOS} />
            {children}
          </main>
        </div>
      </div>
      {/* Assistente com IA: só administradores */}
      {admin && <ChatIA />}
      {busca && <BuscaGeral secoes={secoes} aoFechar={() => setBusca(false)} />}
    </Tooltip.Provider>
    </CascaContext.Provider>
  )
}
