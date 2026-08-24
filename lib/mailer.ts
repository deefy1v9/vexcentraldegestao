import nodemailer from 'nodemailer'
import { prisma } from './prisma'
import { getSettings } from './settings'

/**
 * E-mail transacional do sistema — exclusivo do backend.
 *
 * Remetente padrão financeiro: "VEX Growth Financeiro
 * <financeiro@vexgrowth.com.br>" com Reply-To igual. Credenciais SMTP vivem
 * em SystemSettings/env (SMTP_HOST/PORT/USER/PASS/SECURE) e nunca aparecem
 * em logs, GET ou frontend. Envio registrado em IntegrationLog com o
 * destinatário mascarado; `refId` dá idempotência (mesmo ref não reenvia).
 *
 * Importante: o Asaas envia as próprias notificações de cobrança e a Focus
 * envia a NFS-e autorizada — este mailer NÃO duplica esses envios; serve a
 * comunicações próprias do sistema e ao teste de entrega do Diagnóstico.
 */

export const MAIL_FROM = 'VEX Growth Financeiro <financeiro@vexgrowth.com.br>'
export const MAIL_REPLY_TO = 'financeiro@vexgrowth.com.br'

async function getSmtpConfig() {
  const s = await getSettings(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE'])
  const host = s.SMTP_HOST || process.env.SMTP_HOST || ''
  const port = Number(s.SMTP_PORT || process.env.SMTP_PORT || 587)
  const user = s.SMTP_USER || process.env.SMTP_USER || ''
  const pass = s.SMTP_PASS || process.env.SMTP_PASS || ''
  const secure = (s.SMTP_SECURE || process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')) === 'true'
  return { host, port, user, pass, secure, configured: !!(host && user && pass) }
}

export async function smtpConfigured(): Promise<boolean> {
  return (await getSmtpConfig()).configured
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 2)}***@${domain}`
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super('SMTP não configurado. Grave SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS nas configurações do servidor.')
  }
}

/**
 * Envia um e-mail. `refId` (opcional) garante idempotência: se já houver um
 * envio OK registrado com a mesma referência, não reenvia.
 * Devolve o resultado REAL do provedor — nunca sucesso falso.
 */
export async function sendMail(opts: {
  to: string
  subject: string
  html: string
  refId?: string
  kind?: string
}): Promise<{ sent: boolean; skipped?: boolean; providerResponse?: string }> {
  const cfg = await getSmtpConfig()
  if (!cfg.configured) throw new MailNotConfiguredError()

  if (opts.refId) {
    const already = await prisma.integrationLog.findFirst({
      where: { provider: 'EMAIL', action: opts.kind ?? 'send', refId: opts.refId, ok: true },
    })
    if (already) return { sent: false, skipped: true }
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 20_000,
  })

  try {
    const info = await transporter.sendMail({
      from: MAIL_FROM,
      replyTo: MAIL_REPLY_TO,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    })
    await prisma.integrationLog.create({
      data: {
        provider: 'EMAIL',
        action: opts.kind ?? 'send',
        refId: opts.refId ?? maskEmail(opts.to),
        ok: true,
        error: `aceito pelo provedor para ${maskEmail(opts.to)} (${String(info.response ?? '').slice(0, 120)})`,
      },
    }).catch(() => {})
    return { sent: true, providerResponse: String(info.response ?? '') }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.integrationLog.create({
      data: {
        provider: 'EMAIL',
        action: opts.kind ?? 'send',
        refId: opts.refId ?? maskEmail(opts.to),
        ok: false,
        error: msg.slice(0, 400),
      },
    }).catch(() => {})
    throw new Error(`Falha no envio: ${msg.slice(0, 200)}`)
  }
}

/** Template base responsivo (Gmail/Outlook): tabela simples, cores da marca. */
export function baseTemplate(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#0B1630;padding:20px 24px">
          <span style="color:#F74A13;font-size:20px;font-weight:bold;letter-spacing:1px">VEX</span>
          <span style="color:#ffffff;font-size:13px;margin-left:8px">Central de Gestão</span>
        </td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 12px;font-size:18px;color:#0B1630">${title}</h1>
          <div style="font-size:14px;color:#374151;line-height:1.6">${bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #eef0f5">
          <p style="margin:0;font-size:12px;color:#9ca3af">VEX Growth · financeiro@vexgrowth.com.br</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
