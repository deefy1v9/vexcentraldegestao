"use client";

/**
 * O gráfico do ProgressMetricCard (o modelo que o dono trouxe em 01/10 vinha
 * sem este arquivo; aqui ele foi escrito do zero no mesmo contrato).
 *
 * Ocupa a caixa em que estiver (posição absoluta, 100% × 100%), mede-se por
 * ResizeObserver e desenha em pixels de verdade: curva suave (Catmull-Rom)
 * com área esmaecendo, ou barras. O ponto ativo (o padrão, ou o que estiver
 * sob o mouse) ganha guia vertical, bolinha e um balão com data e valor.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";

export type SeriesPoint = { value: number; date: string };
export type MetricAccent = "emerald" | "rose" | "neutral" | "marca" | "branco";
export type MetricSeries = { name: string; data: SeriesPoint[]; accent?: MetricAccent };
export type ChartView = "curve" | "bar";
export type ChartSeries = { name: string; data: SeriesPoint[]; color: string };

/** Paleta semântica compartilhada entre os dois temas. */
export const ACCENTS: Record<MetricAccent, { stroke: string; text: string }> = {
  emerald: { stroke: "var(--success)", text: "var(--success)" },
  rose: { stroke: "var(--destructive)", text: "var(--destructive)" },
  neutral: { stroke: "var(--subtle)", text: "var(--muted-foreground)" },
  marca: { stroke: "var(--primary)", text: "var(--primary)" },
  branco: { stroke: "var(--primary-foreground)", text: "var(--primary-foreground)" },
};

export const SERIES_COLORS = ["var(--grafico-1)", "var(--grafico-2)", "var(--grafico-3)", "var(--grafico-4)"];

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
export function formatCompact(n: number): string {
  return compacto.format(n);
}

/** Até onde o desenho desce: abaixo disto fica o rodapé do cartão. */
const RODAPE = 56;

