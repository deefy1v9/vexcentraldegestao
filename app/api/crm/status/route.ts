import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isConfigured, uazStatus } from '@/lib/uazapi'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!await isConfigured()) {
    return NextResponse.json({ configured: false, connected: false })
  }

  try {
    const data = await uazStatus()
    const raw = data as Record<string, unknown>
    const s = (raw.status ?? raw.instance ?? data) as Record<string, unknown> | null
    const connected = !!(
      s?.connected ||
      s?.loggedIn ||
      s?.state === 'open' ||
      s?.state === 'connected'
    )
    return NextResponse.json({
      configured: true,
      connected,
      jid: s?.jid ?? s?.wuid ?? null,
    })
  } catch {
    return NextResponse.json({ configured: true, connected: false })
  }
}
