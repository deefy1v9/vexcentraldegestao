import { prisma } from './prisma'
import { sendMail, smtpConfigured } from './mailer'
import { spNow } from './billing-whatsapp'
import { missingNfseFields } from './billing-core'
import * as T from './email-templates'

/**
 * Disparo dos e-mails do sistema (clientes e administradores).
 *
 * Regras:
 * - O Asaas só gera boleto/Pix e a Focus só emite a nota — quem fala com o
 *   cliente é o sistema, sempre no mesmo layout.
 * - Cada aviso automático é idempotente pelo par (kind, refId) registrado em
 *   IntegrationLog: nunca chega duas vezes para a mesma cobrança/nota.
 * - Nada aqui lança para o chamador: falha de e-mail nunca derruba cobrança,
 *   webhook ou cron — fica registrada no log.
 */

function competencia(year: number, month: number) {
  return `${String(month).padStart(2, '0')}/${year}`
}

/** Destinatários do cliente: e-mail financeiro (ou geral) + adicionais. */
function clientRecipients(c: { billingEmail: string | null; email: string | null; extraEmails: string | null }): string | null {
  const main = (c.billingEmail || c.email || '').trim()
  if (!main) return null
  const extras = (c.extraEmails || '').split(',').map((e) => e.trim()).filter(Boolean)
  return [main, ...extras].join(', ')
}

async function adminRecipients(): Promise<string | null> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { email: true },
  })
  const list = admins.map((a) => a.email).filter(Boolean)
  return list.length > 0 ? list.join(', ') : null
}

async function deliver(mail: T.RenderedMail, to: string, refId?: string): Promise<boolean> {
  try {
    if (!(await smtpConfigured(mail.profile))) return false
    const r = await sendMail({ to, subject: mail.subject, html: mail.html, profile: mail.profile, kind: mail.kind, refId })
    return r.sent
  } catch (err) {
    console.error(`[email] ${mail.kind} falhou:`, err instanceof Error ? err.message : err)
    return false
  }
}

/* ------------------------------- cobranças ------------------------------- */

async function chargeData(chargeId: string) {
  const charge = await prisma.asaasCharge.findUnique({ where: { id: chargeId }, include: { client: true } })
  if (!charge) return null
  const to = clientRecipients(charge.client)
  if (!to) return null
  const data: T.ChargeMailData = {
    clientName: charge.client.legalName || charge.client.name,
    competencia: competencia(charge.year, charge.month),
    value: Number(charge.value),
    dueDate: charge.dueDate,
    billingType: charge.billingType,
    invoiceUrl: charge.invoiceUrl,
    bankSlipUrl: charge.bankSlipUrl,
    identificationField: charge.identificationField,
    paidAt: charge.paidAt ?? charge.confirmedAt ?? null,
  }
  return { charge, to, data }
}

/** Fatura disponível — logo após a cobrança ser criada no Asaas. */
export async function notifyInvoiceIssued(chargeId: string): Promise<boolean> {
  const c = await chargeData(chargeId)
  if (!c || !c.charge.asaasId) return false
  return deliver(T.invoiceIssued(c.data), c.to, `charge:${chargeId}`)
}

/** Recibo — na primeira confirmação de pagamento. */
export async function notifyPaymentConfirmed(chargeId: string): Promise<boolean> {
  const c = await chargeData(chargeId)
  if (!c) return false
  return deliver(T.paymentConfirmed(c.data), c.to, `charge:${chargeId}`)
}

/* --------------------------------- NFS-e --------------------------------- */

async function nfseData(invoiceId: string) {
  const inv = await prisma.nfseInvoice.findUnique({
    where: { id: invoiceId },
    include: { charge: { include: { client: true } } },
  })
  if (!inv) return null
  const to = clientRecipients(inv.charge.client)
  if (!to) return null
  const data: T.NfseMailData = {
    clientName: inv.charge.client.legalName || inv.charge.client.name,
    competencia: competencia(inv.charge.year, inv.charge.month),
    value: Number(inv.charge.value),
    numero: inv.numero,
    codigoVerificacao: inv.codigoVerificacao,
    pdfUrl: inv.pdfUrl,
    xmlUrl: inv.xmlUrl,
    issuedAt: inv.issuedAt,
  }
  return { inv, to, data }
}

