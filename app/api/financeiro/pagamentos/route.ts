import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'

/**
 * Ações sobre parcelas de recebimento (admin):
 * - PUT { paymentIds | paymentId, status }            → registrar/estornar pagamento
 * - PUT { paymentIds, action: 'vencimento', dueDate } → alterar vencimento (só pendentes)
 * - PUT { paymentIds, action: 'cancelar', reason }    → cancelar (só pendentes; sai dos cálculos)
 * - PUT { paymentIds, action: 'reenviar' }            → reenvia a fatura por e-mail (cobrança Asaas)
 * Parcelas pagas nunca são alteradas por estas ações — o histórico fica.
 */
export async function PUT(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => ({}))
  const { paymentId, paymentIds, status, action } = body

  const ids: string[] = Array.isArray(paymentIds)
    ? paymentIds.filter((x: unknown) => typeof x === 'string')
    : typeof paymentId === 'string' ? [paymentId] : []
  if (ids.length === 0) return NextResponse.json({ error: 'paymentId(s) inválido(s)' }, { status: 400 })

  const rows = await prisma.clientPayment.findMany({
    where: { id: { in: ids } },
    include: { client: { select: { id: true, name: true } } },
  })
  if (rows.length === 0) return NextResponse.json({ error: 'Parcela não encontrada.' }, { status: 404 })
  const clientName = rows[0].client.name

  /* ------------------------------ vencimento ------------------------------ */
  if (action === 'vencimento') {
    const due = new Date(`${String(body.dueDate ?? '').slice(0, 10)}T12:00:00Z`)
    if (Number.isNaN(due.getTime())) return NextResponse.json({ error: 'Data de vencimento inválida.' }, { status: 400 })
    const r = await prisma.clientPayment.updateMany({
      where: { id: { in: ids }, status: 'PENDENTE' },
      data: { dueDate: due },
    })
    await logActivity(user.id, `alterou vencimento de ${r.count} parcela(s)`, 'Financeiro', clientName)
    return NextResponse.json({ ok: true, count: r.count, skipped: ids.length - r.count })
  }

  /* -------------------------------- cancelar -------------------------------- */
  if (action === 'cancelar') {
    const r = await prisma.clientPayment.updateMany({
      where: { id: { in: ids }, status: 'PENDENTE' },
      data: { status: 'CANCELADO' },
    })
    await logActivity(user.id, `cancelou ${r.count} parcela(s)${body.reason ? ` — ${String(body.reason).slice(0, 120)}` : ''}`, 'Financeiro', clientName)
    return NextResponse.json({ ok: true, count: r.count, skipped: ids.length - r.count })
  }

  /* -------------------------------- reenviar -------------------------------- */
  if (action === 'reenviar') {
    // Reenvia a fatura da cobrança Asaas da competência (idempotência por
    // tentativa: refId com carimbo para permitir reenvio explícito)
    const first = rows[0]
    const charge = await prisma.asaasCharge.findUnique({
      where: { clientId_year_month: { clientId: first.clientId, year: first.year, month: first.month } },
    })
    if (!charge?.asaasId) return NextResponse.json({ error: 'Não há cobrança gerada no Asaas para esta competência.' }, { status: 400 })
    const { sendMail, smtpConfigured } = await import('@/lib/mailer')
    const T = await import('@/lib/email-templates')
    if (!(await smtpConfigured('financeiro'))) return NextResponse.json({ error: 'E-mail não configurado.' }, { status: 409 })
    const client = await prisma.client.findUniqueOrThrow({ where: { id: first.clientId } })
    const to = client.billingEmail || client.email
    if (!to) return NextResponse.json({ error: 'Cliente sem e-mail financeiro.' }, { status: 400 })
    const mail = T.invoiceIssued({
      clientName: client.legalName || client.name,
      competencia: `${String(charge.month).padStart(2, '0')}/${charge.year}`,
      value: Number(charge.value),
      dueDate: charge.dueDate,
      billingType: charge.billingType,
      invoiceUrl: charge.invoiceUrl,
      bankSlipUrl: charge.bankSlipUrl,
      identificationField: charge.identificationField,
    })
    const r = await sendMail({
      to, subject: mail.subject, html: mail.html, profile: 'financeiro', kind: 'invoice-resend',
      refId: `charge:${charge.id}:resend:${Date.now()}`,
    })
    await logActivity(user.id, 'reenviou cobrança por e-mail', 'Financeiro', clientName)
    return NextResponse.json({ ok: true, sent: r.sent })
  }

  /* --------------------------------- status --------------------------------- */
  if (!status || typeof status !== 'string' || !['PAGO', 'PENDENTE'].includes(status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }
  await prisma.clientPayment.updateMany({
    where: { id: { in: ids }, status: { not: 'CANCELADO' } },
    data: { status, paidAt: status === 'PAGO' ? new Date() : null },
  })
  await logActivity(
    user.id,
    `marcou ${ids.length > 1 ? `${ids.length} pagamentos` : 'pagamento'} como ${status}`,
    'Financeiro',
    clientName,
  )
  return NextResponse.json({ ok: true, count: ids.length })
}
