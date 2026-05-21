import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { isConfigured, uazConnect } from '@/lib/uazapi'

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  if (!await isConfigured()) {
    return NextResponse.json({ error: 'UAZAPI_URL e UAZAPI_TOKEN não configurados no .env' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  try {
    const data = await uazConnect(body.phone)
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