export async function notifyNfseIssued(invoiceId: string): Promise<boolean> {
  const n = await nfseData(invoiceId)
  if (!n || n.inv.status !== 'AUTORIZADO') return false
  const ok = await deliver(T.nfseIssued(n.data), n.to, `nfse:${invoiceId}`)
  if (ok) {
    await prisma.nfseInvoice.update({
      where: { id: invoiceId },
      data: { emailSentAt: new Date(), emailRecipients: n.to, emailAttempts: { increment: 1 }, emailError: null },
    }).catch(() => {})
  }
  return ok
}

export async function notifyNfseCancelled(invoiceId: string, reason: string): Promise<boolean> {
  const n = await nfseData(invoiceId)
  if (!n) return false
  return deliver(T.nfseCancelled({ ...n.data, reason }), n.to, `nfse:${invoiceId}`)
}

/* ------------------------------ por cliente ------------------------------ */

export type ClientMailKind = 'welcome' | 'complete-profile' | 'contract-ending' | 'announcement'

/**
 * Envio manual pelo perfil do cliente. Sem refId: o administrador decide
 * quando (re)enviar — a exceção é o aviso de contrato, que também roda no cron
 * com refId próprio.
 */
export async function sendClientEmail(
  clientId: string,
  kind: ClientMailKind,
  extra?: { title?: string; message?: string; ctaLabel?: string; ctaUrl?: string },
): Promise<{ sent: boolean; error?: string }> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, include: { services: true } })
  if (!client) return { sent: false, error: 'Cliente não encontrado.' }
  const to = clientRecipients(client)
  if (!to) return { sent: false, error: 'Cliente sem e-mail cadastrado.' }

  const name = client.legalName || client.name
  let mail: T.RenderedMail
  if (kind === 'welcome') {
    mail = T.welcome({
      clientName: name,
      services: client.services.map((s) => s.serviceName),
      paymentDay: client.paymentDay,
    })
  } else if (kind === 'complete-profile') {
    const missing = missingNfseFields(client)
    if (missing.length === 0) return { sent: false, error: 'O cadastro fiscal deste cliente já está completo.' }
    mail = T.completeProfile({ clientName: name, missing })
  } else if (kind === 'contract-ending') {
    if (!client.contractEnd) return { sent: false, error: 'Cliente sem data de término de contrato.' }
    const days = Math.max(0, Math.round((client.contractEnd.getTime() - Date.now()) / 86_400_000))
    mail = T.contractEnding({ clientName: name, contractEnd: client.contractEnd, daysLeft: days })
  } else {
    const title = (extra?.title ?? '').trim()
    const message = (extra?.message ?? '').trim()
    if (!title || !message) return { sent: false, error: 'Informe título e mensagem.' }
    mail = T.announcement({ clientName: name, title, message, ctaLabel: extra?.ctaLabel, ctaUrl: extra?.ctaUrl })
  }

  if (!(await smtpConfigured(mail.profile))) return { sent: false, error: 'E-mail não configurado no servidor.' }
  try {
    const r = await sendMail({ to, subject: mail.subject, html: mail.html, profile: mail.profile, kind: mail.kind })
    return { sent: r.sent }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'Falha no envio.' }
  }
}

/* ------------------------------ administradores ------------------------------ */

/** Alerta de falha — no máximo um por integração/operação por dia. */
export async function alertAdmins(d: Omit<T.AlertData, 'when'>): Promise<boolean> {
  const to = await adminRecipients()
  if (!to) return false
  const { date, time } = spNow()
  const [y, m, day] = date.split('-')
  const mail = T.integrationAlert({ ...d, when: `${day}/${m}/${y} ${time}` })
  return deliver(mail, to, `${d.provider}:${d.action}:${date}`)
}

/* ---------------------------------- cron ---------------------------------- */

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(Number(fromIso.slice(0, 4)), Number(fromIso.slice(5, 7)) - 1, Number(fromIso.slice(8, 10)))
  const b = Date.UTC(Number(toIso.slice(0, 4)), Number(toIso.slice(5, 7)) - 1, Number(toIso.slice(8, 10)))
  return Math.round((b - a) / 86_400_000)
}

/**
 * Rotina diária: lembretes (D-3, D0), atraso (D+1, D+7, D+15), contrato a
 * vencer (30 dias) e resumo para os administradores. Cada aviso sai uma vez
 * só por cobrança/cliente (refId), nunca retroativo além do estágio atual.
 */
