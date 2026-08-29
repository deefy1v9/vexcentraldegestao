import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { isAliquotaIssValid, ALIQUOTA_ISS_MIN, ALIQUOTA_ISS_MAX } from '@/lib/billing-core'
import { Prisma } from '@prisma/client'

/**
 * Alíquota efetiva do ISS por competência.
 *
 * No Simples Nacional a alíquota varia mês a mês conforme o faturamento
 * (2% a 5%). O sistema nunca presume um valor: sem registro da competência,
 * a emissão da NFS-e fica bloqueada.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const rows = await prisma.fiscalAliquota.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 36,
  })
  return NextResponse.json({
    aliquotas: rows.map((a) => ({ ...a, aliquotaIss: Number(a.aliquotaIss) })),
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const year = Number(body.year)
  const month = Number(body.month)
  const value = body.aliquotaIss

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'Ano inválido.' }, { status: 400 })
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Mês inválido.' }, { status: 400 })
  }
  if (!isAliquotaIssValid(value)) {
    return NextResponse.json(
      { error: `Alíquota efetiva do ISS deve ficar entre ${ALIQUOTA_ISS_MIN}% e ${ALIQUOTA_ISS_MAX}%.` },
      { status: 400 },
    )
  }

  const dec = new Prisma.Decimal(String(Number(value)))
  const note = body.note ? String(body.note).slice(0, 200) : null

  const row = await prisma.fiscalAliquota.upsert({
    where: { year_month: { year, month } },
    update: { aliquotaIss: dec, note },
    create: { year, month, aliquotaIss: dec, note },
  })

  await logActivity(
    admin.id,
    `definiu alíquota do ISS ${Number(value)}% para ${String(month).padStart(2, '0')}/${year}`,
    'Financeiro',
    'FiscalAliquota',
  )
  return NextResponse.json({ aliquota: { ...row, aliquotaIss: Number(row.aliquotaIss) } })
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return NextResponse.json({ error: 'Competência inválida.' }, { status: 400 })
  }

  await prisma.fiscalAliquota.deleteMany({ where: { year, month } })
  await logActivity(
    admin.id,
    `removeu a alíquota do ISS de ${String(month).padStart(2, '0')}/${year}`,
    'Financeiro',
    'FiscalAliquota',
  )
  return NextResponse.json({ ok: true })
}
