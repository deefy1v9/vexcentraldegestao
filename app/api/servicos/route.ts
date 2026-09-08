import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { catalogWithStats, catalogDataFromBody, ensureCatalogFromExisting } from '@/lib/services-catalog'

/**
 * Catálogo de serviços da VEX (admin).
 * GET  — lista com clientes ativos e receita recorrente por serviço.
 * POST — cadastra serviço. Valores em centavos.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  // Migração suave: serviços já cadastrados nos clientes entram no catálogo
  await ensureCatalogFromExisting()
  const catalog = await catalogWithStats()
  return NextResponse.json({ catalog })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const data = catalogDataFromBody(body)
  const name = String(data.name ?? '')
  if (!name) return NextResponse.json({ error: 'Informe o nome do serviço.' }, { status: 400 })

  const min = data.minCents as number | null | undefined
  const max = data.maxCents as number | null | undefined
  if (min != null && max != null && max < min) {
    return NextResponse.json({ error: 'O valor máximo não pode ser menor que o mínimo.' }, { status: 400 })
  }

  const dup = await prisma.serviceCatalog.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
  if (dup) return NextResponse.json({ error: 'Já existe um serviço com este nome no catálogo.' }, { status: 409 })

  const created = await prisma.serviceCatalog.create({
    data: { ...(data as object), name, deliverables: (data.deliverables as string[]) ?? [], exclusions: (data.exclusions as string[]) ?? [] },
  })
  await logActivity(admin.id, 'cadastrou serviço no catálogo', 'Serviços', created.name)
  return NextResponse.json({ service: created }, { status: 201 })
}
