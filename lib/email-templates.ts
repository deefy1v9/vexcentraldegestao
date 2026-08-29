/**
 * Modelos de e-mail do sistema — módulo puro (sem Prisma, sem I/O), para ser
 * renderizado em qualquer lugar: envio real, preview de teste e testes.
 *
 * Layout único: cabeçalho escuro com degradê e logo (imagem hospedada no
 * próprio sistema), título, texto curto, bloco de detalhes, botão, linha de
 * ajuda e rodapé. Tabelas e estilos inline — renderiza igual em Gmail,
 * Outlook e Apple Mail.
 *
 * Dois remetentes: `financeiro` (fatura, lembretes, atraso, recibo, nota) e
 * `contato` (boas-vindas, cadastro, contrato, comunicados, avisos internos).
 */

export type MailProfile = 'contato' | 'financeiro'

export interface RenderedMail {
  kind: string
  subject: string
  html: string
  profile: MailProfile
}

const APP_URL = (process.env.NEXTAUTH_URL || 'https://central.vexgrowth.com.br').replace(/\/$/, '')
const SITE_URL = 'https://vexgrowth.com.br'
const HEADER_IMG = `${APP_URL}/email/header.png`
const CONTATO = 'contato@vexgrowth.com.br'
const FINANCEIRO = 'financeiro@vexgrowth.com.br'
const LEGAL = 'VEX GROWTH LTDA · CNPJ 68.652.648/0001-86 · Osasco/SP'

const C = {
  navy: '#030A8C',
  text: '#111827',
  muted: '#6B7280',
  line: '#D1D5DB',
  boxBg: '#F5F6FA',
  red: '#DC2626',
  green: '#059669',
}
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/* --------------------------------- utils --------------------------------- */

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

export function brl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

/** "2026-08-21" | Date → "21/08/2026" (sem fuso — a data é a data). */
export function dateBR(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const iso = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
  const [y, m, day] = iso.split('-')
  return `${day}/${m}/${y}`
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, '<br>')
}

/* -------------------------------- layout -------------------------------- */

interface LayoutOpts {
  title: string
  intro: string // texto simples (escapado aqui)
  preheader?: string
  badge?: { text: string; color: string }
  details?: Array<[string, string]> // valores já em HTML seguro
  ctas?: Array<{ label: string; url: string; secondary?: boolean }>
  extraHtml?: string
  help: string // HTML permitido (links)
  footerEmail: string
}

function button(label: string, url: string, secondary?: boolean): string {
  const bg = secondary ? '#FFFFFF' : C.navy
  const color = secondary ? C.navy : '#FFFFFF'
  const border = secondary ? `1px solid ${C.navy}` : `1px solid ${C.navy}`
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:6px 6px 0;">
    <tr><td style="border-radius:10px;background:${bg};border:${border};">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:15px;font-weight:600;color:${color};text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
    </td></tr></table>`
}

export function renderLayout(o: LayoutOpts): string {
  const details = o.details && o.details.length > 0
    ? `<tr><td style="padding:20px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.boxBg};border-radius:12px;">
          ${o.details.map(([k, v], i) => `<tr>
            <td style="padding:${i === 0 ? 14 : 8}px 18px ${i === o.details!.length - 1 ? 14 : 8}px;font-family:${FONT};font-size:13px;color:${C.muted};width:42%;">${escapeHtml(k)}</td>
            <td style="padding:${i === 0 ? 14 : 8}px 18px ${i === o.details!.length - 1 ? 14 : 8}px;font-family:${FONT};font-size:14px;color:${C.text};font-weight:600;text-align:right;">${v}</td>
          </tr>`).join('')}
        </table>
      </td></tr>`
    : ''

  const ctas = o.ctas && o.ctas.length > 0
    ? `<tr><td align="center" style="padding:22px 40px 0;">${o.ctas.map((c) => button(c.label, c.url, c.secondary)).join('')}</td></tr>`
    : ''

  const badge = o.badge
    ? `<span style="display:inline-block;margin-bottom:12px;padding:4px 12px;border-radius:999px;background:${o.badge.color}1A;color:${o.badge.color};font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.3px;">${escapeHtml(o.badge.text)}</span><br>`
    : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(o.title)}</title>
</head>
<body style="margin:0;padding:0;background:#F5F6FA;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(o.preheader ?? o.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FA;">
<tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:18px;overflow:hidden;border:1px solid #E9EBF2;">
    <tr><td style="padding:0;line-height:0;background:#05081A;">
      <img src="${HEADER_IMG}" width="600" alt="VEX Growth" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
    </td></tr>
    <tr><td align="center" style="padding:16px 40px 0;">
      ${badge}
      <h1 style="margin:0 0 12px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${C.text};">${escapeHtml(o.title)}</h1>
      <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.muted};">${escapeHtml(o.intro)}</p>
    </td></tr>
    ${details}
    ${ctas}
    ${o.extraHtml ? `<tr><td style="padding:20px 40px 0;font-family:${FONT};font-size:14px;line-height:1.65;color:${C.text};">${o.extraHtml}</td></tr>` : ''}
    <tr><td style="padding:30px 40px 0;"><div style="border-top:1px dashed ${C.line};height:0;line-height:0;">&nbsp;</div></td></tr>
    <tr><td align="center" style="padding:22px 40px 6px;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.muted};">${o.help}</td></tr>
    <tr><td align="center" style="padding:8px 40px 34px;font-family:${FONT};font-size:13px;">
      <a href="${SITE_URL}" style="color:${C.muted};text-decoration:underline;">vexgrowth.com.br</a>
    </td></tr>
  </table>
  <p style="margin:16px 0 0;font-family:${FONT};font-size:11px;line-height:1.5;color:#9CA3AF;text-align:center;">${LEGAL}<br>Este e-mail foi enviado por ${escapeHtml(o.footerEmail)}.</p>
</td></tr>
</table>
</body>
</html>`
}

