/**
 * Linha de tendência de poucos pontos — o `chart-small` do pacote (96×28,
 * traço de 3px, área suave embaixo). Em SVG puro: não faz sentido carregar
 * uma biblioteca de gráfico para desenhar 28px de altura.
 *
 * Só desenha; não rotula. Quem chama diz, no `title`, o que os pontos são.
 */
export function Sparkline({
  valores,
  cor = "currentColor",
  largura = 96,
  altura = 28,
  className,
  title,
}: {
  valores: number[];
  cor?: string;
  largura?: number;
  altura?: number;
  className?: string;
  title?: string;
}) {
  if (valores.length < 2) return null;
  const max = Math.max(...valores);
  const min = Math.min(...valores, 0);
  const faixa = max - min || 1;
  const n = valores.length;
  // 2px de folga em cima e embaixo para o traço de 3px não ser cortado.
  const pontos = valores.map((v, i) => [
    (i / (n - 1)) * largura,
    altura - 2 - ((v - min) / faixa) * (altura - 4),
  ]);
  const linha = pontos
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${linha} L${largura},${altura} L0,${altura} Z`;

  return (
    <svg
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path d={area} fill={cor} opacity={0.12} />
      <path
        d={linha}
        fill="none"
        stroke={cor}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
