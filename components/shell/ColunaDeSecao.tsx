"use client";

import { Fragment } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { NavSection } from "@/components/shell/nav-config";

/**
 * A coluna que abre AO LADO da barra quando a pessoa está numa tela de
 * Configurações: o nome da seção no topo (na altura do cabeçalho) e os
 * destinos dela embaixo, um por linha, com o ativo marcado como na barra
 * principal: a linha em cinza mais escuro, o traço grafite na borda e o
 * ícone cheio (04/10/2026).
 *
 * É o desenho dos sistemas de atendimento e de CRM: a barra fica com o que
 * se usa todo dia, e o que se ajusta de vez em quando ganha um lugar
 * próprio, sem dez ícones a mais no trilho. Só existe no desktop — no
 * celular a gaveta lista tudo, por extenso.
 *
 * Os destinos vêm em grupos (`grupo` no nav-config: Conta, Canais, Vendas),
 * com o nome do grupo em cinza e sem caixa alta (04/10/2026: eram 13 itens
 * soltos). O tema que morava no rodapé foi para o menu da conta, no quadrado
 * da empresa: trocar de tema não deveria exigir abrir Configurações.
 */
export function ColunaDeSecao({ secao, ativoHref }: { secao: NavSection; ativoHref: string | null }) {
  return (
    <aside
      aria-label={secao.label}
      className="hidden md:flex flex-col h-full w-[232px] flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
    >
      <div className="flex items-center flex-shrink-0 h-[52px] px-5 border-b border-sidebar-border">
        <h2 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">{secao.label}</h2>
      </div>
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-px">
        {secao.items.map((item, i) => {
          const Icone = item.icon;
          const on = item.href === ativoHref;
          const novoGrupo = item.grupo && item.grupo !== secao.items[i - 1]?.grupo;
          return (
            <Fragment key={item.href}>
              {novoGrupo && <p className={cn("px-[18px] pb-1 text-[11px] leading-4 font-medium text-subtle", i > 0 ? "pt-4" : "pt-1")}>{item.grupo}</p>}
              <div className={cn("relative", on && "bg-sidebar-ativo")}>
                {on && <span aria-hidden className="absolute left-0 inset-y-0 w-[2px] bg-sidebar-barra" />}
                <Link
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "ico-vivo mx-2 flex items-center gap-2.5 h-9 px-2.5 rounded-none text-[13px] transicao",
                    on ? "text-sidebar-icone-ativo font-semibold" : "text-sidebar-icone font-medium hover:bg-sidebar-ativo/60 hover:text-sidebar-icone-ativo",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                  )}
                >
                  <Icone cheio={on} className="w-[20px] h-[20px] flex-shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{item.label}</span>
                </Link>
              </div>
            </Fragment>
          );
        })}
      </nav>
    </aside>
  );
}
