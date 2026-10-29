import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { logActivity } from '@/lib/activity'
import { publicOrigin } from '@/lib/billing-core'
import { AssinaturaErro, enviarParaOsAssinantes } from '@/lib/assinatura'

/**
 * POST (admin) — manda o PDF e o link de cada um para o WhatsApp de cada
 * assinante que ainda não assinou. Com { assinanteId }, só para essa pessoa.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  try {
    const resultado = await enviarParaOsAssinantes(id, publicOrigin(req), typeof body.assinanteId === 'string' ? body.assinanteId : undefined)
    const falhas = resultado.filter((r) => !r.ok)
    await logActivity(admin.id, 'SEND', 'assinaturas', `Contrato ${id} enviado pelo WhatsApp: ${resultado.map((r) => `${r.nome} ${r.ok ? 'ok' : 'falhou'}`).join(', ')}`)
    if (falhas.length) {
      return NextResponse.json({ error: falhas.map((f) => `${f.nome}: ${f.erro}`).join(' · '), resultado }, { status: falhas.length === resultado.length ? 502 : 207 })
    }
    return NextResponse.json({ ok: true, resultado })
  } catch (e) {
    if (e instanceof AssinaturaErro) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[assinaturas] falha ao enviar', e)
    return NextResponse.json({ error: 'Não foi possível enviar agora.' }, { status: 500 })
  }
}
