import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { getAsaasConfig } from '@/lib/asaas'
import { processAsaasEvent } from '@/lib/billing-asaas'
import { webhookEventKey } from '@/lib/billing-core'

export const maxDuration = 60

const HANDLED = new Set([
  'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED',
  'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_BANK_SLIP_CANCELLED',
])

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

/**
 * Webhook do Asaas (público). Autentica pelo header `asaas-access-token`
 * (token PRÓPRIO do webhook — diferente da API Key), persiste o evento com
 * chave única (idempotência) e responde 200 rápido; o processamento roda em
 * seguida e uma falha não gera reentrega infinita de evento já registrado.
 */
export async function POST(req: NextRequest) {
  const { webhookToken } = await getAsaasConfig()
  const received = req.headers.get('asaas-access-token') ?? ''
  if (!webhookToken || !received || !safeEqual(received, webhookToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: true })

  const event: string = body.event ?? ''
  const payment = body.payment ?? {}
  const eventKey = body.id
    ? `ASAAS:${body.id}`
    : webhookEventKey('ASAAS', [event, payment.id, payment.status, body.dateCreated])

  // Idempotência: evento repetido não processa duas vezes
  let stored
  try {
    stored = await prisma.webhookEvent.create({
      data: { provider: 'ASAAS', eventKey, type: event, payload: body },
    })
  } catch {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  if (HANDLED.has(event) && payment?.id) {
    try {
      await processAsaasEvent(event, payment)
      await prisma.webhookEvent.update({ where: { id: stored.id }, data: { processedAt: new Date() } })
    } catch (err) {
      await prisma.webhookEvent.update({
        where: { id: stored.id },
        data: { error: (err instanceof Error ? err.message : String(err)).slice(0, 500) },
      }).catch(() => {})
    }
  } else {
    await prisma.webhookEvent.update({ where: { id: stored.id }, data: { processedAt: new Date() } }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
