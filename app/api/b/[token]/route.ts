import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validarRespostas } from '@/lib/briefing-core'
import { abrirLink, gravarResposta, perguntasDe } from '@/lib/briefing'
import { criarLimitador, ipDe } from '@/lib/mcp/limite'

/**
 * Envio do briefing pelo cliente (público, sem login). O segredo do link é a
 * única porta: link geral do briefing ou link de um cliente. Freio por IP e
 * campo-isca contra robô.
 */
const limite = criarLimitador(10, 10 * 60_000)

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const freio = limite.conferir(ipDe(req.headers))
  if (!freio.ok) return NextResponse.json({ error: `Muitos envios seguidos. Tente de novo em ${freio.esperarSeg} s.` }, { status: 429 })

  const link = await abrirLink(token)
  if (!link) return NextResponse.json({ error: 'Este link não está mais disponível. Fale com a VEX.' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  // Isca: pessoa não vê nem preenche este campo; robô preenche tudo
  if (typeof body.site === 'string' && body.site.trim()) return NextResponse.json({ ok: true })

  if (link.convite) {
    const ja = await prisma.briefingResponse.count({ where: { inviteId: link.convite.id } })
    if (ja > 0) return NextResponse.json({ error: 'Este briefing já foi respondido. Se precisar mudar algo, fale com a VEX.' }, { status: 409 })
  }

  const perguntas = perguntasDe(link.template.questions)
  const v = validarRespostas(perguntas, body.respostas)
  if ('erros' in v) return NextResponse.json({ error: 'Confira os campos marcados.', erros: v.erros }, { status: 400 })

  await gravarResposta({
    templateId: link.template.id,
    perguntas,
    respostas: v.respostas,
    convite: link.convite ? { id: link.convite.id, clientId: link.convite.clientId } : null,
  })
  return NextResponse.json({ ok: true })
}
