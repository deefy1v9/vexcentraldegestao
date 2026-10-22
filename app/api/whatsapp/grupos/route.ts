import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { uazListGroups } from '@/lib/uazapi'

/**
 * Grupos de que o WhatsApp da Central participa, para escolher no cadastro do
 * cliente onde sai o aviso de demanda concluída. Só administradores.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  try {
    return NextResponse.json({ grupos: await uazListGroups() })
  } catch (e) {
    return NextResponse.json({ grupos: [], error: `Não consegui listar os grupos do WhatsApp (${e instanceof Error ? e.message : 'erro'}).` }, { status: 502 })
  }
}