export async function runBillingEmails(): Promise<{ sent: number; skipped: number }> {
  if (!(await smtpConfigured('financeiro'))) return { sent: 0, skipped: 0 }

  const { date: today } = spNow()
  let sent = 0
  let skipped = 0

  // Cobranças abertas com boleto/Pix já gerado
  const open = await prisma.asaasCharge.findMany({
    where: { status: { in: ['PENDING', 'OVERDUE'] }, asaasId: { not: null } },
    include: { client: true },
  })

  for (const charge of open) {
    const to = clientRecipients(charge.client)
    if (!to || charge.client.status !== 'ATIVO') { skipped++; continue }
    const due = charge.dueDate.toISOString().slice(0, 10)
    const diff = daysBetween(today, due) // >0 antes do vencimento, <0 atrasado
    const data: T.ChargeMailData = {
      clientName: charge.client.legalName || charge.client.name,
      competencia: competencia(charge.year, charge.month),
      value: Number(charge.value),
      dueDate: charge.dueDate,
      billingType: charge.billingType,
      invoiceUrl: charge.invoiceUrl,
      bankSlipUrl: charge.bankSlipUrl,
      identificationField: charge.identificationField,
      daysLate: diff < 0 ? -diff : 0,
    }

    let mail: T.RenderedMail | null = null
    if (diff === 3) mail = T.dueSoon(data)
    else if (diff === 0) mail = T.dueToday(data)
    else if (diff <= -15) mail = T.overdue(data, 15)
    else if (diff <= -7) mail = T.overdue(data, 7)
    else if (diff <= -1) mail = T.overdue(data, 1)

    if (!mail) { skipped++; continue }
    const ok = await deliver(mail, to, `charge:${charge.id}`)
    if (ok) sent++
    else skipped++
  }

  // Contrato terminando em 30 dias (uma vez por data de término)
  const in30 = new Date(Date.now() + 30 * 86_400_000)
  const ending = await prisma.client.findMany({
    where: { status: 'ATIVO', contractEnd: { gte: new Date(), lte: in30 } },
  })
  for (const client of ending) {
    const to = clientRecipients(client)
    if (!to || !client.contractEnd) { skipped++; continue }
    const days = Math.max(0, Math.round((client.contractEnd.getTime() - Date.now()) / 86_400_000))
    const mail = T.contractEnding({ clientName: client.legalName || client.name, contractEnd: client.contractEnd, daysLeft: days })
    const ok = await deliver(mail, to, `client:${client.id}:${client.contractEnd.toISOString().slice(0, 10)}`)
    if (ok) sent++
    else skipped++
  }

  // Resumo diário para os administradores — só quando houve movimento
  const since = new Date(Date.now() - 24 * 3600 * 1000)
  const [created, paidRows, overdueRows, nfseCount, errorRows] = await Promise.all([
    prisma.asaasCharge.count({ where: { createdAt: { gte: since }, asaasId: { not: null } } }),
    prisma.asaasCharge.findMany({ where: { revenueBookedAt: { gte: since } }, select: { value: true } }),
    prisma.asaasCharge.findMany({
      where: { status: { in: ['PENDING', 'OVERDUE'] }, asaasId: { not: null }, dueDate: { lt: new Date(`${today}T00:00:00Z`) } },
      select: { value: true },
    }),
    prisma.nfseInvoice.count({ where: { issuedAt: { gte: since } } }),
    prisma.integrationLog.findMany({
      where: { ok: false, createdAt: { gte: since }, provider: { in: ['ASAAS', 'FOCUS', 'EMAIL'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { provider: true, action: true, error: true },
    }),
  ])
  const hasActivity = created + paidRows.length + overdueRows.length + nfseCount + errorRows.length > 0
  if (hasActivity) {
    const to = await adminRecipients()
    if (to) {
      const [y, m, d] = today.split('-')
      const mail = T.adminDigest({
        date: `${d}/${m}/${y}`,
        created,
        paid: paidRows.length,
        paidValue: paidRows.reduce((s, r) => s + Number(r.value), 0),
        overdue: overdueRows.length,
        overdueValue: overdueRows.reduce((s, r) => s + Number(r.value), 0),
        nfse: nfseCount,
        errors: errorRows.map((e) => ({ provider: e.provider, action: e.action, error: e.error ?? '' })),
      })
      const ok = await deliver(mail, to, `digest:${today}`)
      if (ok) sent++
    }
  }

  return { sent, skipped }
}
