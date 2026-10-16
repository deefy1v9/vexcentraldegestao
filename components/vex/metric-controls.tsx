"use client";

/**
 * Controles compartilhados para período e apresentação dos gráficos.
 */
import { useEffect, useRef, useState } from "react";
import { BarChart3, ChevronDown, Spline } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChartView } from "./metric-chart";

export type PeriodOption = { label: string; points?: number };

export function PeriodSelect({
  value,
  options,
  onChange,
  accentText,
  claro = false,
  alinhar = "fim",
}: {
  value: string;
  options: PeriodOption[];
  onChange: (o: PeriodOption) => void;
  accentText?: string;
  /** Sobre fundo colorido (o cartão laranja): texto e menu em branco. */
  claro?: boolean;
  /** De que lado do botão o menu se alinha. `inicio` abre para a direita:
   *  num cartão com overflow escondido, alinhado pelo fim ele vazava pela
   *  borda esquerda e era cortado. */
  alinhar?: "inicio" | "fim";
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="pointer-events-auto relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-lg px-2.5 h-7 text-[12.5px] font-medium transicao",
          claro ? "bg-primary-foreground/15 border border-primary-foreground/25 text-primary-foreground hover:bg-primary-foreground/25" : "bg-secondary text-foreground hover:bg-accent",
        )}
        style={!claro && accentText ? { color: accentText } : undefined}
      >
        {value}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", aberto && "rotate-180")} strokeWidth={2.2} />
      </button>
      {aberto && (
        <ul
          role="listbox"
          className={cn(
            "absolute top-full z-30 mt-1.5 min-w-[150px] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-[var(--sombra-flutuante)]",
            alinhar === "inicio" ? "left-0" : "right-0",
          )}
        >
          {options.map((o) => (
            <li key={o.label}>
              <button
                type="button"
                role="option"
                aria-selected={o.label === value}
                onClick={() => {
                  onChange(o);
                  setAberto(false);
                }}
                className={cn(
                  "w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transicao hover:bg-secondary",
                  o.label === value && "font-semibold text-primary",
                )}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ViewToggle({ value, onChange, claro = false }: { value: ChartView; onChange: (v: ChartView) => void; claro?: boolean }) {
  const botao = (v: ChartView, rotulo: string, Icone: typeof Spline) => (
    <button
      type="button"
      aria-label={rotulo}
      aria-pressed={value === v}
      onClick={() => onChange(v)}
      className={cn(
        "grid place-items-center w-6 h-6 rounded-md transicao",
        claro
          ? value === v ? "bg-card text-primary" : "text-primary-foreground/80 hover:text-primary-foreground"
          : value === v ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icone className="w-3.5 h-3.5" strokeWidth={2.2} />
    </button>
  );
  return (
    <div className={cn("pointer-events-auto inline-flex items-center gap-0.5 rounded-lg p-0.5", claro ? "bg-primary-foreground/15" : "bg-secondary")}>
      {botao("curve", "Ver em curva", Spline)}
      {botao("bar", "Ver em barras", BarChart3)}
    </div>
  );
}