const helpFinanceiro = `Dúvidas sobre a cobrança? Responda este e-mail ou escreva para <a href="mailto:${FINANCEIRO}" style="color:${C.text};font-weight:600;text-decoration:none;">${FINANCEIRO}</a>`
const helpContato = `Precisa de algo? Responda este e-mail ou fale com a equipe em <a href="mailto:${CONTATO}" style="color:${C.text};font-weight:600;text-decoration:none;">${CONTATO}</a>`

/* ------------------------------ dados de entrada ------------------------------ */

export interface ChargeMailData {
  clientName: string
  competencia: string // "08/2026"
  value: number
  dueDate: string | Date
  billingType?: string | null // BOLETO | PIX | UNDEFINED
  invoiceUrl?: string | null
  bankSlipUrl?: string | null
  identificationField?: string | null
  paidAt?: string | Date | null
  daysLate?: number
}

export interface NfseMailData {
  clientName: string
  competencia: string
  value: number
  numero?: string | null
  codigoVerificacao?: string | null
  pdfUrl?: string | null
  xmlUrl?: string | null
  issuedAt?: string | Date | null
  reason?: string | null
}

export interface ClientMailData {
  clientName: string
  services?: string[]
  paymentDay?: number | null
  missing?: string[]
  contractEnd?: string | Date | null
  daysLeft?: number
}

export interface AnnouncementData {
  clientName: string
  title: string
  message: string
  ctaLabel?: string
  ctaUrl?: string
}

export interface DigestData {
  date: string // "29/08/2026"
  created: number
  paid: number
  paidValue: number
  overdue: number
  overdueValue: number
  nfse: number
  errors: Array<{ provider: string; action: string; error: string }>
}

export interface AlertData {
  provider: string
  action: string
  error: string
  refId?: string | null
  when: string
}

function paymentLabel(t?: string | null): string {
  return t === 'PIX' ? 'Pix' : t === 'BOLETO' ? 'Boleto bancário' : 'Boleto ou Pix'
}

function chargeDetails(d: ChargeMailData): Array<[string, string]> {
  return [
    ['Competência', escapeHtml(d.competencia)],
    ['Valor', escapeHtml(brl(d.value))],
    ['Vencimento', escapeHtml(dateBR(d.dueDate))],
    ['Pagamento', escapeHtml(paymentLabel(d.billingType))],
  ]
}

function payCtas(d: ChargeMailData) {
  const ctas: LayoutOpts['ctas'] = []
  if (d.invoiceUrl) ctas.push({ label: 'Pagar agora', url: d.invoiceUrl })
  if (d.bankSlipUrl && d.billingType !== 'PIX') ctas.push({ label: 'Ver boleto', url: d.bankSlipUrl, secondary: true })
  return ctas
}

function linhaDigitavel(d: ChargeMailData): string {
  if (!d.identificationField || d.billingType === 'PIX') return ''
  return `<p style="margin:0 0 6px;font-size:12px;color:${C.muted};text-align:center;">Linha digitável</p>
  <p style="margin:0;padding:12px 14px;background:${C.boxBg};border-radius:10px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:13px;letter-spacing:.3px;color:${C.text};text-align:center;word-break:break-all;">${escapeHtml(d.identificationField)}</p>`
}

