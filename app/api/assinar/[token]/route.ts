import { NextRequest, NextResponse } from 'next/server'
import { publicOrigin } from '@/lib/billing-core'
import { AssinaturaErro, assinar } from '@/lib/assinatura'
import { DESENHO_MAX_BYTES } from '@/lib/assinatura-core'
import { criarLimitador, ipDe } from '@/lib/mcp/limite'

/** POST (público) — o código de 6 dígitos e, se houver, a rubrica (PNG em base64). Assina uma vez só. */
const limite = criarLimitador(20, 10 * 60_000)

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = ipDe(req.headers)
  const freio = limite.conferir(ip)
  if (!freio.ok) return NextResponse.json({ error: `Muitas tentativas seguidas. Tente de novo em ${freio.esperarSeg} s.` }, { status: 429 })
  const { token } = await params
  const body = await req.json().catch(() => ({}))

  let desenho: Buffer | null = null
  if (typeof body.desenho === 'string' && body.desenho) {
    const b64 = body.desenho.replace(/^data:image\/png;base64,/, '')
    if (b64.length > (DESENHO_MAX_BYTES * 4) / 3 + 8) return NextResponse.json({ error: 'A rubrica ficou grande demais. Desenhe de novo.' }, { status: 400 })
    desenho = Buffer.from(b64, 'base64')
  }

  try {
    const r = await assinar(token, {
      codigo: String(body.codigo ?? ''),
      desenho,
      ip: ip === 'desconhecido' ? null : ip,
      aparelho: req.headers.get('user-agent'),
      base: publicOrigin(req),
    })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    if (e instanceof AssinaturaErro) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[assinar] falha ao assinar', e)
    return NextResponse.json({ error: 'Não foi possível assinar agora. Tente de novo.' }, { status: 500 })
  }
}
