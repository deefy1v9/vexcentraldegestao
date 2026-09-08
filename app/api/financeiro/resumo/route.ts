import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getMonthSummary } from '@/lib/finance-summary'

/**
 * Resumo financeiro da competência — a mesma fonte usada pelo Dashboard.
 * Tudo em centavos; a formatação é do frontend.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const month = Number(searchParams.get('month') || now.getMonth() + 1)
  const year = Number(searchParams.get('year') || now.getFullYear())
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  }
  return NextResponse.json(await getMonthSummary(year, month))
}
