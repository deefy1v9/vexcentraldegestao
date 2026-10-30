import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { aplicarAcao, type AcaoLinha } from '@/lib/conciliacao'

/** O que fazer com uma linha do extrato: vincular, lançar, ignorar ou desfazer. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const { id } = await params
  const b = await req.json().catch(() => ({}))

  let acao: AcaoLinha
  if (b.acao === 'vincular') acao = { acao: 'vincular', movimentos: Array.isArray(b.movimentos) ? b.movimentos.map(String) : [] }
  else if (b.acao === 'lancar') acao = { acao: 'lancar', kind: String(b.kind ?? ''), descricao: String(b.descricao ?? ''), categoria: b.categoria ? String(b.categoria) : null, partnerId: b.partnerId ? String(b.partnerId) : null, lembrar: !!b.lembrar }
  else if (b.acao === 'ignorar' && ['INTERNA', 'PESSOAL', 'OUTRO'].includes(b.motivo)) acao = { acao: 'ignorar', motivo: b.motivo, lembrar: !!b.lembrar }
  else if (b.acao === 'desfazer') acao = { acao: 'desfazer' }
  else return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })

  try {
    return NextResponse.json({ ok: true, mensagem: await aplicarAcao(id, acao, gate.id) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Falhou.' }, { status: 400 })
  }
}
