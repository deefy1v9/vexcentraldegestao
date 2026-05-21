import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { isConfigured, uazDisconnect } from '@/lib/uazapi'

export async function POST() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  if (!await isConfigured()) {
    return NextResponse.json({ error: 'UAZAPI não configurado' }, { status: 503 })
  }

  try {
    const data = await uazDisconnect()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
