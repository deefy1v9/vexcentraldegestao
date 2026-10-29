import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { logActivity } from '@/lib/activity'
import { publicOrigin } from '@/lib/billing-core'
import { AssinaturaErro, enviarParaOCliente } from '@/lib/assinatura'

/** POST (admin) — manda o PDF e o link do contrato para o WhatsApp de quem assina. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  try {
    const r = await enviarParaOCliente(id, publicOrigin(req))
    await logActivity(admin.id, 'SEND', 'assinaturas', `Contrato ${id} enviado pelo WhatsApp`)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    if (e instanceof AssinaturaErro) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[assinaturas] falha ao enviar', e)
    return NextResponse.json({ error: 'Não foi possível enviar agora.' }, { status: 500 })
  }
}
