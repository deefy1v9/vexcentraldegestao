import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { cashTotals, parseAmountCents, validateMovement, withdrawalsByPartner } from '@/lib/caixa-core'

/** Caixa da empresa — leitura e lançamento. Só administradores. */

const SELECT = {
  id: true, kind: true, amountCents: true, description: true, category: true, account: true,
  date: true, source: true, notes: true, createdAt: true,
  partner: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} as const

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const url = new URL(req.url)
  const mes = url.searchParams.get('mes') // AAAA-MM
  const where = mes && /^\d{4}-\d{2}$/.test(mes)
    ? { date: { gte: new Date(`${mes}-01T00:00:00Z`), lt: proximoMes(mes) } }
    : {}

  const [movimentos, todos, socios] = await Promise.all([
    prisma.cashMovement.findMany({ where, select: SELECT, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 300 }),
    // O saldo é da empresa inteira, não do mês filtrado
    prisma.cashMovement.findMany({ select: { kind: true, amountCents: true } }),
    prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  const doMes = movimentos.map((m) => ({ kind: m.kind, amountCents: m.amountCents, partnerName: m.partner?.name }))
  return NextResponse.json({
    movimentos,
    socios,
    saldoCents: cashTotals(todos).saldoCents,
    totaisDoPeriodo: cashTotals(doMes),
    retiradasPorSocio: withdrawalsByPartner(doMes),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const viewer = await getSessionUser()
  const body = await req.json()

  const amountCents = parseAmountCents(body.amountCents ?? body.valor)
  const kind = String(body.kind ?? '')
  const description = String(body.description ?? '').trim()
  const date = String(body.date ?? '').slice(0, 10) || hojeSP()
  const partnerId = body.partnerId ? String(body.partnerId) : null

  const erros = validateMovement({ kind, amountCents, description, date, partnerId })
  if (erros.length > 0) return NextResponse.json({ error: erros.join(' ') }, { status: 400 })

  const movimento = await prisma.cashMovement.create({
    data: {
      kind, amountCents: amountCents!, description,
      category: opt(body.category), account: opt(body.account), notes: opt(body.notes),
      date: new Date(`${date}T12:00:00Z`),
      partnerId, createdById: viewer?.id ?? null, source: 'MANUAL',
    },
    select: SELECT,
  })

  await logActivity(viewer?.id ?? '', 'lançou no caixa', 'Caixa', `${kind} ${description}`)
  return NextResponse.json({ movimento })
}

function opt(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s || null
}

function hojeSP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function proximoMes(mes: string): Date {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1))
}
