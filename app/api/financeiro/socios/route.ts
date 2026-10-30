import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { parseAmountCents } from '@/lib/caixa-core'

/**
 * Conta corrente dos sócios — só administradores. POST registra um
 * lançamento: `tipo` CREDITO (a empresa passa a dever ao sócio: pagou do
 * bolso, pôs dinheiro) ou DEBITO (o sócio passa a dever: parte numa despesa,
 * dinheiro que ficou com ele). Nada se apaga: correção é outro lançamento.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const b = await req.json().catch(() => ({}))
  const valor = parseAmountCents(b.valor)
  const descricao = String(b.descricao ?? '').trim()
  const dia = typeof b.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.dia)
    ? b.dia
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  if (!['CREDITO', 'DEBITO'].includes(b.tipo)) return NextResponse.json({ error: 'Diga se é crédito ou débito do sócio.' }, { status: 400 })
  if (!valor) return NextResponse.json({ error: 'Informe o valor.' }, { status: 400 })
  if (!descricao) return NextResponse.json({ error: 'Escreva do que se trata.' }, { status: 400 })
  const socio = await prisma.user.findFirst({ where: { id: String(b.partnerId ?? ''), socio: { not: null } }, select: { id: true } })
  if (!socio) return NextResponse.json({ error: 'Sócio não encontrado.' }, { status: 400 })
  await prisma.partnerLedger.create({
    data: { partnerId: socio.id, dia, amountCents: b.tipo === 'CREDITO' ? valor : -valor, description: descricao.slice(0, 300), createdById: gate.id },
  })
  return NextResponse.json({ ok: true })
}
