import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { logActivity } from '@/lib/activity'
import { AssinaturaErro, cancelarContrato } from '@/lib/assinatura'

/** DELETE (admin) — cancela o contrato que ainda não foi assinado: o link para de aceitar assinatura. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  try {
    await cancelarContrato(id)
    await logActivity(admin.id, 'DELETE', 'assinaturas', `Contrato ${id} cancelado`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AssinaturaErro) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
