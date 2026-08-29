import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { sendMail, smtpConfigured } from '@/lib/mailer'
import { sampleMails } from '@/lib/email-templates'

/**
 * Envia TODOS os modelos de e-mail com dados fictícios para um endereço
 * (admin) — serve para revisar layout e textos nos clientes de e-mail reais.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const to = String(body.to ?? admin.email ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: 'Informe um e-mail de destino válido.' }, { status: 400 })
  }
  if (!(await smtpConfigured('financeiro'))) {
    return NextResponse.json({ error: 'E-mail não configurado no servidor.' }, { status: 409 })
  }

  const results: Array<{ kind: string; sent: boolean; error?: string }> = []
  for (const mail of sampleMails()) {
    try {
      const r = await sendMail({
        to,
        subject: `[MODELO] ${mail.subject}`,
        html: mail.html,
        profile: mail.profile,
        kind: 'preview',
      })
      results.push({ kind: mail.kind, sent: r.sent })
    } catch (err) {
      results.push({ kind: mail.kind, sent: false, error: err instanceof Error ? err.message : 'Falha no envio.' })
    }
  }
  return NextResponse.json({ to, results })
}