/* ------------------------------- financeiro ------------------------------- */

export function invoiceIssued(d: ChargeMailData): RenderedMail {
  return {
    kind: 'invoice-issued',
    profile: 'financeiro',
    subject: `Sua fatura de ${d.competencia} está disponível — VEX Growth`,
    html: renderLayout({
      title: 'Sua fatura chegou',
      intro: `Olá, ${d.clientName}. A fatura dos serviços de ${d.competencia} já está disponível, com vencimento em ${dateBR(d.dueDate)}.`,
      details: chargeDetails(d),
      ctas: payCtas(d),
      extraHtml: linhaDigitavel(d),
      help: helpFinanceiro,
      footerEmail: FINANCEIRO,
    }),
  }
}

export function dueSoon(d: ChargeMailData): RenderedMail {
  return {
    kind: 'due-soon',
    profile: 'financeiro',
    subject: `Lembrete: fatura de ${d.competencia} vence em 3 dias`,
    html: renderLayout({
      title: 'Sua fatura vence em 3 dias',
      intro: `Olá, ${d.clientName}. Passando para lembrar que a fatura de ${d.competencia} vence em ${dateBR(d.dueDate)}. Se já pagou, pode desconsiderar.`,
      details: chargeDetails(d),
      ctas: payCtas(d),
      extraHtml: linhaDigitavel(d),
      help: helpFinanceiro,
      footerEmail: FINANCEIRO,
    }),
  }
}

export function dueToday(d: ChargeMailData): RenderedMail {
  return {
    kind: 'due-today',
    profile: 'financeiro',
    subject: `Sua fatura de ${d.competencia} vence hoje`,
    html: renderLayout({
      title: 'Vence hoje',
      intro: `Olá, ${d.clientName}. A fatura de ${d.competencia} vence hoje, ${dateBR(d.dueDate)}. Pagando até o fim do dia, fica tudo em dia.`,
      badge: { text: 'VENCE HOJE', color: '#D97706' },
      details: chargeDetails(d),
      ctas: payCtas(d),
      extraHtml: linhaDigitavel(d),
      help: helpFinanceiro,
      footerEmail: FINANCEIRO,
    }),
  }
}

export function overdue(d: ChargeMailData, stage: 1 | 7 | 15): RenderedMail {
  const copy = {
    1: {
      subject: `Fatura de ${d.competencia} em aberto`,
      title: 'Ainda não identificamos o pagamento',
      intro: `Olá, ${d.clientName}. A fatura de ${d.competencia} venceu em ${dateBR(d.dueDate)} e ainda consta em aberto. Se já pagou, desconsidere — a compensação pode levar até 2 dias úteis.`,
      badge: 'EM ABERTO',
    },
    7: {
      subject: `Fatura de ${d.competencia} vencida há 7 dias`,
      title: 'Fatura vencida há 7 dias',
      intro: `Olá, ${d.clientName}. A fatura de ${d.competencia} venceu em ${dateBR(d.dueDate)} e segue pendente. O mesmo boleto continua válido — regularize para mantermos tudo em dia. Se precisar de ajuda, é só responder.`,
      badge: 'VENCIDA',
    },
    15: {
      subject: `Fatura de ${d.competencia} vencida há 15 dias — ação necessária`,
      title: 'Última notificação',
      intro: `Olá, ${d.clientName}. A fatura de ${d.competencia} está vencida desde ${dateBR(d.dueDate)}. Sem o pagamento, os serviços podem ser pausados até a regularização. Se precisar de uma condição especial, responda este e-mail — vamos resolver juntos.`,
      badge: 'AÇÃO NECESSÁRIA',
    },
  }[stage]

  return {
    kind: `overdue-${stage}`,
    profile: 'financeiro',
    subject: copy.subject,
    html: renderLayout({
      title: copy.title,
      intro: copy.intro,
      badge: { text: copy.badge, color: C.red },
      details: [...chargeDetails(d), ['Dias em atraso', escapeHtml(String(d.daysLate ?? stage))]],
      ctas: payCtas(d),
      extraHtml: linhaDigitavel(d),
      help: helpFinanceiro,
      footerEmail: FINANCEIRO,
    }),
  }
}

