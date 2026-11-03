import type { RangeKind } from '@/lib/gsc-core'

/** Períodos do relatório, iguais no Search Console e no Analytics. */
export const PERIODOS: Array<{ valor: RangeKind; rotulo: string }> = [
  { valor: '28d', rotulo: '28 dias' },
  { valor: 'mes', rotulo: 'Mensal' },
  { valor: 'ano', rotulo: 'Anual' },
  { valor: 'custom', rotulo: 'Período' },
]
