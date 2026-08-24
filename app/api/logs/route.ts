import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  // Logs de atividade de todos os usuários — restrito a administradores.
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const moduleFilter = searchParams.get('module')
  const page = Number(searchParams.get('page') || 1)
  const limit = 50

  const logs = await prisma.activityLog.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(moduleFilter ? { module: moduleFilter } : {}),
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })

  const total = await prisma.activityLog.count({
    where: {
      ...(userId ? { userId } : {}),
      ...(moduleFilter ? { module: moduleFilter } : {}),
    },
  })

  return NextResponse.json({ logs, total, page, pages: Math.ceil(total / limit) })
}
