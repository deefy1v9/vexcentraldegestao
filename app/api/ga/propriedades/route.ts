import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getConnection, GscError } from '@/lib/gsc'
import { listProperties, getPropertyMetadata } from '@/lib/ga'
import { GA_SCOPE, hasScope, normalizePropertyId, isMeasurementId } from '@/lib/ga-core'
import { logActivity } from '@/lib/activity'

/** Contas e propriedades do GA4 visíveis à conta conectada, com paginação. */
export async function GET() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const connection = await getConnection()
  if (!connection) return NextResponse.json({ error: 'Nenhuma conta do Google conectada.' }, { status: 409 })
  if (!hasScope(connection.scope, GA_SCOPE)) {
    return NextResponse.json(
      { error: 'A conexão atual não tem permissão de leitura do Analytics.', needsScope: true },
      { status: 403 },
    )
  }

  try {
    const propriedades = await listProperties(connection.id)
    const vinculadas = await prisma.gaProperty.findMany({
      where: { connectionId: connection.id },
      select: { propertyId: true },
    })
    const jaVinculada = new Set(vinculadas.map((v) => v.propertyId))
    return NextResponse.json({
      googleEmail: connection.googleEmail,
      properties: propriedades.map((p) => ({ ...p, linked: jaVinculada.has(p.propertyId) })),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof GscError ? err.message : 'Não foi possível listar as propriedades.' },
      { status: 502 },
    )
  }
}

/** Vincula a propriedade a um cliente ou ao site da VEX. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const connection = await getConnection()
  if (!connection) return NextResponse.json({ error: 'Conecte uma conta do Google antes.' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const bruto = String(body.propertyId ?? '')
  if (isMeasurementId(bruto)) {
    return NextResponse.json(
      { error: 'Isso é um ID de medição (G-...). O relatório precisa do ID numérico da propriedade.' },
      { status: 400 },
    )
  }
  const propertyId = normalizePropertyId(bruto)
  if (!propertyId) return NextResponse.json({ error: 'ID de propriedade inválido.' }, { status: 400 })

  // Só vincula o que a conta realmente enxerga — nunca por semelhança de nome
  let disponivel
  try {
    disponivel = (await listProperties(connection.id)).find((p) => p.propertyId === propertyId)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof GscError ? err.message : 'Falha ao validar a propriedade.' },
      { status: 502 },
    )
  }
  if (!disponivel) {
    return NextResponse.json({ error: 'A conta conectada não tem acesso a esta propriedade do Analytics.' }, { status: 403 })
  }

  const isVexSite = body.isVexSite === true
  const clientId = !isVexSite && body.clientId ? String(body.clientId) : null
  if (clientId) {
    const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
    if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  }
  if (!isVexSite && !clientId) {
    return NextResponse.json({ error: 'Escolha o cliente ou marque como site da VEX.' }, { status: 400 })
  }

  let meta: { displayName: string; timeZone: string | null; currencyCode: string | null }
  try {
    meta = await getPropertyMetadata(connection.id, propertyId)
  } catch {
    meta = { displayName: disponivel.displayName, timeZone: null, currencyCode: null }
  }

  const dados = {
    displayName: meta.displayName || disponivel.displayName,
    accountName: disponivel.accountName,
    accountId: disponivel.accountId,
    timeZone: meta.timeZone,
    currencyCode: meta.currencyCode,
    clientId,
    isVexSite,
  }
  const property = await prisma.gaProperty.upsert({
    where: { connectionId_propertyId: { connectionId: connection.id, propertyId } },
    create: { connectionId: connection.id, propertyId, ...dados },
    update: dados,
  })

  await logActivity(admin.id, 'vinculou propriedade do Analytics', 'SEO', `${dados.displayName} (${propertyId})`)
  return NextResponse.json({ id: property.id, propertyId, timeZone: property.timeZone }, { status: 201 })
}

/**
 * Desvincula a propriedade do Analytics. A autorização do Google continua,
 * porque é compartilhada com o Search Console.
 */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const property = await prisma.gaProperty.findUnique({ where: { id } })
  if (!property) return NextResponse.json({ error: 'Propriedade não encontrada.' }, { status: 404 })

  await prisma.gaProperty.delete({ where: { id } })
  await logActivity(admin.id, 'desvinculou propriedade do Analytics', 'SEO', property.displayName)
  return NextResponse.json({ ok: true, autorizacaoPreservada: true })
}
