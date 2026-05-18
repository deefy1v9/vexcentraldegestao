import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { content } = await req.json()

  const comment = await prisma.taskComment.create({
    data: {
      taskId: id,
      userId: (session.user as any).id,
      content,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  return NextResponse.json(comment, { status: 201 })
}
