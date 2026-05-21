import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  // Logs de atividade de todos os usuários — restrito a administradores.
  const { response } = await requireAdmin()
  if (response) return response

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const module = searchParams.get('module')
  const page = Number(searchParams.get('page') || 1)
  const limit = 50

  const logs = await prisma.activityLog.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(module ? { module } : {}),
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })

  const total = await prisma.activityLog.count({
    where: {
      ...(userId ? { userId } : {}),
      ...(module ? { module } : {}),
    },
  })

  return NextResponse.json({ logs, total, page, pages: Math.ceil(total / limit) })
}
