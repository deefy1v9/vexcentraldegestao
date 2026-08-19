import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { logActivity } from '@/lib/activity'
import { publicOrigin } from '@/lib/billing-core'
import * as asaas from '@/lib/asaas'
import * as focus from '@/lib/focus-nfe'

/**
 * Registra os webhooks nos provedores (admin):
 * POST { provider: 'asaas' | 'focus' } — usa os tokens de webhook já
 * configurados (nunca os expõe) e a URL pública do próprio sistema.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const provider = String(body.provider ?? '')
  const origin = publicOrigin(req)

  try {
    if (provider === 'asaas') {
      const { webhookToken } = await asaas.getAsaasConfig()
      if (!webhookToken) {
        return NextResponse.json({ error: 'Configure ASAAS_WEBHOOK_TOKEN antes (diferente da API Key).' }, { status: 400 })
      }
      const r = await asaas.ensureWebhook(`${origin}/api/webhooks/asaas`, webhookToken, admin.email)
      await logActivity(admin.id, 'registrou webhook Asaas', 'Financeiro', `${origin}/api/webhooks/asaas`)
      return NextResponse.json({ ok: true, created: r.created })
    }

    if (provider === 'focus') {
      const { webhookToken } = await focus.getFocusConfig()
      if (!webhookToken) {
        return NextResponse.json({ error: 'Configure FOCUS_WEBHOOK_TOKEN antes.' }, { status: 400 })
      }
      const r = await focus.ensureHook(`${origin}/api/webhooks/focus-nfe`, webhookToken)
      await logActivity(admin.id, 'registrou gatilho Focus', 'Financeiro', `${origin}/api/webhooks/focus-nfe`)
      return NextResponse.json({ ok: true, created: r.created })
    }

    return NextResponse.json({ error: 'provider inválido.' }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha ao registrar webhook.' },
      { status: 400 },
    )
  }
}
