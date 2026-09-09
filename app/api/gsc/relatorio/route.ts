import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getReport, GscError } from '@/lib/gsc'
import { buildRange, previousRange, lastAvailableDate, type RangeKind } from '@/lib/gsc-core'

/** Data civil de hoje no fuso do relatório do Search Console. */
function hojeNoFusoDoRelatorio(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

/**
 * Indicadores da propriedade. Totais saem de consulta sem dimensão; as
 * tabelas são principais resultados, porque a API não devolve todas as linhas.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propriedade')
  if (!propertyId) return NextResponse.json({ error: 'Selecione a propriedade.' }, { status: 400 })

  const kind = (searchParams.get('periodo') ?? '28d') as RangeKind
  const hoje = hojeNoFusoDoRelatorio()
  const range = buildRange(kind, hoje, {
    month: searchParams.get('mes') ?? undefined,
    year: searchParams.get('ano') ? Number(searchParams.get('ano')) : undefined,
    startDate: searchParams.get('de') ?? undefined,
    endDate: searchParams.get('ate') ?? undefined,
  })

  try {
    const { report, cached, fetchedAt } = await getReport(
      propertyId,
      range,
      previousRange(range),
      { force: searchParams.get('atualizar') === '1' },
    )
    return NextResponse.json({
      range,
      dataAvailableUntil: lastAvailableDate(hoje),
      timeZone: 'America/Los_Angeles',
      cached,
      fetchedAt,
      report,
    })
  } catch (err) {
    const msg = err instanceof GscError ? err.message : 'Não foi possível consultar o Search Console.'
    // 502: falha de integração, nunca indicador zerado
    return NextResponse.json({ error: msg }, { status: err instanceof GscError ? 409 : 502 })
  }
}
