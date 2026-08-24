import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const { content } = await req.json()

  const comment = await prisma.taskComment.create({
    data: {
      taskId: id,
      userId: user.id,
      content,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  return NextResponse.json(comment, { status: 201 })
}
