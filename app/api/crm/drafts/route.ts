import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/** Rascunhos pendentes — todos, ou os de uma conversa específica. */
export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')

  const drafts = await prisma.aiDraft.findMany({
    where: {
      status: 'PENDENTE',
      ...(conversationId ? { conversationId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: conversationId ? 1 : 100,
  })

  return NextResponse.json(drafts)
}
