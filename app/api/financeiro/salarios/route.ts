import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { materializeMonth, activeSalaryContract, periodIndex } from '@/lib/financeiro'

/**
 * Cadastro de salário (recorrente mensal por padrão).
 * Um colaborador tem no máximo um contrato vigente por período — tentar
 * cadastrar outro para o mesmo mês devolve 409 em vez de duplicar.
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => ({}))
  const userId = body.userId ? String(body.userId) : null
  const amount = Number(body.amount)
  const startYear = Number(body.startYear)
  const startMonth = Number(body.startMonth)

  if (!userId) return NextResponse.json({ error: 'Selecione um colaborador' }, { status: 400 })
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'Valor deve ser maior ou igual a zero' }, { status: 400 })
  }
  if (!Number.isInteger(startYear) || !Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    return NextResponse.json({ error: 'Mês inicial inválido' }, { status: 400 })
  }

  const employee = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, isActive: true } })
  if (!employee) return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
  if (!employee.isActive) return NextResponse.json({ error: 'Colaborador inativo' }, { status: 400 })

  // Proteção contra duplicidade: já existe contrato cobrindo o mês inicial?
  const existing = await activeSalaryContract(userId, startYear, startMonth)
  if (existing) {
    return NextResponse.json(
      { error: `${employee.name} já tem salário vigente neste período. Edite o salário existente.` },
      { status: 409 },
    )
  }

  const payDay = Math.min(Math.max(Number(body.payDay) || 5, 1), 31)
  let endYear: number | null = null
  let endMonth: number | null = null
  if (body.endDate) {
    const end = new Date(body.endDate)
    endYear = end.getFullYear()
    endMonth = end.getMonth() + 1
  }

  const contract = await prisma.salaryContract.create({
    data: {
      userId, amount, payDay, startYear, startMonth, endYear, endMonth,
      notes: body.notes ? String(body.notes) : null,
    },
  })

  await materializeMonth(startYear, startMonth)

  // Status inicial do mês de partida, se solicitado como pago
  if (body.status === 'PAGO') {
    await prisma.financialEntry.updateMany({
      where: { salaryContractId: contract.id, year: startYear, month: startMonth },
      data: { status: 'PAGO', isPaid: true, paidAt: new Date() },
    })
  }

  await logActivity(user.id, 'cadastrou salário', 'Financeiro', employee.name)
  return NextResponse.json(contract, { status: 201 })
}

/**
 * Alteração de salário.
 * scope 'only'  — altera apenas o lançamento deste mês.
 * scope 'future' — preserva o histórico: encerra o contrato vigente no mês
 * anterior e abre um novo contrato a partir deste mês com o novo valor.
 * Também marca pago/pendente via { status, paidAt, amount pago }.
 */
export async function PUT(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => ({}))
  const entryId = body.entryId ? String(body.entryId) : null
  if (!entryId) return NextResponse.json({ error: 'entryId obrigatório' }, { status: 400 })

  const entry = await prisma.financialEntry.findUnique({
    where: { id: entryId },
    include: { salaryContract: true },
  })
  if (!entry || entry.type !== 'SALARIO' || !entry.salaryContract || entry.year == null || entry.month == null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const data: Record<string, unknown> = {}
  if (has('amount')) {
    const v = Number(body.amount)
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: 'Valor deve ser maior ou igual a zero' }, { status: 400 })
    }
    data.amount = v
  }
  if (has('status')) {
    const paid = body.status === 'PAGO'
    data.status = paid ? 'PAGO' : 'PENDENTE'
    data.isPaid = paid
    // Registro do pagamento: data + valor efetivamente pago (amount acima)
    data.paidAt = paid ? (body.paidAt ? new Date(body.paidAt) : new Date()) : null
  }
  if (has('notes')) data.description = String(body.notes)

  const updated = await prisma.financialEntry.update({ where: { id: entryId }, data })

  if (body.scope === 'future' && has('amount')) {
    const contract = entry.salaryContract
    const thisIdx = periodIndex(entry.year, entry.month)
    const prevIdx = thisIdx - 1

    // Encerra o contrato vigente no mês anterior (histórico preservado)…
    if (periodIndex(contract.startYear, contract.startMonth) >= thisIdx) {
      // contrato começa neste mês (ou depois): basta atualizar o valor
      await prisma.salaryContract.update({
        where: { id: contract.id },
        data: { amount: Number(body.amount) },
      })
    } else {
      await prisma.salaryContract.update({
        where: { id: contract.id },
        data: { endYear: Math.floor(prevIdx / 12), endMonth: (prevIdx % 12) + 1 },
      })
      // …e abre um novo a partir deste mês com o novo valor
      const fresh = await prisma.salaryContract.create({
        data: {
          userId: contract.userId,
          amount: Number(body.amount),
          payDay: contract.payDay,
          startYear: entry.year,
          startMonth: entry.month,
          endYear: contract.endYear,
          endMonth: contract.endMonth,
          notes: contract.notes,
        },
      })
      // Este mês passa a apontar para o novo contrato; futuros pendentes do
      // contrato antigo saem para serem re-materializados pelo novo
      await prisma.financialEntry.update({
        where: { id: entryId },
        data: { salaryContractId: fresh.id },
      })
    }
    await prisma.financialEntry.deleteMany({
      where: {
        salaryContractId: contract.id,
        status: 'PENDENTE',
        OR: [
          { year: { gt: entry.year } },
          { year: entry.year, month: { gt: entry.month } },
        ],
      },
    })
  }

  await logActivity(user.id, 'atualizou salário', 'Financeiro', updated.name || 'salário')
  return NextResponse.json(updated)
}

/**
 * Interrompe os próximos salários de um contrato (a partir do mês do
 * lançamento indicado). O histórico já materializado é preservado.
 */
export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { searchParams } = new URL(req.url)
  const entryId = searchParams.get('entryId')
  if (!entryId) return NextResponse.json({ error: 'entryId obrigatório' }, { status: 400 })

  const entry = await prisma.financialEntry.findUnique({
    where: { id: entryId },
    include: { salaryContract: true },
  })
  if (!entry || entry.type !== 'SALARIO' || !entry.salaryContract || entry.year == null || entry.month == null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const prevIdx = periodIndex(entry.year, entry.month) - 1
  await prisma.salaryContract.update({
    where: { id: entry.salaryContract.id },
    data: { endYear: Math.floor(prevIdx / 12), endMonth: (prevIdx % 12) + 1 },
  })
  await prisma.financialEntry.deleteMany({
    where: {
      salaryContractId: entry.salaryContract.id,
      status: 'PENDENTE',
      OR: [
        { year: { gt: entry.year } },
        { year: entry.year, month: { gte: entry.month } },
      ],
    },
  })

  await logActivity(user.id, 'encerrou salário', 'Financeiro', entry.name || 'salário')
  return NextResponse.json({ ok: true })
}
