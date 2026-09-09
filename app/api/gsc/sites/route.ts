import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getConnection, listSites, GscError } from '@/lib/gsc'
import { propertyLabel, isDomainProperty, canRead, PERMISSION_LABEL } from '@/lib/gsc-core'

/** Propriedades que a conta autorizada enxerga (sites.list). */
export async function GET() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const connection = await getConnection()
  if (!connection) return NextResponse.json({ error: 'Nenhuma conta do Google conectada.' }, { status: 409 })

  try {
    const sites = await listSites(connection.id)
    const vinculadas = await prisma.gscProperty.findMany({
      where: { connectionId: connection.id },
      select: { siteUrl: true },
    })
    const jaVinculada = new Set(vinculadas.map((v) => v.siteUrl))

    return NextResponse.json({
      googleEmail: connection.googleEmail,
      sites: sites.map((s) => ({
        siteUrl: s.siteUrl,
        label: propertyLabel(s.siteUrl),
        isDomain: isDomainProperty(s.siteUrl),
        permissionLevel: s.permissionLevel,
        permissionLabel: s.permissionLevel ? (PERMISSION_LABEL[s.permissionLevel] ?? s.permissionLevel) : null,
        canRead: canRead(s.permissionLevel),
        linked: jaVinculada.has(s.siteUrl),
      })),
    })
  } catch (err) {
    const msg = err instanceof GscError ? err.message : 'Não foi possível listar as propriedades.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
