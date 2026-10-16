import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RevelarAbaAtiva } from "./revelar-aba-ativa";

export type AbaDaPagina = {
  chave: string;
  rotulo: string;
  /** O nome no celular, onde as abas precisam caber lado a lado. */
  curto?: string;
  icone: LucideIcon;
  /** Um número ao lado do nome; zero não aparece. */
  contagem?: number;
};

/**
 * As abas sublinhadas de uma página de Configurações (Equipe, Atendimento).
 * A aba vive na URL (?aba=), então cada ação da página volta para a aba de
 * onde saiu e o link pode ser mandado para alguém. O desenho é o das abas
 * do PainelDoNegocio: sublinhado laranja na ativa, contagem em laranja
 * cheio só nela.
 */
export function AbasDaPagina({
  base,
  abas,
  ativa,
  rotulo,
}: {
  base: string;
  abas: AbaDaPagina[];
  ativa: string;
  rotulo: string;
}) {
  return (
    <nav role="tablist" aria-label={rotulo} className="flex min-w-0 max-w-full items-end gap-0.5 border-b border-border overflow-x-auto sem-barra">
      <RevelarAbaAtiva ativa={ativa} />
      {abas.map((a) => {
        const eAtiva = a.chave === ativa;
        const Icone = a.icone;
        return (
          <Link
            key={a.chave}
            href={`${base}${base.includes("?") ? "&" : "?"}aba=${a.chave}`}
            scroll={false}
            role="tab"
            aria-selected={eAtiva}
            className={cn(
              "inline-flex items-center gap-1.5 sm:gap-2 h-10 px-2 sm:px-3 -mb-px border-b-2 text-[13px] whitespace-nowrap transicao",
              "focus-visible:outline-none focus-visible:bg-secondary/60",
              eAtiva ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {/* No celular, só o nome: os ícones tomariam o espaço da última aba. */}
            <Icone className="hidden sm:block w-4 h-4" strokeWidth={1.75} aria-hidden />
            {a.curto ? (
              <>
                <span className="sm:hidden">{a.curto}</span>
                <span className="hidden sm:inline">{a.rotulo}</span>
              </>
            ) : (
              a.rotulo
            )}
            {a.contagem !== undefined && a.contagem > 0 && (
              <span
                className={cn(
                  "min-w-5 h-5 px-1.5 rounded-md grid place-items-center text-[11px] font-semibold tabular",
                  eAtiva ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                {a.contagem}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
