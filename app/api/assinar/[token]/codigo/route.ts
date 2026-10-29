import { NextRequest, NextResponse } from 'next/server'
import { AssinaturaErro, pedirCodigo } from '@/lib/assinatura'
import { criarLimitador, ipDe } from '@/lib/mcp/limite'

/**
 * POST (público) — nome completo e CPF; o código de 6 dígitos vai para o
 * WhatsApp do contrato. Além do freio por contrato (5 por hora, no banco),
 * um freio por IP segura quem tenta muitos links.
 */
const limite = criarLimitador(10, 10 * 60_000)

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const freio = limite.conferir(ipDe(req.headers))
  if (!freio.ok) return NextResponse.json({ error: `Muitos pedidos seguidos. Tente de novo em ${freio.esperarSeg} s.` }, { status: 429 })
  const { token } = await params
  const body = await req.json().catch(() => ({}))
  try {
    const r = await pedirCodigo(token, { nome: String(body.nome ?? ''), cpf: String(body.cpf ?? '') })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    if (e instanceof AssinaturaErro) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[assinar] falha ao pedir código', e)
    return NextResponse.json({ error: 'Não foi possível mandar o código agora.' }, { status: 500 })
  }
}
