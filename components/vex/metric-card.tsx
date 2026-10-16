import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/vex/sparkline";

/**
 * Cartão de métrica: raio compartilhado de 12px, borda, ícone e número em
 * destaque com a linha de contexto embaixo, e a linha de tendência ao lado
 * quando há série.
 *
 * Os tons usam tokens e preservam a mesma superfície neutra. O tom
 * primário dá ênfase ao ícone, mantendo números e contexto legíveis.
 *
 * E dois PORTES. `compacto` é o desenho original do pacote, que o backoffice
 * usa. `amplo` é para telas em que os quatro cards ficam lado a lado e
 * precisam ter a mesma altura: ícone em disco, número maior, e o rodapé
 * empurrado para baixo pelo `justify-between` — é o que alinha as linhas de
 * tendência de todos os cards na mesma altura.
 *
 * O porte é prop, e não uma segunda cópia do componente, porque o conteúdo,
 * os tons e a série são exatamente os mesmos; o que muda é a densidade.
 */
const TONS = {
  neutro: "border border-border bg-card text-card-foreground",
  primaria: "border border-border bg-card text-card-foreground",
  marca: "border border-border bg-card text-card-foreground",
  destaque: "border border-border bg-card text-card-foreground",
} as const;

/** Respiro de cada tom no porte compacto (o do pacote). */
const RESPIRO_COMPACTO = {
  neutro: "px-[23px] py-[19px]",
  primaria: "p-6 pb-[26px]",
  marca: "p-6 pb-[26px]",
  destaque: "p-6 pb-[26px]",
} as const;

/**
 * Sinal compacto para o ícone; a ação principal usa a cor da marca.
 */
const FUNDO_ICONE = {
  neutro: "bg-secondary text-muted-foreground",
  primaria: "bg-secondary text-primary",
  marca: "bg-secondary text-muted-foreground",
  destaque: "bg-secondary text-muted-foreground",
} as const;

export type TomCard = keyof typeof TONS;

export function MetricCard({
  rotulo,
  valor,
  detalhe,
  tom = "neutro",
  porte = "compacto",
  icone: Icone,
  serie,
  serieTitulo,
  corValor,
  className,
}: {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  tom?: TomCard;
  /** `amplo` alinha altura e sobe o número; ver o comentário do arquivo. */
  porte?: "compacto" | "amplo";
  icone?: React.ElementType;
  /** Últimos dias, do mais antigo ao mais recente. Vira a linha à direita. */
  serie?: number[];
  serieTitulo?: string;
  /** Cor do número, quando ele carrega significado próprio — um atraso em
   *  vermelho. Sem isto, herda a cor do texto do card. */
  corValor?: string;
  className?: string;
}) {
  const pintado = tom !== "neutro";
  const amplo = porte === "amplo";

  return (
    <div
      className={cn(
        "rounded-[var(--radius)] min-w-0",
        TONS[tom],
        amplo ? "p-6 min-h-[176px] flex flex-col justify-between gap-5" : RESPIRO_COMPACTO[tom],
        className,
      )}
    >
      {Icone && (
        <span
          className={cn(
            "grid place-items-center",
            FUNDO_ICONE[tom],
            amplo
              ? "w-11 h-11 rounded-full"
              : cn(
                  pintado ? "w-12 h-12 rounded-xl mb-7" : "w-9 h-9 rounded-lg mb-4",
                ),
          )}
        >
          <Icone className={amplo ? "w-[22px] h-[22px]" : pintado ? "w-6 h-6" : "w-5 h-5"} strokeWidth={2} />
        </span>
      )}

      <div
        className={cn(
          "flex justify-between gap-3",
          amplo ? "items-end" : "items-center",
          Icone && !amplo && "mt-[15px]",
        )}
      >
        <div className="min-w-0">
          <p
            className={cn(
              "font-medium leading-4 [overflow-wrap:anywhere]",
              amplo ? "text-[12.5px]" : "text-[12px]",
              pintado ? (amplo ? "opacity-80" : "opacity-75") : "text-muted-foreground",
            )}
          >
            {rotulo}
          </p>
          <p
            className={cn(
              "font-semibold tabular [overflow-wrap:anywhere]",
              amplo
                ? "mt-1 text-[26px] leading-[32px] tracking-[-0.025em]"
                : "mt-0.5 text-[18px] leading-[25px]",
            )}
            style={corValor ? { color: corValor } : undefined}
          >
            {valor}
          </p>
          {detalhe && (
            <p
              className={cn(
                "mt-1 leading-relaxed [overflow-wrap:anywhere]",
                amplo ? "text-[11.5px]" : "text-[12px]",
                pintado ? "opacity-75" : "text-muted-foreground",
              )}
            >
              {detalhe}
            </p>
          )}
        </div>
        {serie && serie.length > 1 && (
          <Sparkline
            valores={serie}
            cor={tom === "marca" ? "var(--primary)" : "currentColor"}
            className={cn("flex-shrink-0", tom === "primaria" && "opacity-70")}
            title={serieTitulo}
          />
        )}
      </div>
    </div>
  );
}
