import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { repoPrisma } from '@/lib/mcp/oauth'

export const dynamic = 'force-dynamic'

/** Desconectar: os tokens da conexão param de valer no pedido seguinte. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const { id } = await params
  const ok = await repoPrisma.revogarConexao(id, `desconectada por ${gate.name ?? 'admin'}`, gate.id)
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Conexão não encontrada ou já desconectada.' }, { status: 404 })
}
