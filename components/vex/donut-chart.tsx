"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Rosca interativa: a fatia sob o ponteiro se destaca e o centro passa a
 * contar a história dela.
 *
 * Portada de um componente de prateleira, com o que o desenho da casa exige:
 *
 *   AS CORES SÃO TOKENS. O original trazia `hsl(var(--primary))` e um anel de
 *   fundo em `--border`; aqui a paleta é a das séries, e o anel de fundo é
 *   `--secondary`, que o tema escuro repinta.
 *
 *   RESPEITA `prefers-reduced-motion`. O original anima sempre. Quem marcou
 *   no sistema que não quer movimento recebe a figura pronta.
 *
 *   A LEGENDA VEM JUNTO e é o outro lado do mesmo gesto: passar o ponteiro
 *   nela destaca a fatia, e vice-versa. Separadas, a legenda vira um enfeite
 *   que não responde — e é ela que carrega o número, que é o que sobra
 *   quando a cor não chega.
 *
 *   `strokeLinecap` é RETO, não arredondado. Ponta redonda cresce para fora
 *   da fatia e faz a menor delas parecer maior do que é; numa figura cuja
 *   única função é comparar tamanhos, isso é mentira.
 */

export interface FatiaDaRosca {
  rotulo: string;
  valor: number;
  cor: string;
}

/** Quem pediu menos movimento no sistema recebe a figura pronta. */
function usaMenosMovimento(): boolean {
  const [menos, setMenos] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMenos(mq.matches);
    const ouvir = (e: MediaQueryListEvent) => setMenos(e.matches);
    mq.addEventListener("change", ouvir);
    return () => mq.removeEventListener("change", ouvir);
  }, []);
  return menos;
}

export function DonutChart({
  fatias,
  unidade = "",
  tamanho = 168,
  espessura = 26,
  className,
}: {
  fatias: FatiaDaRosca[];
  /** O que o total é: "leads", "reuniões". Vai embaixo do número no centro. */
  unidade?: string;
  tamanho?: number;
  espessura?: number;
  className?: string;
}) {
  const [sob, setSob] = React.useState<string | null>(null);
  const semMovimento = usaMenosMovimento();

  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (total <= 0) return <p className={cn("text-[13px] text-muted-foreground", className)}>Nada no período.</p>;

  const raio = tamanho / 2 - espessura / 2;
  const perimetro = 2 * Math.PI * raio;
  const ativa = fatias.find((f) => f.rotulo === sob) ?? null;

  const noCentro = ativa ?? { rotulo: `no total`, valor: total, cor: "" };
  const pctDoCentro = ativa ? Math.round((ativa.valor / total) * 100) : 100;

  let acumulado = 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-5", className)}>
      <div
        className="relative flex-shrink-0"
        style={{ width: tamanho, height: tamanho }}
        onMouseLeave={() => setSob(null)}
      >
        <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} className="-rotate-90">
          <circle
            cx={tamanho / 2}
            cy={tamanho / 2}
            r={raio}
            fill="none"
            stroke="var(--secondary)"
            strokeWidth={espessura}
          />
          <AnimatePresence>
            {fatias.map((f, i) => {
              if (f.valor <= 0) return null;
              const fracao = f.valor / total;
              // 2px de respiro entre fatias: sem ele, duas vizinhas de cor
              // parecida viram uma só.
              const risco = Math.max(0, fracao * perimetro - 2);
              const deslocamento = acumulado * perimetro;
              acumulado += fracao;
              const destacada = sob === f.rotulo;
              return (
                <motion.circle
                  key={f.rotulo}
                  cx={tamanho / 2}
                  cy={tamanho / 2}
                  r={raio}
                  fill="none"
                  stroke={f.cor}
                  strokeWidth={destacada ? espessura + 4 : espessura}
                  strokeDasharray={`${risco} ${perimetro - risco}`}
                  strokeDashoffset={-deslocamento}
                  strokeLinecap="butt"
                  className="cursor-pointer"
                  style={{ transition: "stroke-width .18s ease-out" }}
                  initial={semMovimento ? false : { opacity: 0, strokeDasharray: `0 ${perimetro}` }}
                  animate={{ opacity: 1, strokeDasharray: `${risco} ${perimetro - risco}` }}
                  transition={
                    semMovimento
                      ? { duration: 0 }
                      : { duration: 0.7, delay: i * 0.06, ease: "easeOut" }
                  }
                  onMouseEnter={() => setSob(f.rotulo)}
                />
              );
            })}
          </AnimatePresence>
        </svg>

        <div className="absolute inset-0 grid place-items-center pointer-events-none text-center px-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={noCentro.rotulo}
              initial={semMovimento ? false : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={semMovimento ? undefined : { opacity: 0, scale: 0.94 }}
              transition={{ duration: semMovimento ? 0 : 0.15 }}
              className="leading-none"
            >
              <p className="text-[26px] font-semibold tabular text-foreground">{noCentro.valor}</p>
              <p className="mt-1 text-[10.5px] text-muted-foreground truncate">
                {ativa ? `${pctDoCentro}% · ${ativa.rotulo}` : unidade || "no total"}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* A legenda é o outro lado do mesmo gesto — e é ela que carrega o
          número, que é o que sobra quando a cor não chega. */}
      <ul className="min-w-[11rem] flex-1 space-y-0.5">
        {fatias.map((f) => (
          <li key={f.rotulo}>
            <button
              type="button"
              onMouseEnter={() => setSob(f.rotulo)}
              onMouseLeave={() => setSob(null)}
              onFocus={() => setSob(f.rotulo)}
              onBlur={() => setSob(null)}
              className={cn(
                "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left transicao",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                sob === f.rotulo ? "bg-accent" : "hover:bg-accent",
              )}
            >
              <span
                aria-hidden
                className="inline-block w-2.5 h-2.5 rounded-[3px] flex-shrink-0 translate-y-[1px]"
                style={{ background: f.cor }}
              />
              <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{f.rotulo}</span>
              <span className="ml-auto tabular text-[12.5px] font-semibold text-foreground">{f.valor}</span>
              <span className="tabular t-legenda w-9 text-right">{Math.round((f.valor / total) * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

DonutChart.displayName = "DonutChart";
export default DonutChart;
