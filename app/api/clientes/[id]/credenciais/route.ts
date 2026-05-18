import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const credentials = await prisma.clientCredential.findMany({ where: { clientId: id } })
  return NextResponse.json(credentials)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const cred = await prisma.clientCredential.create({
    data: { ...body, clientId: id },
  })

  await logActivity((session.user as any).id, 'adicionou credencial', 'Clientes', body.label)
  return NextResponse.json(cred, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const credId = searchParams.get('credId')
  if (!credId) return NextResponse.json({ error: 'credId required' }, { status: 400 })

  await prisma.clientCredential.delete({ where: { id: credId } })
  await logActivity((session.user as any).id, 'removeu credencial', 'Clientes')
  return NextResponse.json({ ok: true })
}
