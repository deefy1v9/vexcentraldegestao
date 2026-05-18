import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
