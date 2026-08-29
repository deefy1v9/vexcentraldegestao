import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/**
 * Catálogo de serviços para a proposta — montado a partir dos serviços REAIS
 * já cadastrados nos clientes (não existe tabela de catálogo separada e não
 * faria sentido criar dados fictícios). Cada entrada traz os padrões
 * comerciais do cadastro mais recente com aquele nome.
 *
 * `clientId` opcional: primeiro os serviços do próprio cliente.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')

  const services = await prisma.clientService.findMany({
    where: { status: 'ATIVO' },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, clientId: true, serviceName: true, description: true, monthlyValue: true,
      contractDuration: true, totalContractValue: true,
      proposalDescription: true, defaultScope: true, defaultDeliverables: true,
      defaultMonthlyCents: true, defaultSetupCents: true, defaultMonths: true, billingKind: true,
    },
  })

  // Uma entrada por nome de serviço: vence o cadastro mais recente
  const byName = new Map<string, (typeof services)[number]>()
  for (const s of services) {
    const key = s.serviceName.trim().toLowerCase()
    if (!byName.has(key)) byName.set(key, s)
  }

  const catalog = [...byName.values()].map((s) => ({
    key: s.serviceName.trim().toLowerCase(),
    name: s.serviceName,
    description: s.proposalDescription || s.description || null,
    scope: s.defaultScope || null,
    deliverables: s.defaultDeliverables ?? [],
    monthlyCents: s.defaultMonthlyCents ?? (s.monthlyValue != null ? Math.round(s.monthlyValue * 100) : 0),
    setupCents: s.defaultSetupCents ?? 0,
    months: s.defaultMonths ?? s.contractDuration ?? 0,
    periodicity: s.billingKind === 'UNICO' ? 'UNICO' : 'MENSAL',
  })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  // Serviços do cliente selecionado, com os valores que ele já paga hoje
  const clientServices = clientId
    ? services
        .filter((s) => s.clientId === clientId)
        .map((s) => ({
          serviceId: s.id,
          name: s.serviceName,
          description: s.proposalDescription || s.description || null,
          scope: s.defaultScope || null,
          deliverables: s.defaultDeliverables ?? [],
          monthlyCents: s.defaultMonthlyCents ?? (s.monthlyValue != null ? Math.round(s.monthlyValue * 100) : 0),
          setupCents: s.defaultSetupCents ?? 0,
          months: s.defaultMonths ?? s.contractDuration ?? 0,
          periodicity: s.billingKind === 'UNICO' ? 'UNICO' : 'MENSAL',
        }))
    : []

  return NextResponse.json({ catalog, clientServices })
}
