import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { isConfigured, uazStatus } from '@/lib/uazapi'

export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  if (!await isConfigured()) {
    return NextResponse.json({ configured: false, connected: false })
  }

  try {
    const data = await uazStatus()
    // A UAZAPI varia o formato da resposta entre versões; normaliza aqui.
    const raw = data as unknown as Record<string, unknown>
    const s = (raw.status ?? raw.instance ?? raw) as {
      connected?: boolean
      loggedIn?: boolean
      state?: string
      jid?: string
      wuid?: string
    }
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
