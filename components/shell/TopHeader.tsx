"use client";

import { usePathname } from "next/navigation";
import { ChevronRight, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "./UserMenu";
import { itemAtivo, type NavSection } from "@/components/shell/nav-config";

export type PessoaDoCabecalho = {
  nome: string;
  email: string;
  papel: string;
  avatar?: string | null;
  perfilHref?: string;
  sairPara?: string;
};

/**
 * O cabeçalho global, igual nos dois ambientes: à esquerda o nome da tela
 * (com a seção em cinza, como trilha), à direita tema + sino + a pessoa.
 * Fica FORA da área que rola, então não precisa de sticky nem de desfoque —
 * é uma faixa branca de 52px com borda embaixo. No celular ganha o botão
 * que abre a gaveta do menu.
 *
 * Com o trilho só de ícones, o NOME da tela mora aqui: é o que diz onde a
 * pessoa está. A descrição de cada tela (PageHeader) continua no conteúdo.
 */
export function TopHeader({
  secoes,
  titulos,
  pessoa,
  abrirMenu,
  className,
  central,
}: {
  secoes: NavSection[];
  /** Título por rota, para a trilha. */
  titulos: Record<string, { titulo: string }>;
  pessoa: PessoaDoCabecalho;
  abrirMenu: () => void;
  className?: string;
  /** A central de notificações (só no painel do cliente). */
  central?: React.ReactNode;
}) {
  const pathname = usePathname();
  const trilha = trilhaDe(pathname, secoes, titulos);

  return (
    <header
      className={cn(
        // `cabecalho-global`: globals.css o esconde no celular enquanto uma
        // conversa está aberta (a conversa toma a tela, com a própria seta).
        "cabecalho-global flex items-center justify-between gap-3 flex-shrink-0 h-[52px] px-4 md:px-6",
        "border-b border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={abrirMenu}
          aria-label="Abrir menu"
          className="md:hidden grid place-items-center w-9 h-9 -ml-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transicao"
        >
          <Menu className="w-5 h-5" strokeWidth={1.75} />
        </button>
        {trilha && (
          <nav aria-label="Onde você está" className="flex items-center gap-1.5 min-w-0">
            {trilha.secao && (
              <>
                <span className="hidden sm:block text-[12.5px] text-muted-foreground truncate">{trilha.secao}</span>
                <ChevronRight className="hidden sm:block w-3.5 h-3.5 text-subtle flex-shrink-0" strokeWidth={2} />
              </>
            )}
            <span className="text-[15px] font-semibold text-foreground truncate tracking-[-0.01em]">{trilha.titulo}</span>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <ThemeToggle compacto tom="conteudo" />
        {central}
        <span aria-hidden className="hidden sm:block w-px h-5 bg-border/80 mx-1" />
        <UserMenu
          nome={pessoa.nome}
          email={pessoa.email}
          papel={pessoa.papel}
          avatar={pessoa.avatar}
          perfilHref={pessoa.perfilHref}
          sairPara={pessoa.sairPara}
        />
      </div>
    </header>
  );
}

/** "Operação › Fila" a partir da rota — a seção vem do menu, o nome da
 *  tela da tabela de títulos ou do próprio item do menu. */
function trilhaDe(
  pathname: string,
  secoes: NavSection[],
  titulos: Record<string, { titulo: string }>,
): { secao: string | null; titulo: string } | null {
  // O destino de href mais longo que contém a rota — "/conta/equipe" é
  // Equipe, não Empresa (nav-config.itemAtivo).
  const atual = itemAtivo(pathname, secoes);
  if (atual) return { secao: atual.secao.label, titulo: titulos[pathname]?.titulo ?? atual.item.label };
  const direto = titulos[pathname];
  if (direto) return { secao: null, titulo: direto.titulo };
  // Telas filhas (/clientes/abc): a seção e o item do pai.
  const pai = Object.keys(titulos)
    .filter((h) => h !== "/" && pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (pai) {
    const secao = secoes.find((s) => s.items.some((i) => i.href === pai))?.label ?? null;
    return { secao, titulo: titulos[pai].titulo };
  }
  return null;
}
