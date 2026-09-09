import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getGaReport } from '@/lib/ga'
import { GscError } from '@/lib/gsc'
import { buildRange, previousRange, isTrafficFilter, type RangeKind, type TrafficFilter } from '@/lib/ga-core'

/** Hoje no fuso da propriedade — o GA4 fecha o dia pelo fuso configurado. */
function hojeNaPropriedade(timeZone: string | null): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: timeZone ?? 'America/Sao_Paulo' })
  } catch {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  }
}

/**
 * Indicadores do Analytics. Totais saem de consulta do intervalo inteiro:
 * usuário único não se soma entre dias.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('propriedade')
  if (!id) return NextResponse.json({ error: 'Selecione a propriedade.' }, { status: 400 })

  const vinculo = await prisma.gaProperty.findUnique({ where: { id }, select: { timeZone: true } })
  if (!vinculo) return NextResponse.json({ error: 'Propriedade do Analytics não vinculada.' }, { status: 409 })

  const filtroBruto = searchParams.get('trafego') ?? 'organico'
  const filtro: TrafficFilter = isTrafficFilter(filtroBruto) ? filtroBruto : 'organico'
  const hoje = hojeNaPropriedade(vinculo.timeZone)
  const range = buildRange((searchParams.get('periodo') ?? '28d') as RangeKind, hoje, {
    month: searchParams.get('mes') ?? undefined,
    year: searchParams.get('ano') ? Number(searchParams.get('ano')) : undefined,
    startDate: searchParams.get('de') ?? undefined,
    endDate: searchParams.get('ate') ?? undefined,
  })

  try {
    const { report, cached, fetchedAt, timeZone } = await getGaReport(
      id, range, previousRange(range), filtro,
      { force: searchParams.get('atualizar') === '1' },
    )
    return NextResponse.json({ range, filtro, timeZone, hoje, cached, fetchedAt, report })
  } catch (err) {
    // Erro de integração é 409/502 — nunca indicador zerado
    const msg = err instanceof GscError ? err.message : 'Não foi possível consultar o Analytics.'
    return NextResponse.json({ error: msg }, { status: err instanceof GscError ? 409 : 502 })
  }
}
