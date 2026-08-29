import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { spNow } from './billing-whatsapp'
import {
  chargeExternalRef, computeCompetenceCents, dueDateFor, shouldGenerateNow,
  centsToDecimalString, missingBillingFields,
} from './billing-core'
import * as asaas from './asaas'
import { maybeEmitForCharge } from './nfse'
import { notifyInvoiceIssued, notifyPaymentConfirmed, alertAdmins } from './email-notify'

/**
 * Orquestração das cobranças Asaas.
 *
 * O sistema é a fonte dos valores: a cobrança de uma competência é a soma
 * dos serviços ativos válidos no mês (lib/billing-core). O Asaas só gera o
 * boleto/Pix — as notificações nativas dele ficam desligadas e quem fala com
 * o cliente é o sistema, no layout da marca (lib/email-notify).
 * Duplicidade é impedida em três camadas: unique (clientId, ano, mês) no
 * banco, externalReference determinística e consulta antes de repetir POST
 * após timeout.
 */

/* ------------------------------ sincronização ------------------------------ */

export async function syncCustomer(clientId: string): Promise<{ asaasCustomerId: string }> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } })

  const missing = missingBillingFields(client)
  if (missing.length > 0) {
    await prisma.client.update({
      where: { id: clientId },
      data: { asaasSyncStatus: 'ERRO', asaasSyncError: `Campos ausentes: ${missing.join(', ')}` },
    })
    throw new Error(`Cadastro incompleto para cobrança: ${missing.join(', ')}`)
  }

  const payload: asaas.AsaasCustomerPayload = {
    name: client.legalName || client.name,
    cpfCnpj: client.cnpj!.replace(/\D/g, ''),
    email: client.billingEmail || client.email || undefined,
    phone: client.phone?.replace(/\D/g, '') || undefined,
    postalCode: client.zipCode?.replace(/\D/g, '') || undefined,
    address: client.street || undefined,
    addressNumber: client.addressNumber || undefined,
    complement: client.complement || undefined,
    province: client.district || undefined,
    additionalEmails: client.extraEmails || undefined,
    municipalInscription: client.municipalReg || undefined,
    // UUID interno como referência — nunca buscar só por nome
    externalReference: client.id,
    // Notificações nativas do Asaas DESLIGADAS: fatura, lembretes, atraso e
    // recibo saem pelo sistema, no layout da marca — nunca em dobro
    notificationDisabled: true,
  }

  try {
    // 1) já vinculado?
    let asaasId = client.asaasCustomerId
    if (!asaasId) {
      // 2) por externalReference  3) por CPF/CNPJ  4) criar
      const byRef = await asaas.findCustomerByExternalRef(client.id)
      const byDoc = byRef ?? (await asaas.findCustomerByCpfCnpj(client.cnpj!))
      asaasId = byDoc?.id ?? null
    }

    if (asaasId) {
      await asaas.updateCustomer(asaasId, payload)
    } else {
      const created = await asaas.createCustomer(payload)
      asaasId = created.id
    }

    await prisma.client.update({
      where: { id: clientId },
      data: { asaasCustomerId: asaasId, asaasSyncStatus: 'OK', asaasSyncError: null, asaasSyncedAt: new Date() },
    })
    return { asaasCustomerId: asaasId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.client.update({
      where: { id: clientId },
      data: { asaasSyncStatus: 'ERRO', asaasSyncError: msg.slice(0, 500) },
    })
    throw err
  }
}

/* -------------------------------- cobrança -------------------------------- */

/**
 * Garante a cobrança da competência (idempotente). Cria no Asaas somente se
 * ainda não existir — nem aqui, nem lá (externalReference consultada em
 * timeout/reexecução antes de novo POST).
 */
