import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getConnection, missingCredentials, defaultRedirectUri, getCredentials } from '@/lib/gsc'
import { propertyLabel, isDomainProperty } from '@/lib/gsc-core'

/**
 * Situação da integração: credenciais, conexão e propriedades vinculadas.
 * Nenhum token sai daqui — só o que a tela precisa mostrar.
 */
export async function GET() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const faltando = await missingCredentials()
  const cred = await getCredentials()
  const connection = await getConnection()

  const properties = connection
    ? await prisma.gscProperty.findMany({
        where: { connectionId: connection.id },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      })
    : []

  return NextResponse.json({
    configured: faltando.length === 0,
    missingEnv: faltando,
    redirectUri: cred?.redirectUri ?? defaultRedirectUri(),
    connection: connection && {
      id: connection.id,
      googleEmail: connection.googleEmail,
      status: connection.status,
      lastError: connection.lastError,
      lastSyncAt: connection.lastSyncAt,
      connectedAt: connection.createdAt,
    },
    properties: properties.map((p) => ({
      id: p.id,
      siteUrl: p.siteUrl,
      label: p.label ?? propertyLabel(p.siteUrl),
      isDomain: isDomainProperty(p.siteUrl),
      permissionLevel: p.permissionLevel,
      isVexSite: p.isVexSite,
      client: p.client,
    })),
  })
}
