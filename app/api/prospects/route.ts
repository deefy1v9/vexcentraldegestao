import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { isValidDocument, maskDocument, onlyDigits, personTypeOf } from '@/lib/proposal-core'

/**
 * Prospects: interessados que ainda não são clientes.
 *
 * GET  ?document= — verifica se o documento já pertence a cliente ou prospect
 *                   (evita cadastro duplicado antes de digitar o resto).
 * POST            — cria o prospect. Criar prospect NÃO cria cliente.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { searchParams } = new URL(req.url)
  const document = onlyDigits(searchParams.get('document'))
  const search = (searchParams.get('q') ?? '').trim()

  if (document) {
    const [client, prospect] = await Promise.all([
      prisma.client.findFirst({ where: { cnpj: document }, select: { id: true, name: true } }),
      prisma.prospect.findUnique({ where: { document }, select: { id: true, name: true, convertedClientId: true } }),
    ])
    return NextResponse.json({
      valid: isValidDocument(document),
      client,
      prospect,
      exists: !!client || !!prospect,
    })
  }

  const prospects = await prisma.prospect.findMany({
    where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, name: true, tradeName: true, document: true, personType: true,
      email: true, phone: true, city: true, state: true, convertedClientId: true, createdAt: true,
      _count: { select: { proposals: true } },
    },
  })
  return NextResponse.json({
    // Documento mascarado na listagem — o completo só no detalhe da proposta
    prospects: prospects.map((p) => ({ ...p, document: maskDocument(p.document) })),
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const document = onlyDigits(body.document)
  const name = String(body.name ?? '').trim()

  if (!name) return NextResponse.json({ error: 'Informe o nome ou a razão social.' }, { status: 400 })
  if (!document) return NextResponse.json({ error: 'Informe o CPF ou CNPJ.' }, { status: 400 })
  if (!isValidDocument(document)) {
    return NextResponse.json({ error: 'CPF/CNPJ inválido — confira os dígitos.' }, { status: 400 })
  }

  const client = await prisma.client.findFirst({ where: { cnpj: document }, select: { id: true, name: true } })
  if (client) {
    return NextResponse.json(
      { error: 'Já existe um cliente com este documento.', clientId: client.id, clientName: client.name },
      { status: 409 },
    )
  }
  const existing = await prisma.prospect.findUnique({ where: { document }, select: { id: true, name: true } })
  if (existing) {
    return NextResponse.json(
      { error: 'Já existe um prospect com este documento.', prospectId: existing.id, prospectName: existing.name },
      { status: 409 },
    )
  }

  const str = (v: unknown, max = 200) => (v ? String(v).trim().slice(0, max) : null)
  const prospect = await prisma.prospect.create({
    data: {
      document,
      personType: personTypeOf(document),
      name: name.slice(0, 200),
      tradeName: str(body.tradeName),
      contactName: str(body.contactName),
      email: str(body.email),
      phone: onlyDigits(body.phone) || null,
      zipCode: onlyDigits(body.zipCode) || null,
      street: str(body.street),
      addressNumber: str(body.addressNumber, 20),
      complement: str(body.complement, 100),
      district: str(body.district, 120),
      city: str(body.city, 120),
      state: body.state ? String(body.state).trim().toUpperCase().slice(0, 2) : null,
      notes: str(body.notes, 2000),
      createdById: admin.id,
    },
    select: { id: true, name: true },
  })

  // Auditoria sem documento em claro
  await logActivity(admin.id, 'cadastrou prospect', 'Propostas', prospect.name)
  return NextResponse.json({ id: prospect.id, name: prospect.name }, { status: 201 })
}