function curva(p: { x: number; y: number }[]): string {
  if (p.length === 0) return "";
  let d = `M ${p[0]!.x} ${p[0]!.y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[i + 2] ?? p2;
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function MetricChart({
  series,
  view,
  defaultIndex,
  valueFormatter,
  dateFormatter,
  escala = "linear",
}: {
  series: ChartSeries[];
  view: ChartView;
  defaultIndex: number;
  valueFormatter: (n: number) => string;
  dateFormatter: (d: string) => string;
  /** `raiz`: a altura segue a raiz do valor. Um dia de pico não achata os
   *  outros numa linha no chão; o balão continua dizendo o número exato. */
  escala?: "linear" | "raiz";
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);

  const medir = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) setTam({ w: r.width, h: r.height });
  }, []);
  useEffect(() => {
    medir();
    const ro = new ResizeObserver(medir);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [medir]);

  const principal = series[0];
  const n = principal?.data.length ?? 0;
  const { w: W, h: H } = tam;
  const esc = (v: number) => (escala === "raiz" ? Math.sqrt(Math.max(0, v)) : v);
  const todos = series.flatMap((s) => s.data.map((d) => esc(d.value)));
  const max = Math.max(1, ...todos);
  const min = Math.min(0, ...todos);
  const topo = H * 0.3;
  const base = H - RODAPE - 14;
  // Folga nas laterais: a barra da ponta não encosta na borda do cartão.
  const MARGEM = 20;
  // Barras: finas e juntas, o grupo encostado à direita a 24px da borda (a
  // margem do cartão, alinhada ao botão do cabeçalho). Se não couberem,
  // espalham como a curva.
  const BARRA = 16;
  const VAO = 8;
  const DIREITA = 24;
  const grupo = n * BARRA + (n - 1) * VAO;
  const barrasJuntas = view === "bar" && grupo <= W - DIREITA - MARGEM;
  const passo = barrasJuntas ? BARRA + VAO : n > 1 ? (W - 2 * MARGEM) / (n - 1) : 0;
  const inicio = barrasJuntas ? W - DIREITA - grupo + BARRA / 2 : MARGEM;
  const xDe = (i: number) => inicio + i * passo;
  const yDe = (v: number) => base - ((esc(v) - min) / (max - min || 1)) * (base - topo);
  const ativo = Math.max(0, Math.min(hover ?? defaultIndex, n - 1));

  const aoMover = (e: React.PointerEvent<SVGRectElement>) => {
    if (n < 2) return;
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const i = Math.round((e.clientX - r.left - inicio) / (passo || 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const pontoAtivo = principal?.data[ativo];
  const cor = principal ? series[0]!.color : "var(--subtle)";
  // O balão só com o mouse em cima, perto do ponto e sem sair da caixa: fixo
  // no alto ele cobria o cabeçalho do cartão.
  const balaoX = Math.min(Math.max(xDe(ativo), 64), W - 64);
  const balaoY = pontoAtivo ? Math.min(Math.max(yDe(pontoAtivo.value) - 54, 48), base - 48) : 0;

  return (
    <div ref={ref} className="absolute inset-0">
      {W > 0 && H > 0 && principal && n >= 2 && (
        <svg width={W} height={H} className="absolute inset-0 overflow-visible" role="img" aria-label={`${principal.name}: ${n} pontos`}>
          <defs>
            {series.map((s, si) => (
              <linearGradient key={s.name} id={`${uid}-area-${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {view === "curve"
            ? series.map((s, si) => {
                const pts = s.data.map((d, i) => ({ x: xDe(i), y: yDe(d.value) }));
                const linha = curva(pts);
                return (
                  <g key={s.name}>
                    {si === 0 && <path d={`${linha} L ${xDe(pts.length - 1)} ${base} L ${xDe(0)} ${base} Z`} fill={`url(#${uid}-area-${si})`} />}
                    <path d={linha} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinecap="round" strokeOpacity={si === 0 ? 0.95 : 0.7} />
                  </g>
                );
              })
            : principal.data.map((d, i) => {
                // Largura igual para todas; dia zerado
                // ainda aparece como um toco, não some.
                const larg = barrasJuntas ? BARRA : Math.max(8, Math.min(22, passo * 0.6));
                const altura = Math.max(8, base - yDe(d.value));
                return (
                  <rect
                    key={`${d.date}-${i}`}
                    x={xDe(i) - larg / 2}
                    y={base - altura}
                    width={larg}
                    height={altura}
                    rx={Math.min(8, larg / 2)}
                    fill={cor}
                    fillOpacity={i === ativo ? 0.95 : 0.5}
                  />
                );
              })}

          {/* O ponto ativo: guia, bolinha e balão. */}
          {pontoAtivo && (
            <g pointerEvents="none">
              <line x1={xDe(ativo)} x2={xDe(ativo)} y1={topo - 8} y2={base} stroke={cor} strokeOpacity={0.45} strokeDasharray="3 4" />
              {view === "curve" && <circle cx={xDe(ativo)} cy={yDe(pontoAtivo.value)} r={5} fill={cor} stroke="var(--card)" strokeWidth={2} />}
              {hover !== null && (
                <foreignObject x={balaoX - 64} y={balaoY} width={128} height={44}>
                  <div className="mx-auto w-fit rounded-lg bg-foreground/90 px-2 py-1 text-center text-background shadow-sm">
                    <p className="text-[10.5px] leading-tight opacity-80">{dateFormatter(pontoAtivo.date)}</p>
                    <p className="text-[12px] font-semibold leading-tight tabular whitespace-nowrap">{valueFormatter(pontoAtivo.value)}</p>
                  </div>
                </foreignObject>
              )}
            </g>
          )}

          {/* A área que escuta o mouse. */}
          <rect x={0} y={0} width={W} height={base} fill="transparent" onPointerMove={aoMover} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
    </div>
  );
}