export async function ensureCharge(clientId: string, year: number, month: number): Promise<{ chargeId: string; created: boolean }> {
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    include: { services: true },
  })

  const externalRef = chargeExternalRef(clientId, year, month)

  // Já existe no banco?
  const existing = await prisma.asaasCharge.findUnique({ where: { externalRef } })
  if (existing && existing.status !== 'ERROR') return { chargeId: existing.id, created: false }

  const cents = computeCompetenceCents(client, client.services, year, month)
  if (cents <= 0) throw new Error('Nenhum serviço ativo válido nesta competência.')

  if (!client.asaasCustomerId) await syncCustomer(clientId)
  const fresh = await prisma.client.findUniqueOrThrow({ where: { id: clientId } })

  const dueDate = dueDateFor(year, month, fresh.paymentDay ?? 1)
  const billingType = fresh.billingType === 'PIX' ? 'PIX' : fresh.billingType === 'BOLETO' ? 'BOLETO' : 'UNDEFINED'
  const competencia = `${String(month).padStart(2, '0')}/${year}`
  const value = Number(centsToDecimalString(cents))

  // Reserva a linha ANTES do POST (unique segura corrida e duplo clique)
  const charge = existing ?? (await prisma.asaasCharge.create({
    data: {
      clientId, year, month, externalRef, billingType,
      value: new Prisma.Decimal(centsToDecimalString(cents)),
      dueDate: new Date(`${dueDate}T00:00:00Z`),
      status: 'PENDING',
    },
  }).catch(async () => {
    const raced = await prisma.asaasCharge.findUnique({ where: { externalRef } })
    if (raced) return raced
    throw new Error('Não foi possível registrar a cobrança.')
  }))
  if (charge.asaasId) return { chargeId: charge.id, created: false }

  try {
    // Resposta inconclusiva anterior? Consulta antes de repetir o POST
    let payment = await asaas.findPaymentByExternalRef(externalRef)
    if (!payment) {
      payment = await asaas.createPayment({
        customer: fresh.asaasCustomerId!,
        billingType,
        value,
        dueDate,
        description: `${fresh.fiscalDescription || 'Serviços de marketing'} — competência ${competencia}`,
        externalReference: externalRef,
      })
    }

    // Linha digitável/código de barras (boleto)
    let identificationField: string | null = null
    let barCode: string | null = null
    if (payment.billingType !== 'PIX') {
      const idf = await asaas.getIdentificationField(payment.id).catch(() => null)
      identificationField = idf?.identificationField ?? null
      barCode = idf?.barCode ?? null
    }

    await prisma.asaasCharge.update({
      where: { id: charge.id },
      data: {
        asaasId: payment.id,
        status: mapAsaasStatus(payment.status),
        billingType: payment.billingType ?? billingType,
        netValue: payment.netValue != null ? new Prisma.Decimal(String(payment.netValue)) : undefined,
        invoiceUrl: payment.invoiceUrl ?? null,
        bankSlipUrl: payment.bankSlipUrl ?? null,
        identificationField,
        barCode,
        lastError: null,
      },
    })

    // Fatura no e-mail do cliente (idempotente por cobrança; falha não
    // interrompe — a cobrança já existe e o cron reenvia lembretes)
    await notifyInvoiceIssued(charge.id).catch(() => {})
    return { chargeId: charge.id, created: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // TIMEOUT: mantém a linha para a próxima execução consultar por ref
    await prisma.asaasCharge.update({
      where: { id: charge.id },
      data: { status: msg === 'TIMEOUT' ? 'PENDING' : 'ERROR', lastError: msg.slice(0, 500) },
    })
    throw err
  }
}

export function mapAsaasStatus(s: string): string {
  const map: Record<string, string> = {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    RECEIVED: 'RECEIVED',
    RECEIVED_IN_CASH: 'RECEIVED',
    OVERDUE: 'OVERDUE',
    REFUNDED: 'REFUNDED',
    PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
    DELETED: 'DELETED',
    CANCELLED: 'CANCELLED',
  }
  return map[s] ?? s
}

/* ------------------------------ contabilização ------------------------------ */

/**
 * Receita: contabilizada UMA única vez por cobrança (CONFIRMED e RECEIVED
 * nunca somam duas receitas — o guarda é revenueBookedAt). A baixa marca os
 * ClientPayment pendentes da competência como pagos (mesmo caminho do resto
 * do financeiro); sem parcelas pendentes, cria uma paga com o valor bruto.
 */
export async function bookRevenue(chargeId: string) {
  const now = new Date()
  const locked = await prisma.asaasCharge.updateMany({
    where: { id: chargeId, revenueBookedAt: null },
    data: { revenueBookedAt: now },
  })
  if (locked.count === 0) return // já contabilizada

  const charge = await prisma.asaasCharge.findUniqueOrThrow({ where: { id: chargeId } })
  const pending = await prisma.clientPayment.findMany({
    where: { clientId: charge.clientId, year: charge.year, month: charge.month, status: 'PENDENTE' },
  })
  if (pending.length > 0) {
    await prisma.clientPayment.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: 'PAGO', paidAt: now, receivedAccount: 'Asaas' },
    })
  } else {
    await prisma.clientPayment.create({
      data: {
        clientId: charge.clientId,
        year: charge.year,
        month: charge.month,
        amount: Number(charge.value),
        dueDate: charge.dueDate,
        status: 'PAGO',
        paidAt: now,
        receivedAccount: 'Asaas',
      },
    })
  }
}

