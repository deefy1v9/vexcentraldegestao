"use client";

/**
 * Cartão de métrica com gráfico separado do resumo (o modelo
 * "ProgressMetricCard" que o dono trouxe em 01/10), em português e com o tom
 * da marca (`tom="marca"`: série na cor da marca), que é como ele
 * entra no "Esperando resposta" da aba Atendimento.
 *
 * Mudanças sobre o modelo: textos em português; `tom`; `descricao` embaixo do
 * título; `acao` (um botão no cabeçalho); `rodape` (o lado esquerdo do pé,
 * no lugar do delta). O gráfico e os controles moram em metric-chart e
 * metric-controls.
 */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACCENTS,
  formatCompact,
  MetricChart,
  SERIES_COLORS,
  type ChartSeries,
  type ChartView,
  type MetricAccent,
  type MetricSeries,
  type SeriesPoint,
} from "./metric-chart";
import { PeriodSelect, ViewToggle, type PeriodOption } from "./metric-controls";

export type { SeriesPoint, MetricSeries, MetricAccent, ChartView, PeriodOption };

export type CardSize = "sm" | "md" | "lg";

export interface ProgressMetricCardProps {
  title: string;
  /** Linha pequena embaixo do título. */
  descricao?: string;
  total?: string | number;
  delta?: string;
  deltaLabel?: string;
  percent?: string;
  trend?: "up" | "down";
  unit?: string;
  period?: string;
  periodOptions?: PeriodOption[];
  onPeriodChange?: (option: PeriodOption) => void;
  defaultView?: ChartView;
  accent?: MetricAccent;
  data?: SeriesPoint[];
  series?: MetricSeries[];
  defaultIndex?: number;
  size?: CardSize;
  showStats?: boolean;
  valueFormatter?: (value: number) => string;
  dateFormatter?: (date: string) => string;
  loading?: boolean;
  className?: string;
  /** `marca`: série na cor da marca sobre superfície neutra. */
  tom?: "padrao" | "marca";
  /** Um botão/link no cabeçalho, à direita. */
  acao?: React.ReactNode;
  /** O lado esquerdo do rodapé, no lugar do delta. */
  rodape?: React.ReactNode;
  /** A variação do primeiro para o último ponto, ao lado do período. */
  showTrend?: boolean;
  /** Escala do gráfico (ver MetricChart). */
  escala?: "linear" | "raiz";
  /** O botão que troca curva por barras. */
  showViewToggle?: boolean;
  /** `moeda`: valores em R$ (compacto no título, exato no balão). Existe
   *  porque função não atravessa de componente do servidor para este. */
  formato?: "numero" | "moeda";
  /** O que a variação compara (vira a dica dela). */
  tituloVariacao?: string;
  /** Compatibilidade com chamadas antigas; o gráfico tem sua própria área. */
  larguraGrafico?: number;
}

const DEFAULT_PERIODS: PeriodOption[] = [
  { label: "Últimos 3 dias", points: 3 },
  { label: "Últimos 7 dias", points: 7 },
  { label: "O período" },
];

// Variação abaixo disto é "estável".
const NEUTRAL_PCT = 0.5;

const SIZES: Record<CardSize, { minH: string; pad: string; footer: string; title: string; headline: string }> = {
  sm: { minH: "min-h-[260px]", pad: "px-6 pt-5", footer: "px-6 py-3", title: "text-[15px]", headline: "text-[32px]" },
  md: { minH: "min-h-[380px]", pad: "px-5 pt-5", footer: "px-5 py-3", title: "text-[17px]", headline: "text-[36px]" },
  lg: { minH: "min-h-[460px]", pad: "px-5 pt-5", footer: "px-5 py-3", title: "text-[19px]", headline: "text-[40px]" },
};

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const MOEDA_CURTA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

const sliceWindow = (points: SeriesPoint[], n?: number) => (n && n < points.length ? points.slice(-n) : points);

