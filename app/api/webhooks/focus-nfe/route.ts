import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { getFocusConfig } from '@/lib/focus-nfe'
import { applyFocusPayload } from '@/lib/nfse'
import { webhookEventKey } from '@/lib/billing-core'

export const maxDuration = 60

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

/**
 * Webhook da Focus NFe (público). Autentica pelo header secreto
 * `x-webhook-token` configurado na criação do gatilho, identifica a nota
 * pela referência, persiste o evento (idempotente por hash determinístico —
 * o payload não traz id próprio), tolera campos novos e não depende da
 * ordem dos eventos: sempre aplica o estado recebido.
 */
export async function POST(req: NextRequest) {
  const { webhookToken } = await getFocusConfig()
  const received = req.headers.get('x-webhook-token') ?? ''
  if (!webhookToken || !received || !safeEqual(received, webhookToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: true })

  const ref: string = body.ref ?? body.referencia ?? ''
  const eventKey = webhookEventKey('FOCUS', [
    ref, body.status, body.numero, body.codigo_verificacao,
    JSON.stringify(body.erros ?? '').slice(0, 80),
  ])

  let stored
  try {
    stored = await prisma.webhookEvent.create({
      data: { provider: 'FOCUS', eventKey, type: String(body.status ?? ''), payload: body },
    })
  } catch {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  try {
    const invoice = ref
      ? await prisma.nfseInvoice.findUnique({ where: { focusRef: ref } })
      : null
    if (invoice) {
      await applyFocusPayload(invoice.id, body)
    }
    await prisma.webhookEvent.update({ where: { id: stored.id }, data: { processedAt: new Date() } })
  } catch (err) {
    await prisma.webhookEvent.update({
      where: { id: stored.id },
      data: { error: (err instanceof Error ? err.message : String(err)).slice(0, 500) },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
