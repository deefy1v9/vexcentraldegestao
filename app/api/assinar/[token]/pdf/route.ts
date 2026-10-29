import { NextRequest, NextResponse } from 'next/server'
import { pdfDoContrato } from '@/lib/assinatura'
import { respostaDoPdf } from '@/lib/assinatura-http'
import { criarLimitador, ipDe } from '@/lib/mcp/limite'

/** GET (público, o segredo é o link) — o contrato para ler; depois de assinado, o PDF com o relatório. */
const limite = criarLimitador(60, 10 * 60_000)

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const freio = limite.conferir(ipDe(req.headers))
  if (!freio.ok) return NextResponse.json({ error: `Muitos pedidos. Tente de novo em ${freio.esperarSeg} s.` }, { status: 429 })
  const { token } = await params
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 })
  const pdf = await pdfDoContrato({ token }, 'atual')
  if (!pdf) return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 })
  return respostaDoPdf(pdf, new URL(req.url).searchParams.get('baixar') === '1')
}
