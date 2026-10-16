"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/vex/button";
import { usarTema } from "@/components/usar-tema";

/**
 * Claro ⇄ escuro em botão de ícone. O estado vem de `usarTema()` — o mesmo
 * cookie que qualquer outro controle de tema escreve, para nunca discordarem.
 *
 * É um botão de alternância de verdade: o nome acessível é "Tema escuro" e
 * `aria-pressed` diz se está ligado — o leitor de tela lê "Tema escuro,
 * pressionado" em vez de adivinhar pelo ícone. Os ícones giram e trocam em
 * 180ms; é a única animação: sem brilho, sem fundo colorido.
 */
export function ThemeToggle({
  className,
  compacto = false,
  // Sobrevive só por compatibilidade: a barra deixou de ser escura e o botão
  // tem um tom só, o do conteúdo.
  tom: _tom,
}: {
  className?: string;
  compacto?: boolean;
  /** @deprecated sem efeito; o botão tem um tom só. */
  tom?: "barra" | "conteudo";
}) {
  const { escuro, alternar } = usarTema();
  void _tom;

  const dica = escuro ? "Ativar o tema claro" : "Ativar o tema escuro";

  return (
    <Button
      type="button"
      variant="ghost"
      size={compacto ? "icon" : "default"}
      onClick={alternar}
      aria-label="Tema escuro"
      aria-pressed={escuro === true}
      title={escuro === null ? "Tema" : dica}
      className={cn(!compacto && "w-full justify-start px-2.5", className)}
    >
      <span className="relative block w-4 h-4 flex-shrink-0">
        {escuro !== null && (
          <>
            <Sun
              className={cn("absolute inset-0 transicao", escuro ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75")}
              strokeWidth={1.75}
            />
            <Moon
              className={cn("absolute inset-0 transicao", escuro ? "opacity-0 rotate-90 scale-75" : "opacity-100 rotate-0 scale-100")}
              strokeWidth={1.75}
            />
          </>
        )}
      </span>
      {!compacto && <span>{escuro === null ? "Tema" : escuro ? "Tema escuro" : "Tema claro"}</span>}
    </Button>
  );
}
