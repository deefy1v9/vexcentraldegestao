"use client";

import { usePathname } from "next/navigation";

/**
 * O nome da tela no topo do conteúdo, no computador (o dono, 01/10).
 *
 * O nome morava só na barra de cima ("Operação › Tarefas"); a barra saiu no
 * computador e telas como Tarefas, Agenda, Automações e Objeções ficaram sem
 * dizer o que são. Título e frase vêm da mesma tabela do menu (TITULOS); tela
 * filha (/disparos/<id>) usa o do pai.
 *
 * Fica de fora onde a tela já se apresenta: Início (as abas), Mensagens (as
 * três colunas ocupam a altura toda) e Relatórios. E o globals.css o esconde
 * em qualquer tela que já tenha o próprio <h1>. No celular, a barra de cima
 * continua dizendo o nome.
 */
const SEM_TITULO = ["/", "/mensagens", "/relatorios"];

export function TituloDaTela({ titulos }: { titulos: Record<string, { titulo: string; sub?: string }> }) {
  const pathname = usePathname();
  if (SEM_TITULO.includes(pathname) || pathname.startsWith("/mensagens/conversa")) return null;
  const chave =
    titulos[pathname] !== undefined
      ? pathname
      : Object.keys(titulos)
          .filter((h) => h !== "/" && pathname.startsWith(h + "/"))
          .sort((a, b) => b.length - a.length)[0];
  const atual = chave ? titulos[chave] : undefined;
  if (!atual) return null;
  return (
    <div data-titulo-tela="" className="hidden md:block px-8 pt-6">
      <h1 className="t-pagina">{atual.titulo}</h1>
      {atual.sub && <p className="t-legenda mt-1">{atual.sub}</p>}
    </div>
  );
}
