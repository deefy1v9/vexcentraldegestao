import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getConnection } from '@/lib/gsc'
import { GA_SCOPE, hasScope } from '@/lib/ga-core'

/**
 * Situação do Analytics: se a conexão existente já tem o escopo de leitura e
 * quais propriedades estão vinculadas. Nenhum token sai daqui.
 */
export async function GET() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const connection = await getConnection()
  const properties = connection
    ? await prisma.gaProperty.findMany({
        where: { connectionId: connection.id },
        include: { client: { select: { id: true, name: true } }, mapping: true },
        orderBy: { createdAt: 'asc' },
      })
    : []

  return NextResponse.json({
    connected: !!connection,
    googleEmail: connection?.googleEmail ?? null,
    hasAnalyticsScope: hasScope(connection?.scope, GA_SCOPE),
    properties: properties.map((p) => ({
      id: p.id,
      propertyId: p.propertyId,
      displayName: p.displayName,
      accountName: p.accountName,
      timeZone: p.timeZone,
      isVexSite: p.isVexSite,
      client: p.client,
      mapping: p.mapping && {
        leadEvent: p.mapping.leadEvent,
        leadStatus: p.mapping.leadStatus,
        whatsappEvent: p.mapping.whatsappEvent,
        whatsappUrlContains: p.mapping.whatsappUrlContains,
        whatsappStatus: p.mapping.whatsappStatus,
        notes: p.mapping.notes,
      },
    })),
  })
}
