import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { baseDaCentral, painelDoConector } from '@/lib/mcp/oauth'
import { urlDoConector } from '@/lib/mcp/formato'

export const dynamic = 'force-dynamic'

/** Endereço do conector, quem conectou e as últimas consultas (tela de Agentes, só admin). */
export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const { conexoes, consultas } = await painelDoConector()
  return NextResponse.json({ endereco: urlDoConector(baseDaCentral()), conexoes, consultas })
}
