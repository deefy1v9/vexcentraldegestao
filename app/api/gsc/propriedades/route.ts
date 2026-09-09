import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getConnection, listSites, GscError } from '@/lib/gsc'
import { propertyLabel, canRead } from '@/lib/gsc-core'
import { logActivity } from '@/lib/activity'

/**
 * Vincula uma propriedade do Search Console a um cliente ou ao site da VEX.
 * O identificador é validado contra o que o Google devolve para a conta —
 * não basta o frontend mandar uma string.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const connection = await getConnection()
  if (!connection) return NextResponse.json({ error: 'Conecte uma conta do Google antes.' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const siteUrl = String(body.siteUrl ?? '').trim()
  if (!siteUrl) return NextResponse.json({ error: 'Selecione a propriedade.' }, { status: 400 })

  let sites
  try {
    sites = await listSites(connection.id)
  } catch (err) {
    return NextResponse.json({ error: err instanceof GscError ? err.message : 'Falha ao validar a propriedade.' }, { status: 502 })
  }
  const site = sites.find((s) => s.siteUrl === siteUrl)
  if (!site) {
    return NextResponse.json(
      { error: 'A conta conectada não tem acesso a esta propriedade no Search Console.' },
      { status: 403 },
    )
  }
  if (!canRead(site.permissionLevel)) {
    return NextResponse.json(
      { error: 'A conta tem acesso não verificado nesta propriedade e não consegue ler relatórios.' },
      { status: 403 },
    )
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

  const property = await prisma.gscProperty.upsert({
    where: { connectionId_siteUrl: { connectionId: connection.id, siteUrl } },
    create: {
      connectionId: connection.id, siteUrl,
      permissionLevel: site.permissionLevel, clientId, isVexSite,
      label: body.label ? String(body.label).slice(0, 120) : propertyLabel(siteUrl),
    },
    update: {
      permissionLevel: site.permissionLevel, clientId, isVexSite,
      label: body.label ? String(body.label).slice(0, 120) : propertyLabel(siteUrl),
    },
  })

  await logActivity(admin.id, 'vinculou propriedade do Search Console', 'SEO', propertyLabel(siteUrl))
  return NextResponse.json({ id: property.id, siteUrl: property.siteUrl }, { status: 201 })
}

/** Desvincula a propriedade. A conta do Google continua conectada. */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const property = await prisma.gscProperty.findUnique({ where: { id } })
  if (!property) return NextResponse.json({ error: 'Propriedade não encontrada.' }, { status: 404 })

  await prisma.gscProperty.delete({ where: { id } })
  await logActivity(admin.id, 'desvinculou propriedade do Search Console', 'SEO', propertyLabel(property.siteUrl))
  return NextResponse.json({ ok: true })
}
