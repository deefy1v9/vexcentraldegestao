import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getConnection, disconnect, GscError } from '@/lib/gsc'
import { logActivity } from '@/lib/activity'

/**
 * Desconecta a conta do Google: revoga o acesso, apaga tokens, propriedades
 * vinculadas e cache. Desvincular uma propriedade é outra ação, em
 * /api/gsc/propriedades.
 */
export async function POST() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const connection = await getConnection()
  if (!connection) return NextResponse.json({ error: 'Nenhuma conta conectada.' }, { status: 409 })

  try {
    const { propriedades } = await disconnect(connection.id)
    await logActivity(admin.id, 'desconectou o Google Search Console', 'SEO', connection.googleEmail)
    return NextResponse.json({ ok: true, propriedadesRemovidas: propriedades })
  } catch (err) {
    return NextResponse.json({ error: err instanceof GscError ? err.message : 'Falha ao desconectar.' }, { status: 500 })
  }
}
