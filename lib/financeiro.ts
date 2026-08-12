import { prisma } from './prisma'

/**
 * Materialização de recorrências financeiras.
 *
 * Custos recorrentes e salários são modelos (RecurringCost/SalaryContract);
 * cada mês visualizado ganha ocorrências concretas em FinancialEntry. As
 * chaves únicas (recorrência, ano, mês) impedem duplicidade: materializar o
 * mesmo mês duas vezes não cria nada novo nem sobrescreve edições manuais,
 * pagamentos ou exclusões (lápides CANCELADO).
 */

/** Índice absoluto de um período (ano, mês 1-12) para comparações. */
export function periodIndex(year: number, month: number) {
  return year * 12 + (month - 1)
}

function dueDateFor(year: number, month: number, day: number) {
  const lastDay = new Date(year, month, 0).getDate()
  return new Date(year, month - 1, Math.min(day, lastDay))
}

/** Garante que o mês (year, month) tem todas as ocorrências recorrentes criadas. */
export async function materializeMonth(year: number, month: number) {
  const idx = periodIndex(year, month)

  // --- Custos recorrentes ---
  const costs = await prisma.recurringCost.findMany()
  const costRows = costs
    .filter((c) => {
      const start = periodIndex(c.startDate.getFullYear(), c.startDate.getMonth() + 1)
      if (idx < start) return false
      if (c.endDate) {
        const end = periodIndex(c.endDate.getFullYear(), c.endDate.getMonth() + 1)
        if (idx > end) return false
      }
      const step = c.frequency === 'ANUAL' ? 12 : c.frequency === 'TRIMESTRAL' ? 3 : 1
      return (idx - start) % step === 0
    })
    .map((c) => ({
      type: 'CUSTO',
      category: c.category,
      name: c.name,
      description: c.description ?? c.name,
      amount: c.amount,
      date: dueDateFor(year, month, c.dueDay),
      dueDate: dueDateFor(year, month, c.dueDay),
      month,
      year,
      status: 'PENDENTE',
      recurring: true,
      recurringCostId: c.id,
    }))

  if (costRows.length > 0) {
    // skipDuplicates: períodos já materializados (inclusive editados/pagos/
    // cancelados) não são tocados
    await prisma.financialEntry.createMany({ data: costRows, skipDuplicates: true })
  }

  // --- Salários ---
  const contracts = await prisma.salaryContract.findMany({
    include: { user: { select: { name: true, isActive: true } } },
  })
  const salaryRows = contracts
    .filter((s) => {
      if (!s.user.isActive) return false // inativado: não gera novos meses
      const start = periodIndex(s.startYear, s.startMonth)
      if (idx < start) return false
      if (s.endYear != null && s.endMonth != null && idx > periodIndex(s.endYear, s.endMonth)) return false
      return true
    })
    .map((s) => ({
      type: 'SALARIO',
      category: 'Salários',
      name: `Salário — ${s.user.name}`,
      description: s.notes ?? `Salário de ${s.user.name}`,
      amount: s.amount,
      date: dueDateFor(year, month, s.payDay),
      dueDate: dueDateFor(year, month, s.payDay),
      month,
      year,
      status: 'PENDENTE',
      recurring: true,
      userId: s.userId,
      salaryContractId: s.id,
    }))

  if (salaryRows.length > 0) {
    await prisma.financialEntry.createMany({ data: salaryRows, skipDuplicates: true })
  }
}

/** Contrato de salário vigente de um colaborador no período, se houver. */
export async function activeSalaryContract(userId: string, year: number, month: number) {
  const idx = periodIndex(year, month)
  const contracts = await prisma.salaryContract.findMany({ where: { userId } })
  return contracts.find((s) => {
    if (idx < periodIndex(s.startYear, s.startMonth)) return false
    if (s.endYear != null && s.endMonth != null && idx > periodIndex(s.endYear, s.endMonth)) return false
    return true
  }) ?? null
}
