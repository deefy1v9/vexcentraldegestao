import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { encryptSecret, decryptSecret } from '@/lib/crypto'

// Credenciais guardam senhas de acesso dos clientes e são devolvidas em
// texto claro — por isso todo este recurso é restrito a administradores.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const credentials = await prisma.clientCredential.findMany({ where: { clientId: id } })

  // Descriptografa a senha antes de devolver ao administrador.
  return NextResponse.json(
    credentials.map((c) => ({ ...c, password: decryptSecret(c.password) })),
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  // Whitelist explícita de campos — nunca confiar no body inteiro.
  const cred = await prisma.clientCredential.create({
    data: {
      clientId: id,
      type: String(body.type ?? ''),
      label: String(body.label ?? ''),
      username: body.username ? String(body.username) : null,
      password: encryptSecret(body.password ? String(body.password) : null),
      url: body.url ? String(body.url) : null,
      email: body.email ? String(body.email) : null,
      notes: body.notes ? String(body.notes) : null,
    },
  })

  await logActivity(user.id, 'adicionou credencial', 'Clientes', cred.label)
  return NextResponse.json({ ...cred, password: decryptSecret(cred.password) }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const credId = searchParams.get('credId')
  if (!credId) return NextResponse.json({ error: 'credId required' }, { status: 400 })

  // Garante que a credencial pertence ao cliente da rota antes de apagar.
  const cred = await prisma.clientCredential.findUnique({ where: { id: credId } })
  if (!cred || cred.clientId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.clientCredential.delete({ where: { id: credId } })
  await logActivity(user.id, 'removeu credencial', 'Clientes', cred.label)
  return NextResponse.json({ ok: true })
}
