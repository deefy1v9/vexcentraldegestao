import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getSeries } from '@/lib/finance-summary'

/**
 * Série mensal (últimos 24 meses) para os gráficos: receita recebida,
 * prevista (recorrente × avulsa) e custos — mesma regra do resumo.
 * `total` mantém o contrato antigo do gráfico do dashboard (recebida em reais).
 */
export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const { series, hasData } = await getSeries(24)
  return NextResponse.json({
    hasData,
    series: series.map((p) => ({
      ...p,
      total: p.recebidaCents / 100,
    })),
  })
}