/** Tarifa do Asaas como custo do financeiro — também uma única vez. */
export async function bookFee(chargeId: string, fee: number | null | undefined) {
  if (fee == null || fee <= 0) return
  const locked = await prisma.asaasCharge.updateMany({
    where: { id: chargeId, feeBookedAt: null },
    data: { feeBookedAt: new Date(), fee: new Prisma.Decimal(String(fee)) },
  })
  if (locked.count === 0) return

  const charge = await prisma.asaasCharge.findUniqueOrThrow({ where: { id: chargeId } })
  const date = new Date()
  await prisma.financialEntry.create({
    data: {
      type: 'CUSTO',
      category: 'Tarifas Asaas',
      name: `Tarifa Asaas ${charge.externalRef}`,
      description: `Tarifa da cobrança ${charge.externalRef}`,
      amount: fee,
      date,
      dueDate: date,
      month: charge.month,
      year: charge.year,
      status: 'PAGO',
      paidAt: date,
      isPaid: true,
    },
  })
}

/* ---------------------------------- job ---------------------------------- */

/**
 * Job diário idempotente: gera cobranças dos clientes com cobrança
 * automática ativada, dentro da antecedência, sem retroativas, seguindo
 * mesmo quando um cliente falha.
 */
export async function runAsaasBillingJob(): Promise<{ created: number; skipped: number; errors: number }> {
  const { apiKey } = await asaas.getAsaasConfig()
  if (!apiKey) return { created: 0, skipped: 0, errors: 0 }

  const { date: today } = spNow()
  const [y, m] = today.split('-').map(Number)

  const clients = await prisma.client.findMany({
    where: { billingEnabled: true, status: 'ATIVO' },
    include: { services: true },
  })

  let created = 0
  let skipped = 0
  let errors = 0

  for (const client of clients) {
    try {
      // Competência do mês corrente e do próximo (antecedência pode cruzar o mês)
      for (const [yy, mm] of [[y, m], m === 12 ? [y + 1, 1] : [y, m + 1]] as Array<[number, number]>) {
        const cents = computeCompetenceCents(client, client.services, yy, mm)
        if (cents <= 0) { skipped++; continue }

        const due = dueDateFor(yy, mm, client.paymentDay ?? 1)
        if (!shouldGenerateNow(today, due, client.billingLeadDays ?? 10)) { skipped++; continue }

        const externalRef = chargeExternalRef(client.id, yy, mm)
        const exists = await prisma.asaasCharge.findUnique({ where: { externalRef } })
        if (exists && exists.asaasId) { skipped++; continue }

        const r = await ensureCharge(client.id, yy, mm)
        if (r.created) created++
        else skipped++
      }
    } catch (err) {
      errors++
      const error = (err instanceof Error ? err.message : String(err)).slice(0, 500)
      await prisma.integrationLog.create({
        data: { provider: 'ASAAS', action: 'billingJob', refId: client.id, ok: false, error },
      }).catch(() => {})
      // Aviso aos administradores (no máximo um por dia para esta operação)
      await alertAdmins({ provider: 'ASAAS', action: 'billingJob', refId: client.name, error }).catch(() => {})
    }
  }

  return { created, skipped, errors }
}

/* -------------------------------- webhook -------------------------------- */

/** Processa um evento de pagamento do Asaas (já persistido e deduplicado). */
export async function processAsaasEvent(event: string, payment: asaas.AsaasPayment) {
  const externalRef = payment.externalReference
  const charge = externalRef
    ? await prisma.asaasCharge.findUnique({ where: { externalRef } })
    : await prisma.asaasCharge.findUnique({ where: { asaasId: payment.id } })
  if (!charge) return // cobrança criada fora do sistema: ignorada

  const data: Record<string, unknown> = {
    status: mapAsaasStatus(payment.status),
    netValue: payment.netValue != null ? new Prisma.Decimal(String(payment.netValue)) : undefined,
    invoiceUrl: payment.invoiceUrl ?? undefined,
    bankSlipUrl: payment.bankSlipUrl ?? undefined,
    billingType: payment.billingType ?? undefined,
  }
  if (payment.confirmedDate) data.confirmedAt = new Date(payment.confirmedDate)
  if (payment.clientPaymentDate) data.paidAt = new Date(payment.clientPaymentDate)
  if (payment.creditDate) data.creditDate = new Date(payment.creditDate)
  if (event === 'PAYMENT_RECEIVED') data.receivedAt = new Date()

  await prisma.asaasCharge.update({ where: { id: charge.id }, data })

  // Estados "pago" (CONFIRMED) e "disponível" (RECEIVED) são separados,
  // mas a receita entra uma vez só — no primeiro dos dois que chegar
  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
    await bookRevenue(charge.id)
    if (payment.netValue != null) {
      const fee = Number(charge.value) - payment.netValue
      await bookFee(charge.id, Math.round(fee * 100) / 100)
    }
    // Recibo ao cliente — uma vez só (refId da cobrança)
    await notifyPaymentConfirmed(charge.id).catch(() => {})
    await maybeEmitForCharge(charge.id, event === 'PAYMENT_CONFIRMED' ? 'ON_CONFIRMED' : 'ON_RECEIVED').catch(() => {})
  }
}