export default function ProgressMetricCard({
  title,
  descricao,
  total,
  delta,
  deltaLabel = "hoje",
  percent,
  trend,
  unit,
  period = "O período",
  periodOptions,
  onPeriodChange,
  defaultView = "curve",
  accent,
  data,
  series,
  defaultIndex,
  size = "md",
  showStats = true,
  valueFormatter,
  dateFormatter,
  loading = false,
  className = "",
  tom = "padrao",
  acao,
  rodape,
  showTrend = true,
  escala = "linear",
  showViewToggle = true,
  formato = "numero",
  tituloVariacao = "variação do primeiro para o último dia do gráfico",
}: ProgressMetricCardProps) {
  const sz = SIZES[size];
  const marca = tom === "marca";
  const shell = cn("relative flex w-full min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card text-card-foreground", sz.minH, className);
  const textoForte = "text-foreground";
  const textoFraco = "text-muted-foreground";

  const periods = periodOptions ?? DEFAULT_PERIODS;
  const [selectedLabel, setSelectedLabel] = useState(period);
  const [view, setView] = useState<ChartView>(defaultView);

  const baseSeries: MetricSeries[] = useMemo(
    () => (series?.length ? series : [{ name: title, data: data ?? [], accent }]),
    [series, data, title, accent],
  );
  const selectedOption = periods.find((p) => p.label === selectedLabel) ?? periods[periods.length - 1];
  const visibleSeries = useMemo(
    () => baseSeries.map((s) => ({ ...s, data: sliceWindow(s.data, selectedOption?.points) })),
    [baseSeries, selectedOption],
  );

  const primary = visibleSeries[0];
  const isMulti = visibleSeries.length > 1;
  const hasData = (primary?.data.length ?? 0) >= 2;

  const stats = useMemo(() => {
    const vals = primary?.data.map((d) => d.value) ?? [];
    const sum = vals.reduce((a, b) => a + b, 0);
    const first = vals[0] ?? 0;
    const last = vals[vals.length - 1] ?? 0;
    const prev = vals[vals.length - 2] ?? first;
    const net = last - first;
    return {
      sum,
      net,
      pct: first ? (net / first) * 100 : 0,
      step: last - prev,
      peak: vals.length ? Math.max(...vals) : 0,
      low: vals.length ? Math.min(...vals) : 0,
      avg: vals.length ? sum / vals.length : 0,
    };
  }, [primary]);

  const resolvedTrend: "up" | "down" | "flat" =
    trend ?? (Math.abs(stats.pct) < NEUTRAL_PCT ? "flat" : stats.net >= 0 ? "up" : "down");
  const resolvedAccent: MetricAccent =
    accent ?? (marca ? "marca" : resolvedTrend === "up" ? "emerald" : resolvedTrend === "down" ? "rose" : "neutral");
  const color = ACCENTS[resolvedAccent];
  const TrendIcon = resolvedTrend === "flat" ? ArrowRight : resolvedTrend === "down" ? ArrowDown : ArrowUp;

  const fmtCompact = valueFormatter ?? (formato === "moeda" ? (n: number) => MOEDA_CURTA.format(n) : formatCompact);
  const fmtFull =
    valueFormatter ??
    (formato === "moeda" ? (n: number) => MOEDA.format(n) : (n: number) => n.toLocaleString("pt-BR") + (unit ? ` ${unit}` : ""));
  const fmtDate = dateFormatter ?? ((d: string) => d);
  const sign = (n: number) => (n >= 0 ? "+" : "−") + fmtCompact(Math.abs(n));

  const displayTotal = total ?? fmtCompact(stats.sum);
  // Número longo ("R$ 51.200") num cartão estreito: menor, para não entrar
  // embaixo do gráfico.
  const longo = size === "sm" && String(displayTotal).length > 7;
  const displayDelta = delta ?? sign(stats.step);
  const displayPercent = percent ?? `${Math.abs(stats.pct).toFixed(1).replace(".", ",")}%`;

  const chartSeries: ChartSeries[] = visibleSeries.map((s, i) => ({
    name: s.name,
    data: s.data,
    color: s.accent ? ACCENTS[s.accent].stroke : isMulti ? SERIES_COLORS[i % SERIES_COLORS.length]! : color.stroke,
  }));

  const lastIndex = (primary?.data.length ?? 1) - 1;
  const fallback = Math.min(defaultIndex ?? lastIndex, lastIndex);

  const handlePeriodChange = (option: PeriodOption) => {
    setSelectedLabel(option.label);
    onPeriodChange?.(option);
  };

  const cabecalho = (
    <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className={cn(sz.title, "font-semibold tracking-tight", textoForte)}>{title}</h3>
          {hasData && showViewToggle && <ViewToggle value={view} onChange={setView} claro={false} />}
        </div>
        {descricao && <p className={cn("mt-1 text-[12.5px]", textoFraco)}>{descricao}</p>}
      </div>
      {acao && <div className="pointer-events-auto flex-shrink-0">{acao}</div>}
    </div>
  );

  if (loading) {
    return (
      <div className={shell} aria-busy="true">
        <div className={cn("flex flex-1 flex-col", sz.pad)}>
          <div className="h-5 w-32 animate-pulse rounded bg-muted/60" />
          <div className="mt-6 h-14 w-48 animate-pulse rounded-lg bg-muted/60" />
          <div className="mt-auto h-24 w-full animate-pulse rounded-lg bg-muted/30" />
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className={shell}>
        <div className={cn("flex flex-1 flex-col", sz.pad, "pb-5")}>
          {cabecalho}
          <div className={cn("mt-4 font-semibold leading-none tracking-tight tabular", sz.headline, textoForte)}>{displayTotal}</div>
          {rodape && <div className={cn("mt-auto pt-4 text-[12.5px]", textoFraco)}>{rodape}</div>}
        </div>
      </div>
    );
  }

  return (
    <div data-metrica-progresso className={shell}>
      <div className={cn("flex flex-col gap-3 min-w-0", sz.pad)}>
        {cabecalho}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={cn("font-semibold leading-tight tracking-tight tabular [overflow-wrap:anywhere]", longo ? "text-[30px]" : sz.headline, textoForte)}>{displayTotal}</p>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            {showTrend && <span className="flex items-center gap-1 font-medium" style={{ color: color.text }} title={tituloVariacao}><TrendIcon size={14} strokeWidth={2} />{displayPercent}</span>}
            <PeriodSelect value={selectedLabel} options={periods} onChange={handlePeriodChange} accentText={color.text} alinhar="inicio" />
          </div>
        </div>
        {isMulti && <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {chartSeries.map((s) => <span key={s.name} className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>)}
        </div>}
      </div>
      <div className="relative mx-3 h-[200px] min-w-0" aria-label={"Gráfico de " + title.toLowerCase()}>
        <MetricChart series={chartSeries} view={view} defaultIndex={fallback} valueFormatter={fmtFull} dateFormatter={fmtDate} escala={escala} />
      </div>
      <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border text-[12px]", sz.footer)}>
        <div className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{rodape ?? <><span className="font-medium" style={{ color: color.text }}>{displayDelta}</span> {deltaLabel}</>}</div>
        {showStats && <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
          <span><span className="font-medium text-foreground">{fmtCompact(stats.peak)}</span> pico</span><span aria-hidden>·</span>
          <span><span className="font-medium text-foreground">{fmtCompact(stats.low)}</span> mín.</span><span aria-hidden>·</span>
          <span><span className="font-medium text-foreground">{fmtCompact(Math.round(stats.avg))}</span> média</span>
        </div>}
      </div>
    </div>
  );
}