export function paymentConfirmed(d: ChargeMailData): RenderedMail {
  return {
    kind: 'payment-confirmed',
    profile: 'financeiro',
    subject: `Pagamento confirmado — ${d.competencia}`,
    html: renderLayout({
      title: 'Pagamento recebido 🎉',
      intro: `Obrigado, ${d.clientName}! Confirmamos o pagamento da fatura de ${d.competencia}. A nota fiscal será enviada em breve por este mesmo e-mail.`,
      badge: { text: 'PAGO', color: C.green },
      details: [
        ['Competência', escapeHtml(d.competencia)],
        ['Valor', escapeHtml(brl(d.value))],
        ['Pago em', escapeHtml(dateBR(d.paidAt ?? new Date()))],
        ['Pagamento', escapeHtml(paymentLabel(d.billingType))],
      ],
      ctas: d.invoiceUrl ? [{ label: 'Ver comprovante', url: d.invoiceUrl, secondary: true }] : [],
      help: helpFinanceiro,
      footerEmail: FINANCEIRO,
    }),
  }
}

export function nfseIssued(d: NfseMailData): RenderedMail {
  const ctas: LayoutOpts['ctas'] = []
  if (d.pdfUrl) ctas.push({ label: 'Baixar PDF', url: d.pdfUrl })
  if (d.xmlUrl) ctas.push({ label: 'Baixar XML', url: d.xmlUrl, secondary: true })
  return {
    kind: 'nfse-issued',
    profile: 'financeiro',
    subject: `Nota fiscal ${d.numero ? `nº ${d.numero} ` : ''}— competência ${d.competencia}`,
    html: renderLayout({
      title: 'Sua nota fiscal foi emitida',
      intro: `Olá, ${d.clientName}. A NFS-e referente aos serviços de ${d.competencia} foi autorizada. O PDF e o XML estão disponíveis abaixo.`,
      badge: { text: 'NFS-e AUTORIZADA', color: C.green },
      details: [
        ['Número', escapeHtml(d.numero ?? '—')],
        ['Código de verificação', escapeHtml(d.codigoVerificacao ?? '—')],
        ['Competência', escapeHtml(d.competencia)],
        ['Valor', escapeHtml(brl(d.value))],
        ['Emitida em', escapeHtml(dateBR(d.issuedAt ?? new Date()))],
      ],
      ctas,
      help: helpFinanceiro,
      footerEmail: FINANCEIRO,
    }),
  }
}

export function nfseCancelled(d: NfseMailData): RenderedMail {
  return {
    kind: 'nfse-cancelled',
    profile: 'financeiro',
    subject: `Nota fiscal ${d.numero ? `nº ${d.numero} ` : ''}cancelada — ${d.competencia}`,
    html: renderLayout({
      title: 'Nota fiscal cancelada',
      intro: `Olá, ${d.clientName}. A NFS-e ${d.numero ? `nº ${d.numero} ` : ''}da competência ${d.competencia} foi cancelada. Se houver substituição, a nova nota chega por este mesmo e-mail.`,
      badge: { text: 'CANCELADA', color: C.red },
      details: [
        ['Número', escapeHtml(d.numero ?? '—')],
        ['Competência', escapeHtml(d.competencia)],
        ['Valor', escapeHtml(brl(d.value))],
        ['Motivo', escapeHtml(d.reason ?? '—')],
      ],
      help: helpFinanceiro,
      footerEmail: FINANCEIRO,
    }),
  }
}

/* --------------------------------- contato --------------------------------- */

export function welcome(d: ClientMailData): RenderedMail {
  const services = d.services && d.services.length > 0
    ? d.services.map((s) => escapeHtml(s)).join('<br>')
    : '—'
  return {
    kind: 'welcome',
    profile: 'contato',
    subject: 'Bem-vindo à VEX Growth 🎉',
    html: renderLayout({
      title: 'Bem-vindo à VEX Growth 🎉',
      intro: `É um prazer ter a ${d.clientName} com a gente. A partir de agora cuidamos do seu marketing com processo, prazo e transparência — e você acompanha tudo por aqui.`,
      details: [
        ['Serviços contratados', services],
        ['Vencimento mensal', escapeHtml(d.paymentDay ? `todo dia ${d.paymentDay}` : 'a combinar')],
        ['Financeiro', `<a href="mailto:${FINANCEIRO}" style="color:${C.text};text-decoration:none;">${FINANCEIRO}</a>`],
        ['Atendimento', `<a href="mailto:${CONTATO}" style="color:${C.text};text-decoration:none;">${CONTATO}</a>`],
      ],
      ctas: [{ label: 'Falar com a equipe', url: `mailto:${CONTATO}?subject=${encodeURIComponent(`Boas-vindas — ${d.clientName}`)}` }],
      extraHtml: `<p style="margin:0;color:${C.muted};font-size:14px;text-align:center;">Faturas e notas fiscais chegam por <b>${FINANCEIRO}</b>. Avisos e novidades, por <b>${CONTATO}</b>. Vale salvar os dois contatos.</p>`,
      help: helpContato,
      footerEmail: CONTATO,
    }),
  }
}

