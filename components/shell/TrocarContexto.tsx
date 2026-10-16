'use client'

import { usePathname } from 'next/navigation'
import * as Menu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Check, ChevronsUpDown, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ItensDaPessoa } from './UserMenu'
import type { PessoaDoCabecalho } from './TopHeader'

/**
 * O quadrado do produto, no pé do trilho — o mesmo lugar e o mesmo desenho
 * do seletor de empresa do painel da VEX Sales.
 *
 * Aqui ele troca o CONTEXTO de quem está olhando: a Central da VEX Growth,
 * o painel da VEX Sales, ou a conta de um cliente que contratou a IA. Quem
 * administra as duas frentes precisa saber em qual está antes de mexer em
 * dinheiro ou em conversa de cliente.
 *
 * Só o admin vê mais de um contexto. Para o colaborador o quadrado continua
 * aparecendo, sem chevron e sem lista: vale como "você está aqui", e o menu
 * da conta (perfil, tema, sair) segue no mesmo lugar.
 */

export type Contexto = {
  id: string
  nome: string
  /** "Central", "Plataforma" ou o nome do plano do cliente. */
  legenda?: string
  /** Para onde ir. Link externo abre em outra aba. */
  href: string
  externo?: boolean
  logo?: string | null
  atual?: boolean
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/**
 * `bg-card` e não transparente: logo de fundo claro sobre o trilho branco
 * ficaria sem contorno. A logo preenche o quadrado, sem margem interna.
 */
function Quadrado({ contexto, tamanho = 36 }: { contexto: Contexto; tamanho?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: tamanho, height: tamanho }}
      className="grid place-items-center flex-shrink-0 overflow-hidden rounded-[10px] border border-sidebar-border bg-card"
    >
      {contexto.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={contexto.logo} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[11px] font-semibold text-muted-foreground">{iniciais(contexto.nome)}</span>
      )}
    </span>
  )
}

export function TrocarContexto({
  contextos,
  expandida = false,
  pessoa,
  aoNavegar,
}: {
  contextos: Contexto[]
  /** Na gaveta do celular há largura para o nome ao lado do quadrado. */
  expandida?: boolean
  /** Quem está logado: o quadrado é também o menu da conta. */
  pessoa?: PessoaDoCabecalho
  aoNavegar?: () => void
}) {
  // Qual produto está aberto sai da rota: o contexto de href mais longo que
  // casa com ela. Sem isso o seletor diria "você está aqui" no lugar errado
  // depois de cada navegação.
  const pathname = usePathname()
  const raiz = (href: string) => '/' + (href.split('/')[1] ?? '')
  const porRota = [...contextos]
    .filter((c) => !c.externo && raiz(pathname) === raiz(c.href))
    .sort((a, b) => b.href.length - a.href.length)[0]
  const atual = porRota ?? contextos.find((c) => c.atual) ?? contextos[0]
  if (!atual) return null

  const outros = contextos.filter((c) => c !== atual)
  const temMenu = !!pessoa || outros.length > 0

  const gatilho = (
    <button
      type="button"
      className={cn(
        'flex items-center gap-2.5 rounded-xl p-1.5 transition-colors',
        expandida ? 'w-full' : 'justify-center',
        temMenu && 'hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
      )}
      aria-label={temMenu ? `Contexto: ${atual.nome}. Trocar` : atual.nome}
      title={!expandida ? atual.nome : undefined}
    >
      <Quadrado contexto={atual} />
      {expandida && (
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-semibold leading-tight text-sidebar-foreground">{atual.nome}</span>
          {atual.legenda && <span className="block truncate text-[11px] text-muted-foreground">{atual.legenda}</span>}
        </span>
      )}
      {expandida && temMenu && <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
    </button>
  )

  if (!temMenu) {
    return expandida ? gatilho : (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{gatilho}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="right" sideOffset={10} className="z-50 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[12px] text-popover-foreground shadow-md">
            {atual.nome}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    )
  }

  return (
    <Menu.Root>
      <Menu.Trigger asChild>{gatilho}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          side={expandida ? 'top' : 'right'}
          align={expandida ? 'center' : 'end'}
          sideOffset={10}
          className="z-50 min-w-[248px] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {pessoa && (
            <>
              <div className="px-2.5 py-2">
                <p className="truncate text-[13px] font-semibold leading-tight">{pessoa.nome}</p>
                <p className="truncate text-[12px] text-muted-foreground">{pessoa.email}</p>
                {pessoa.papel && <p className="mt-0.5 truncate text-[11px] text-subtle">{pessoa.papel}</p>}
              </div>
              <Menu.Separator className="my-1 h-px bg-border" />
            </>
          )}

          <Menu.Label className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">
            Suas empresas
          </Menu.Label>

          {contextos.map((c) => (
            <Menu.Item key={c.id} asChild>
              <a
                href={c.href}
                target={c.externo ? '_blank' : undefined}
                rel={c.externo ? 'noopener noreferrer' : undefined}
                onClick={aoNavegar}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-secondary"
              >
                <Quadrado contexto={c} tamanho={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium leading-tight">{c.nome}</span>
                  {c.legenda && <span className="block truncate text-[11px] text-muted-foreground">{c.legenda}</span>}
                </span>
                {c === atual && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
                {c !== atual && c.externo && <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-subtle" />}
              </a>
            </Menu.Item>
          ))}

          {pessoa && (
            <>
              <Menu.Separator className="my-1 h-px bg-border" />
              <ItensDaPessoa nome={pessoa.nome} email={pessoa.email} papel={pessoa.papel} avatar={pessoa.avatar} perfilHref={pessoa.perfilHref} sairPara={pessoa.sairPara} />
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
