'use client'

import { MetricChart } from '@/components/vex/metric-chart'
import { formatCurrency } from '@/lib/utils'

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const SERIES = [
  { chave: 'recebido', nome: 'Recebido', cor: 'var(--grafico-1)' },
  { chave: 'despesas', nome: 'Despesas', cor: 'var(--grafico-2)' },
] as const

/**
 * Recebido × despesas por mês, só dos meses que têm movimento: dez meses
 * zerados antes do primeiro cliente não dizem nada e achatam o gráfico.
 */
export default function GraficoMeses({ pontos }: { pontos: Array<{ data: string; recebido: number; despesas: number }> }) {
  if (pontos.length < 2) {
    return (
      <p className="t-corpo text-muted-foreground py-16 text-center">
        {pontos.length === 0 ? 'Sem movimento registrado ainda.' : 'O gráfico aparece a partir do segundo mês com movimento.'}
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {SERIES.map((s) => (
          <span key={s.chave} className="t-rotulo text-muted-foreground inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.cor }} /> {s.nome}
          </span>
        ))}
      </div>
      {/* O gráfico ocupa o contêiner inteiro (absolute): a altura vem daqui */}
      <div className="relative h-[240px]">
        <MetricChart
          view="curve"
          defaultIndex={pontos.length - 1}
          valueFormatter={(n) => formatCurrency(n)}
          dateFormatter={(d) => { const [y, m] = d.split('-').map(Number); return `${MES[m - 1]}/${String(y).slice(2)}` }}
          series={SERIES.map((s) => ({ name: s.nome, color: s.cor, data: pontos.map((p) => ({ date: p.data, value: p[s.chave] })) }))}
        />
      </div>
    </div>
  )
}