export function completeProfile(d: ClientMailData): RenderedMail {
  const missing = d.missing && d.missing.length > 0
    ? `<ul style="margin:0;padding-left:20px;color:${C.text};">${d.missing.map((m) => `<li style="margin:4px 0;">${escapeHtml(m)}</li>`).join('')}</ul>`
    : ''
  return {
    kind: 'complete-profile',
    profile: 'contato',
    subject: 'Precisamos completar seu cadastro',
    html: renderLayout({
      title: 'Falta pouco para emitir suas notas',
      intro: `Olá, ${d.clientName}. Para emitir boletos e notas fiscais no nome certo, precisamos de alguns dados. Basta responder este e-mail com as informações abaixo:`,
      extraHtml: missing,
      ctas: [{ label: 'Responder com os dados', url: `mailto:${FINANCEIRO}?subject=${encodeURIComponent(`Dados cadastrais — ${d.clientName}`)}` }],
      help: helpContato,
      footerEmail: CONTATO,
    }),
  }
}

export function contractEnding(d: ClientMailData): RenderedMail {
  const days = d.daysLeft ?? 30
  return {
    kind: 'contract-ending',
    profile: 'contato',
    subject: `Seu contrato termina em ${days} dias`,
    html: renderLayout({
      title: 'Hora de falar sobre a renovação',
      intro: `Olá, ${d.clientName}. O contrato atual termina em ${dateBR(d.contractEnd)}. Queremos alinhar os próximos passos com calma — o que funcionou, o que ajustar e como seguir.`,
      details: [
        ['Término do contrato', escapeHtml(dateBR(d.contractEnd))],
        ['Dias restantes', escapeHtml(String(days))],
      ],
      ctas: [{ label: 'Agendar conversa', url: `mailto:${CONTATO}?subject=${encodeURIComponent(`Renovação — ${d.clientName}`)}` }],
      help: helpContato,
      footerEmail: CONTATO,
    }),
  }
}

export function announcement(d: AnnouncementData): RenderedMail {
  return {
    kind: 'announcement',
    profile: 'contato',
    subject: d.title,
    html: renderLayout({
      title: d.title,
      intro: `Olá, ${d.clientName}.`,
      extraHtml: `<p style="margin:0;">${nl2br(d.message)}</p>`,
      ctas: d.ctaLabel && d.ctaUrl ? [{ label: d.ctaLabel, url: d.ctaUrl }] : [],
      help: helpContato,
      footerEmail: CONTATO,
    }),
  }
}

/* --------------------------------- internos --------------------------------- */

export function adminDigest(d: DigestData): RenderedMail {
  const errors = d.errors.length > 0
    ? `<p style="margin:0 0 6px;font-weight:600;color:${C.red};">Erros de integração (${d.errors.length})</p>
       <ul style="margin:0;padding-left:20px;color:${C.text};font-size:13px;">${d.errors.slice(0, 10).map((e) => `<li style="margin:3px 0;"><b>${escapeHtml(e.provider)}</b> · ${escapeHtml(e.action)} — ${escapeHtml(e.error.slice(0, 140))}</li>`).join('')}</ul>`
    : ''
  return {
    kind: 'admin-digest',
    profile: 'contato',
    subject: `Resumo do dia ${d.date} — financeiro`,
    html: renderLayout({
      title: 'Resumo diário',
      intro: `Movimentação financeira de ${d.date}.`,
      details: [
        ['Cobranças geradas', escapeHtml(String(d.created))],
        ['Pagamentos confirmados', escapeHtml(`${d.paid} · ${brl(d.paidValue)}`)],
        ['Faturas em atraso', escapeHtml(`${d.overdue} · ${brl(d.overdueValue)}`)],
        ['Notas fiscais emitidas', escapeHtml(String(d.nfse))],
        ['Erros de integração', escapeHtml(String(d.errors.length))],
      ],
      extraHtml: errors,
      ctas: [{ label: 'Abrir o financeiro', url: `${APP_URL}/financeiro` }],
      help: 'E-mail interno da VEX Central de Gestão — enviado aos administradores.',
      footerEmail: CONTATO,
    }),
  }
}

