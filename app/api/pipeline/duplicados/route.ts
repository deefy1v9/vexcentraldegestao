import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { findClientMatches } from '@/lib/pipeline'

/**
 * Possíveis cadastros iguais, consultados antes de criar cliente na conversão.
 * Documento normalizado é correspondência forte; nome, telefone e e-mail são
 * apenas sugestões — nada é fundido automaticamente.
 */
export async function GET(req: NextRequest) {
  const viewer = await requireUser()
  if (viewer instanceof NextResponse) return viewer
  const { searchParams } = new URL(req.url)
  return NextResponse.json(await findClientMatches({
    document: searchParams.get('document'),
    name: searchParams.get('name'),
    email: searchParams.get('email'),
    phone: searchParams.get('phone'),
  }))
}
