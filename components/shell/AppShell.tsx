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
  const [aberta, setAberta] = useState(false)
  useEffect(() => {
    try { setAberta(localStorage.getItem('vex-menu') === 'aberto') } catch {}
  }, [])
  const alternarMenu = () => {
    setAberta((v) => {
      const novo = !v
      try { localStorage.setItem('vex-menu', novo ? 'aberto' : 'fechado') } catch {}
      return novo
    })
  }
  const pathname = usePathname()

  // Numa tela de Configurações a coluna da seção abre ao lado do trilho.
  const atual = itemAtivo(pathname, secoes)
  const colunaDaSecao = atual?.secao.coluna ? atual.secao : null

  useEffect(() => { setGaveta(false) }, [pathname])
  useEffect(() => {
    if (!gaveta) return
    const aoEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setGaveta(false) }
    window.addEventListener('keydown', aoEsc)
    return () => window.removeEventListener('keydown', aoEsc)
  }, [gaveta])

  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={200}>
      <div className="flex h-dvh overflow-hidden bg-background">
        {/* ── Trilho (computador) ─────────────────────────────────────── */}
        <div className="hidden md:flex">
          <Sidebar
            marca={{ nome: 'VEX Growth', href: '/dashboard' }}
            secoes={secoes}
            contextos={contextos}
            pessoa={pessoa}
            aberta={aberta}
            aoAlternar={alternarMenu}
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
        <div className="flex min-w-0 flex-1 flex-col">
          <TopHeader secoes={secoes} titulos={TITULOS} pessoa={pessoa} abrirMenu={() => setGaveta(true)} />
          <main className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto')}>
            <TituloDaTela titulos={TITULOS} />
            {children}
          </main>
        </div>
      </div>
      {/* Assistente com IA: só administradores */}
      {admin && <ChatIA />}
    </Tooltip.Provider>
  )
}
