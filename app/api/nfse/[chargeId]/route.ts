import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { emitForCharge, applyFocusPayload, getNfseProvider, NfseBlockedError } from '@/lib/nfse'
import { consultAsaasInvoice, cancelAsaasInvoice } from '@/lib/nfse-asaas'
import * as focus from '@/lib/focus-nfe'
import { validateEmails } from '@/lib/billing-core'

/**
 * Ações de NFS-e sobre uma cobrança (admin):
 * POST { action: 'emit' | 'consult' | 'email' | 'cancel', ... }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ chargeId: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { chargeId } = await params
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')

  const charge = await prisma.asaasCharge.findUnique({
    where: { id: chargeId },
    include: { nfse: true, client: { select: { name: true, billingEmail: true, email: true } } },
  })
  if (!charge) return NextResponse.json({ error: 'Cobrança não encontrada.' }, { status: 404 })

  try {
    const provider = await getNfseProvider()
    const viaAsaas = (nf: { provider?: string; focusRef: string } | null) => nf?.provider === 'ASAAS' || !!nf?.focusRef.startsWith('asaas:')

    if (action === 'emit') {
      const { certStatus } = await (await import('@/lib/focus-nfe')).getFocusConfig()
      if (provider === 'focus' && certStatus !== 'OK') {
        return NextResponse.json(
          { error: 'Emissão bloqueada: aguardando o certificado digital e-CNPJ A1 ser cadastrado na Focus NFe.' },
          { status: 409 },
        )
      }
      const r = await emitForCharge(chargeId)
      await logActivity(admin.id, 'emitiu NFS-e', 'Financeiro', charge.externalRef)
      const nfse = await prisma.nfseInvoice.findUnique({ where: { id: r.invoiceId } })
      return NextResponse.json({ ok: true, nfse })
    }

    if (action === 'consult') {
      if (!charge.nfse) return NextResponse.json({ error: 'Nenhuma NFS-e para esta cobrança.' }, { status: 404 })
      if (viaAsaas(charge.nfse)) {
        await consultAsaasInvoice(charge.nfse.id)
        const nfse = await prisma.nfseInvoice.findUnique({ where: { id: charge.nfse.id } })
        return NextResponse.json({ ok: true, nfse })
      }
      const r = await focus.consultNfse(charge.nfse.focusRef)
      if (r.status === 404) {
        return NextResponse.json({ error: 'Nota não encontrada na Focus.' }, { status: 404 })
      }
      await applyFocusPayload(charge.nfse.id, r.body as Record<string, unknown>)
      const nfse = await prisma.nfseInvoice.findUnique({ where: { id: charge.nfse.id } })
      return NextResponse.json({ ok: true, nfse })
    }

    if (action === 'email') {
      if (!charge.nfse) return NextResponse.json({ error: 'Nenhuma NFS-e para esta cobrança.' }, { status: 404 })
      if (charge.nfse.status !== 'AUTORIZADO') {
        return NextResponse.json({ error: 'A nota só pode ser enviada depois de autorizada.' }, { status: 400 })
      }
      const requested: string[] = Array.isArray(body.emails) && body.emails.length > 0
        ? body.emails.map(String)
        : [charge.client.billingEmail || charge.client.email || '']
      const { ok, invalid } = validateEmails(requested)
      if (ok.length === 0) {
        return NextResponse.json({ error: `Nenhum e-mail válido.${invalid.length ? ` Inválidos: ${invalid.join(', ')}` : ''}` }, { status: 400 })
      }

      try {
        if (viaAsaas(charge.nfse)) {
          // Nota do Asaas: o PDF/XML vai pelo próprio sistema, no layout da marca
          const { notifyNfseIssued } = await import('@/lib/email-notify')
          const sent = await notifyNfseIssued(charge.nfse.id)
          if (!sent) throw new Error('Não foi possível enviar o e-mail da nota.')
        } else {
          await focus.resendNfseEmail(charge.nfse.focusRef, ok)
        }
        await prisma.nfseInvoice.update({
          where: { id: charge.nfse.id },
          data: {
            emailSentAt: new Date(),
            emailRecipients: ok.join(','),
            emailAttempts: { increment: 1 },
            emailError: null,
            emailRequestedBy: admin.name,
          },
        })
        await logActivity(admin.id, 'reenviou NFS-e por e-mail', 'Financeiro', charge.externalRef)
        return NextResponse.json({ ok: true, sentTo: ok })
      } catch (err) {
        await prisma.nfseInvoice.update({
          where: { id: charge.nfse.id },
          data: {
            emailAttempts: { increment: 1 },
            emailError: (err instanceof Error ? err.message : String(err)).slice(0, 300),
          },
        }).catch(() => {})
        throw err
      }
    }

    if (action === 'cancel') {
      if (!charge.nfse) return NextResponse.json({ error: 'Nenhuma NFS-e para esta cobrança.' }, { status: 404 })
      const justificativa = String(body.justificativa ?? '').trim()
      if (justificativa.length < 15) {
        return NextResponse.json({ error: 'Informe a justificativa do cancelamento (mínimo 15 caracteres).' }, { status: 400 })
      }
      let cancelada: boolean
      if (viaAsaas(charge.nfse)) {
        const body = await cancelAsaasInvoice(charge.nfse.id)
        cancelada = body.status === 'CANCELED'
      } else {
        const r = await focus.cancelNfse(charge.nfse.focusRef, justificativa)
        const st = (r.body as { status?: string })?.status
        cancelada = st === 'cancelado'
        await prisma.nfseInvoice.update({
          where: { id: charge.nfse.id },
          data: { status: cancelada ? 'CANCELADO' : 'ERRO_CANCELAMENTO' },
        })
      }
      if (cancelada) {
        const { notifyNfseCancelled } = await import('@/lib/email-notify')
        await notifyNfseCancelled(charge.nfse.id, justificativa).catch(() => {})
      }
      await logActivity(admin.id, 'cancelou NFS-e', 'Financeiro', `${charge.externalRef} — ${justificativa.slice(0, 80)}`)
      const nfse = await prisma.nfseInvoice.findUnique({ where: { id: charge.nfse.id } })
      return NextResponse.json({ ok: true, nfse })
    }

    return NextResponse.json({ error: 'action inválida.' }, { status: 400 })
  } catch (err) {
    const status = err instanceof NfseBlockedError ? 400 : 500
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha na operação da NFS-e.' },
      { status },
    )
  }
}
