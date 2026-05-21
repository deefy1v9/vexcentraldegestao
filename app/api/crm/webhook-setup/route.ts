import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { isConfigured, uazSetWebhook } from '@/lib/uazapi'
import { getWebhookSecret } from '@/lib/webhook-secret'

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  if (!await isConfigured()) {
    return NextResponse.json({ error: 'UAZAPI não configurado' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const baseUrl = (body.baseUrl as string || process.env.NEXTAUTH_URL || '').replace(/\/$/, '')
  if (!baseUrl) {
    return NextResponse.json({ error: 'baseUrl não informado' }, { status: 400 })
  }

  // Registra a URL do webhook já com o token secreto, para que o endpoint
  // /api/crm/webhook consiga rejeitar requisições não autênticas.
  const secret = getWebhookSecret()
  const webhookUrl = secret
    ? `${baseUrl}/api/crm/webhook?token=${encodeURIComponent(secret)}`
    : `${baseUrl}/api/crm/webhook`

  try {
    const data = await uazSetWebhook(webhookUrl)
    return NextResponse.json({ ok: true, webhookUrl, uazapi: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
