import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isConfigured, uazSetWebhook } from '@/lib/uazapi'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await isConfigured()) {
    return NextResponse.json({ error: 'UAZAPI não configurado' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const baseUrl = (body.baseUrl as string || process.env.NEXTAUTH_URL || '').replace(/\/$/, '')
  if (!baseUrl) {
    return NextResponse.json({ error: 'baseUrl não informado' }, { status: 400 })
  }

  const webhookUrl = `${baseUrl}/api/crm/webhook`
  try {
    const data = await uazSetWebhook(webhookUrl)
    return NextResponse.json({ ok: true, webhookUrl, uazapi: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
