import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { logActivity } from '@/lib/activity'
import { syncCustomer } from '@/lib/billing-asaas'

/** Sincroniza (cria/atualiza sem duplicar) o cliente no Asaas. Só admin. */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  try {
    const r = await syncCustomer(id)
    await logActivity(admin.id, 'sincronizou cliente com Asaas', 'Financeiro', id)
    return NextResponse.json({ ok: true, asaasCustomerId: r.asaasCustomerId })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha na sincronização.' },
      { status: 400 },
    )
  }
}