export function integrationAlert(d: AlertData): RenderedMail {
  return {
    kind: 'integration-alert',
    profile: 'contato',
    subject: `⚠️ Falha na integração ${d.provider}`,
    html: renderLayout({
      title: 'Falha na integração',
      intro: `Uma operação com ${d.provider} falhou e pode precisar de atenção.`,
      badge: { text: 'ATENÇÃO', color: C.red },
      details: [
        ['Integração', escapeHtml(d.provider)],
        ['Operação', escapeHtml(d.action)],
        ['Referência', escapeHtml(d.refId ?? '—')],
        ['Quando', escapeHtml(d.when)],
      ],
      extraHtml: `<p style="margin:0;padding:12px 14px;background:#FEF2F2;border-radius:10px;color:${C.red};font-size:13px;word-break:break-word;">${escapeHtml(d.error.slice(0, 400))}</p>`,
      ctas: [{ label: 'Ver diagnóstico', url: `${APP_URL}/financeiro/integracoes` }],
      help: 'E-mail interno da VEX Central de Gestão — enviado aos administradores.',
      footerEmail: CONTATO,
    }),
  }
}

/* -------------------------------- amostras -------------------------------- */

/** Todos os modelos com dados fictícios — usados no envio de teste. */
export function sampleMails(): RenderedMail[] {
  const charge: ChargeMailData = {
    clientName: 'Cliente Exemplo Ltda',
    competencia: '09/2026',
    value: 2450,
    dueDate: '2026-09-15',
    billingType: 'BOLETO',
    invoiceUrl: 'https://www.asaas.com/i/exemplo',
    bankSlipUrl: 'https://www.asaas.com/b/pdf/exemplo',
    identificationField: '34191.79001 01043.510047 91020.150008 1 98760000245000',
    paidAt: '2026-09-14',
  }
  const nfse: NfseMailData = {
    clientName: 'Cliente Exemplo Ltda',
    competencia: '09/2026',
    value: 2450,
    numero: '1024',
    codigoVerificacao: 'A1B2C3D4',
    pdfUrl: 'https://homologacao.focusnfe.com.br/notas/exemplo.pdf',
    xmlUrl: 'https://homologacao.focusnfe.com.br/notas/exemplo.xml',
    issuedAt: '2026-09-14',
    reason: 'Erro no valor do serviço — nota substituída.',
  }
  const client: ClientMailData = {
    clientName: 'Cliente Exemplo Ltda',
    services: ['Gestão de redes sociais', 'Tráfego pago', 'Criação de conteúdo'],
    paymentDay: 15,
    missing: ['CNPJ', 'Endereço completo com CEP', 'E-mail do financeiro'],
    contractEnd: '2026-09-28',
    daysLeft: 30,
  }
  return [
    invoiceIssued(charge),
    dueSoon(charge),
    dueToday(charge),
    overdue({ ...charge, daysLate: 1 }, 1),
    overdue({ ...charge, daysLate: 7 }, 7),
    overdue({ ...charge, daysLate: 15 }, 15),
    paymentConfirmed(charge),
    nfseIssued(nfse),
    nfseCancelled(nfse),
    welcome(client),
    completeProfile(client),
    contractEnding(client),
    announcement({
      clientName: 'Cliente Exemplo Ltda',
      title: 'Recesso de fim de ano',
      message: 'A equipe da VEX estará em recesso de 24/12 a 02/01.\n\nAs demandas urgentes seguem atendidas pelo plantão via WhatsApp. Conteúdos programados continuam publicando normalmente.',
    }),
    adminDigest({
      date: '29/08/2026',
      created: 2,
      paid: 1,
      paidValue: 2450,
      overdue: 1,
      overdueValue: 1800,
      nfse: 1,
      errors: [{ provider: 'FOCUS', action: 'emitNfse', error: 'Focus: Inscrição municipal do prestador inválida.' }],
    }),
    integrationAlert({
      provider: 'ASAAS',
      action: 'createPayment',
      refId: 'billing:cliente-exemplo:2026-09',
      error: 'Asaas: TIMEOUT ao criar cobrança — será consultada por referência na próxima execução.',
      when: '29/08/2026 09:00',
    }),
  ]
}
