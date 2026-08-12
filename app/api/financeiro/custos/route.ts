import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { materializeMonth, periodIndex } from '@/lib/financeiro'

const FREQUENCIES = ['MENSAL', 'TRIMESTRAL', 'ANUAL']

/**
 * Cadastro de custos.
 * - ÚNICO: cria um FinancialEntry no mês da data de vencimento.
 * - RECORRENTE: cria um RecurringCost (template) e materializa o mês inicial;
 *   os demais períodos são materializados quando o mês é visualizado.
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => ({}))
  const amount = Number(body.amount)
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: 'Nome do custo é obrigatório' }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'Valor deve ser maior ou igual a zero' }, { status: 400 })
  }
  const category = body.category ? String(body.category) : 'Outros'
  const name = String(body.name).trim()
  const description = body.description ? String(body.description) : name

  if (body.recurrenceType === 'RECORRENTE') {
    const frequency = FREQUENCIES.includes(body.frequency) ? body.frequency : 'MENSAL'
    if (!body.startDate) {
      return NextResponse.json({ error: 'Data de início é obrigatória para custo recorrente' }, { status: 400 })
    }
    const startDate = new Date(body.startDate)
    const endDate = body.endDate ? new Date(body.endDate) : null
    const dueDay = Math.min(Math.max(Number(body.dueDay) || startDate.getDate(), 1), 31)

    const cost = await prisma.recurringCost.create({
      data: { name, description, category, amount, frequency, startDate, endDate, dueDay },
    })
    // materializa o mês de início imediatamente
    await materializeMonth(startDate.getFullYear(), startDate.getMonth() + 1)

    await logActivity(user.id, 'cadastrou custo recorrente', 'Financeiro', name)
    return NextResponse.json(cost, { status: 201 })
  }

  // Custo único
  if (!body.dueDate) {
    return NextResponse.json({ error: 'Data de vencimento é obrigatória' }, { status: 400 })
  }
  const dueDate = new Date(body.dueDate)
  const paid = body.status === 'PAGO'

  const entry = await prisma.financialEntry.create({
    data: {
      type: 'CUSTO',
      category,
      name,
      description,
      amount,
      date: dueDate,
      dueDate,
      month: dueDate.getMonth() + 1,
      year: dueDate.getFullYear(),
      status: paid ? 'PAGO' : 'PENDENTE',
      paidAt: paid ? (body.paidAt ? new Date(body.paidAt) : new Date()) : null,
      isPaid: paid,
      recurring: false,
    },
  })

  await logActivity(user.id, 'cadastrou custo', 'Financeiro', name)
  return NextResponse.json(entry, { status: 201 })
}

/**
 * Edição de um lançamento de custo.
 * scope 'only': altera apenas esta ocorrência.
 * scope 'future': altera esta ocorrência (se não paga) e o template — os
 * próximos períodos pendentes são recriados com os novos valores. Ocorrências
 * passadas e pagas nunca são alteradas automaticamente.
 * Também usada para marcar pago/pendente via { status, paidAt }.
 */
export async function PUT(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => ({}))
  const entryId = body.entryId ? String(body.entryId) : null
  if (!entryId) return NextResponse.json({ error: 'entryId obrigatório' }, { status: 400 })

  const entry = await prisma.financialEntry.findUnique({ where: { id: entryId } })
  if (!entry || entry.type === 'SALARIO') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const data: Record<string, unknown> = {}
  if (has('name')) data.name = String(body.name)
  if (has('description')) data.description = String(body.description)
  if (has('category')) data.category = String(body.category)
  if (has('amount')) {
    const v = Number(body.amount)
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: 'Valor deve ser maior ou igual a zero' }, { status: 400 })
    }
    data.amount = v
  }
  if (has('dueDate') && body.dueDate) {
    const d = new Date(body.dueDate)
    data.dueDate = d
    data.date = d
    data.month = d.getMonth() + 1
    data.year = d.getFullYear()
  }
  if (has('status')) {
    const paid = body.status === 'PAGO'
    data.status = paid ? 'PAGO' : 'PENDENTE'
    data.isPaid = paid
    data.paidAt = paid ? (body.paidAt ? new Date(body.paidAt) : new Date()) : null
  }

  const updated = await prisma.financialEntry.update({ where: { id: entryId }, data })

  // Propaga para os próximos períodos da recorrência
  if (body.scope === 'future' && entry.recurringCostId && entry.year != null && entry.month != null) {
    const tpl: Record<string, unknown> = {}
    if (has('name')) tpl.name = data.name
    if (has('description')) tpl.description = data.description
    if (has('category')) tpl.category = data.category
    if (has('amount')) tpl.amount = data.amount
    if (Object.keys(tpl).length > 0) {
      await prisma.recurringCost.update({ where: { id: entry.recurringCostId }, data: tpl })
      // Períodos futuros ainda pendentes são recriados na próxima visualização
      await prisma.financialEntry.deleteMany({
        where: {
          recurringCostId: entry.recurringCostId,
          status: 'PENDENTE',
          OR: [
            { year: { gt: entry.year } },
            { year: entry.year, month: { gt: entry.month } },
          ],
        },
      })
    }
  }

  await logActivity(user.id, 'atualizou custo', 'Financeiro', updated.name || updated.description)
  return NextResponse.json(updated)
}

/**
 * Exclusão de custo.
 * scope 'only': ocorrência recorrente vira lápide CANCELADO (não volta a ser
 * materializada); custo único é apagado de verdade.
 * scope 'future': encerra a recorrência no período anterior e remove este e
 * os próximos lançamentos pendentes. Pagos permanecem como histórico.
 */
export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { searchParams } = new URL(req.url)
  const entryId = searchParams.get('entryId')
  const scope = searchParams.get('scope') || 'only'
  if (!entryId) return NextResponse.json({ error: 'entryId obrigatório' }, { status: 400 })

  const entry = await prisma.financialEntry.findUnique({ where: { id: entryId } })
  if (!entry || entry.type === 'SALARIO') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (entry.recurringCostId && entry.year != null && entry.month != null) {
    if (scope === 'future') {
      // Encerra o template no mês anterior ao desta ocorrência
      const prevIdx = periodIndex(entry.year, entry.month) - 1
      const prevYear = Math.floor(prevIdx / 12)
      const prevMonth = (prevIdx % 12) + 1
      await prisma.recurringCost.update({
        where: { id: entry.recurringCostId },
        data: { endDate: new Date(prevYear, prevMonth - 1, 28) },
      })
      await prisma.financialEntry.deleteMany({
        where: {
          recurringCostId: entry.recurringCostId,
          status: { in: ['PENDENTE', 'CANCELADO'] },
          OR: [
            { year: { gt: entry.year } },
            { year: entry.year, month: { gte: entry.month } },
          ],
        },
      })
    } else {
      // Lápide: mantém a linha para o período não ser re-materializado
      await prisma.financialEntry.update({
        where: { id: entryId },
        data: { status: 'CANCELADO', isPaid: false, paidAt: null },
      })
    }
  } else {
    await prisma.financialEntry.delete({ where: { id: entryId } })
  }

  await logActivity(user.id, 'removeu custo', 'Financeiro', entry.name || entry.description)
  return NextResponse.json({ ok: true })
}
