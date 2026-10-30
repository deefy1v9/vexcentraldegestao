import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { lerExtratoPdf, lerOfx, type ItemPdf } from '@/lib/conciliacao-core'
import { conciliarAutomatico, definirResponsavel, importarExtrato, painelConciliacao } from '@/lib/conciliacao'

/**
 * Conciliação bancária — só administradores.
 * GET: situação das contas e as linhas (filtro ?status=&conta=).
 * POST: sobe um extrato. O PDF é lido no navegador (pdfjs) e chega aqui como
 *   itens posicionados; o OFX chega como texto. A leitura em si é pura.
 * PATCH: troca o responsável ou roda a conciliação automática de novo.
 */

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const sp = new URL(req.url).searchParams
  return NextResponse.json(await painelConciliacao({ status: sp.get('status') ?? 'PENDENTE', conta: sp.get('conta') ?? undefined }))
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const body = await req.json().catch(() => null)
  const arquivo = String(body?.arquivo ?? 'extrato').slice(0, 200)
  try {
    let lido
    if (body?.tipo === 'ofx' && typeof body.texto === 'string') {
      lido = lerOfx(body.texto.slice(0, 2_000_000))
    } else if (body?.tipo === 'pdf' && Array.isArray(body.itens)) {
      const itens: ItemPdf[] = (body.itens as unknown[]).slice(0, 50_000).flatMap((i) => {
        const r = i as Record<string, unknown>
        return typeof r?.s === 'string' && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.pagina)
          ? [{ pagina: Number(r.pagina), x: Number(r.x), y: Number(r.y), s: r.s.slice(0, 500) }]
          : []
      })
      lido = lerExtratoPdf(itens)
    } else {
      return NextResponse.json({ error: 'Envie o PDF do extrato ou um arquivo OFX.' }, { status: 400 })
    }
    return NextResponse.json(await importarExtrato(lido, arquivo, gate.id))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Não consegui ler o extrato.' }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const body = await req.json().catch(() => ({}))
  if (typeof body.responsavelId === 'string') {
    const u = await prisma.user.findFirst({ where: { id: body.responsavelId, role: 'ADMIN', isActive: true }, select: { id: true } })
    if (!u) return NextResponse.json({ error: 'Escolha um administrador ativo.' }, { status: 400 })
    await definirResponsavel(u.id)
    return NextResponse.json({ ok: true })
  }
  if (body.reconciliar) return NextResponse.json(await conciliarAutomatico())
  return NextResponse.json({ error: 'Nada para fazer.' }, { status: 400 })
}
