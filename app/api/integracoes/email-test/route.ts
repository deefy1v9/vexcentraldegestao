import { NextRequest, NextResponse } from 'next/server'
import { promises as dns } from 'dns'
import { requireAdmin } from '@/lib/api-auth'
import {
  sendMail, baseTemplate, MailNotConfiguredError, smtpConfigured,
  getSmtpConfig, addressOf, MailProfile,
} from '@/lib/mailer'

/**
 * Teste de e-mail do Diagnóstico (admin): envia uma mensagem real ao
 * endereço informado e devolve o resultado verdadeiro do provedor —
 * nunca sucesso falso. Também confere SPF/DMARC do domínio remetente.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const to = String(body.to ?? admin.email ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: 'Informe um e-mail de destino válido.' }, { status: 400 })
  }
  const profile: MailProfile = body.profile === 'contato' ? 'contato' : 'financeiro'

  const cfg = await getSmtpConfig(profile)
  const senderAddress = addressOf(cfg.from)
  const domain = senderAddress.split('@')[1] || 'vexgrowth.com.br'

  // DNS do domínio remetente (informativo — registros ficam no provedor DNS)
  const dnsReport = await checkDns(domain)

  if (!(await smtpConfigured(profile))) {
    return NextResponse.json({
      sent: false,
      error: new MailNotConfiguredError(profile).message,
      dns: dnsReport,
    }, { status: 409 })
  }

  try {
    const r = await sendMail({
      to,
      profile,
      subject: `Teste de envio (${profile}) — VEX Central de Gestão`,
      html: baseTemplate(
        'Teste de envio de e-mail',
        `<p>Este é um teste do sistema de e-mail transacional.</p>
         <p>Remetente testado: <strong>${cfg.from}</strong>.</p>
         <p>Solicitado por <strong>${admin.name}</strong> em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</p>
         <p>Se você recebeu esta mensagem, a entrega pelo provedor está funcionando.</p>`,
        senderAddress,
      ),
      kind: 'diagnostico',
    })
    return NextResponse.json({
      sent: r.sent, providerResponse: r.providerResponse, from: r.from, profile, dns: dnsReport,
    })
  } catch (err) {
    const msg = err instanceof MailNotConfiguredError
      ? err.message
      : err instanceof Error ? err.message : 'Falha no envio.'
    return NextResponse.json({ sent: false, error: msg, dns: dnsReport }, { status: 502 })
  }
}

/**
 * Confere os registros de autenticação do domínio remetente. O DKIM é
 * procurado nos seletores mais comuns (Google Workspace usa `google`);
 * como o seletor é escolhido pelo provedor, a ausência aqui é um alerta,
 * não uma prova de que não existe.
 */
const DKIM_SELECTORS = ['google', 'default', 'selector1', 'hostinger', 'mail']

async function checkDns(domain: string) {
  const report: { spf: boolean; dkim: boolean; dkimSelector: string | null; dmarc: boolean; missing: string[] } =
    { spf: false, dkim: false, dkimSelector: null, dmarc: false, missing: [] }
  try {
    const txt = await dns.resolveTxt(domain).catch(() => [] as string[][])
    report.spf = txt.some((r) => r.join('').toLowerCase().includes('v=spf1'))
  } catch { /* domínio sem TXT */ }
  try {
    const dmarc = await dns.resolveTxt(`_dmarc.${domain}`).catch(() => [] as string[][])
    report.dmarc = dmarc.some((r) => r.join('').toLowerCase().includes('v=dmarc1'))
  } catch { /* sem DMARC */ }

  for (const sel of DKIM_SELECTORS) {
    const txt = await dns.resolveTxt(`${sel}._domainkey.${domain}`).catch(() => [] as string[][])
    if (txt.some((r) => r.join('').toLowerCase().includes('v=dkim1'))) {
      report.dkim = true
      report.dkimSelector = sel
      break
    }
  }

  if (!report.spf) report.missing.push(`TXT em ${domain}: v=spf1 include:<provedor SMTP> ~all`)
  if (!report.dkim) {
    report.missing.push(
      `DKIM ausente: gere a chave no provedor (Google Admin → Apps → Gmail → Autenticar e-mail) e publique o TXT do seletor (ex.: google._domainkey.${domain})`,
    )
  }
  if (!report.dmarc) report.missing.push(`TXT em _dmarc.${domain}: v=DMARC1; p=none; rua=mailto:financeiro@${domain}`)
  return report
}
