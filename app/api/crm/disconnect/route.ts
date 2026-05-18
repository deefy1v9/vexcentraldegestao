import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isConfigured, uazDisconnect } from '@/lib/uazapi'

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
