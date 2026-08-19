import { NextRequest, NextResponse } from 'next/server'
import { promises as dns } from 'dns'
import { requireAdmin } from '@/lib/api-auth'
import { sendMail, baseTemplate, MailNotConfiguredError, smtpConfigured } from '@/lib/mailer'

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

  // DNS do domínio remetente (informativo — registros ficam no provedor DNS)
  const dnsReport = await checkDns('vexgrowth.com.br')

  if (!(await smtpConfigured())) {
    return NextResponse.json({
      sent: false,
      error: 'SMTP não configurado. Grave SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no servidor (nunca no chat/código).',
      dns: dnsReport,
    }, { status: 409 })
  }

  try {
    const r = await sendMail({
      to,
      subject: 'Teste de envio — VEX Central de Gestão',
      html: baseTemplate(
        'Teste de envio de e-mail',
        `<p>Este é um teste do sistema de e-mail transacional.</p>
         <p>Solicitado por <strong>${admin.name}</strong> em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</p>
         <p>Se você recebeu esta mensagem, a entrega pelo provedor está funcionando.</p>`,
      ),
      kind: 'diagnostico',
    })
    return NextResponse.json({ sent: r.sent, providerResponse: r.providerResponse, dns: dnsReport })
  } catch (err) {
    const msg = err instanceof MailNotConfiguredError
      ? err.message
      : err instanceof Error ? err.message : 'Falha no envio.'
    return NextResponse.json({ sent: false, error: msg, dns: dnsReport }, { status: 502 })
  }
}

async function checkDns(domain: string) {
  const report: { spf: boolean; dmarc: boolean; missing: string[] } = { spf: false, dmarc: false, missing: [] }
  try {
    const txt = await dns.resolveTxt(domain).catch(() => [] as string[][])
    report.spf = txt.some((r) => r.join('').toLowerCase().includes('v=spf1'))
  } catch { /* domínio sem TXT */ }
  try {
    const dmarc = await dns.resolveTxt(`_dmarc.${domain}`).catch(() => [] as string[][])
    report.dmarc = dmarc.some((r) => r.join('').toLowerCase().includes('v=dmarc1'))
  } catch { /* sem DMARC */ }
  if (!report.spf) report.missing.push(`TXT em ${domain}: v=spf1 include:<provedor SMTP> ~all`)
  if (!report.dmarc) report.missing.push(`TXT em _dmarc.${domain}: v=DMARC1; p=none; rua=mailto:financeiro@${domain}`)
  report.missing.push('DKIM: habilitar no provedor SMTP e publicar o CNAME/TXT do seletor indicado por ele')
  return report
}
