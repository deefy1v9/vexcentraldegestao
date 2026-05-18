import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isConfigured, uazConnect } from '@/lib/uazapi'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
