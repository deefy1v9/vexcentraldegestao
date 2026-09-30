import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

/** Remoção de um lançamento do caixa. Só administradores. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const { id } = await params
  const viewer = await getSessionUser()

  const mov = await prisma.cashMovement.findUnique({ where: { id } })
  if (!mov) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })

  await prisma.cashMovement.delete({ where: { id } })
  await logActivity(viewer?.id ?? '', 'removeu lançamento do caixa', 'Caixa', `${mov.kind} ${mov.description}`)
  return NextResponse.json({ ok: true })
}
