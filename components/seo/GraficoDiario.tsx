import { formatCount } from '@/lib/gsc-core'

/** Topo "redondo" do eixo: 37 → 40, 230 → 250, 1.840 → 2.000. */
function topoDoEixo(max: number): number {
  // Abaixo de 4 a grade de 5 linhas repetiria números (0, 1, 1, 1…)
  if (max <= 4) return 4
  const ordem = Math.pow(10, Math.floor(Math.log10(max)))
  const passo = [1, 2, 2.5, 5, 10].find((p) => p * ordem >= max) ?? 10
  return passo * ordem
}

/**
 * Barras por dia no padrão Vireo: legenda com a métrica, eixo Y com a
 * escala e grade leve, datas no eixo X. A cor é a da marca (seleção/marca),
 * porque é o único dado do gráfico.
 */
export default function GraficoDiario({
  pontos, metrica, unidade,
}: {
  pontos: Array<{ chave: string; rotulo: string; valor: number; dica: string }>
  /** Nome da métrica na legenda ("Cliques"). */
  metrica: string
  /** Unidade do eixo, para leitor de tela ("cliques por dia"). */
  unidade: string
}) {
  if (pontos.length === 0) return null
  const topo = topoDoEixo(Math.max(...pontos.map((p) => p.valor), 0))
  const marcas = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(topo * f))
  const meio = Math.floor(pontos.length / 2)

  return (
    <figure aria-label={`${metrica}: ${unidade}`}>
      <figcaption className="flex items-center gap-4 mb-4">
        <span className="inline-flex items-center gap-1.5 t-rotulo text-foreground"><span className="w-2.5 h-2.5 rounded-sm bg-marca" /> {metrica}</span>
        <span className="t-legenda">Eixo: {unidade}</span>
      </figcaption>
      <div className="flex gap-2">
        {/* Eixo Y */}
        <div className="relative w-10 shrink-0 h-44">
          {marcas.map((m, i) => (
            <span key={i} className="absolute right-0 -translate-y-1/2 text-[10.5px] font-mono text-muted-foreground tabular" style={{ top: `${(i / (marcas.length - 1)) * 100}%` }}>
              {formatCount(m)}
            </span>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-44">
            {/* Grade */}
            {marcas.map((_, i) => (
              <span key={i} aria-hidden className="absolute inset-x-0 border-t border-border" style={{ top: `${(i / (marcas.length - 1)) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[3px] overflow-x-auto">
              {pontos.map((p) => (
                <div
                  key={p.chave}
                  title={p.dica}
                  className="flex-1 min-w-[3px] bg-marca/85 rounded-t-[3px] hover:bg-marca transition-colors"
                  style={{ height: `${Math.max(1, (p.valor / topo) * 100)}%` }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-between text-[10.5px] font-mono text-muted-foreground mt-2 tabular">
            <span>{pontos[0]?.rotulo}</span>
            {pontos.length > 2 && <span>{pontos[meio]?.rotulo}</span>}
            <span>{pontos[pontos.length - 1]?.rotulo}</span>
          </div>
        </div>
      </div>
    </figure>
  )
}
