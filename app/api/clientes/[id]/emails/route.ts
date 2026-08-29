import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { logActivity } from '@/lib/activity'
import { sendClientEmail, ClientMailKind } from '@/lib/email-notify'

const KINDS: ClientMailKind[] = ['welcome', 'complete-profile', 'contract-ending', 'announcement']

/**
 * Envio manual de e-mail ao cliente (admin):
 * POST { kind: 'welcome' | 'complete-profile' | 'contract-ending' | 'announcement',
 *        title?, message?, ctaLabel?, ctaUrl? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const kind = String(body.kind ?? '') as ClientMailKind
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Tipo de e-mail inválido.' }, { status: 400 })

  const ctaUrl = body.ctaUrl ? String(body.ctaUrl).trim() : undefined
  if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
    return NextResponse.json({ error: 'O link do botão precisa começar com http(s)://' }, { status: 400 })
  }

  const r = await sendClientEmail(id, kind, {
    title: body.title ? String(body.title).slice(0, 120) : undefined,
    message: body.message ? String(body.message).slice(0, 4000) : undefined,
    ctaLabel: body.ctaLabel ? String(body.ctaLabel).slice(0, 40) : undefined,
    ctaUrl,
  })
  if (!r.sent) return NextResponse.json({ error: r.error ?? 'Não foi possível enviar.' }, { status: 400 })

  await logActivity(admin.id, `enviou e-mail (${kind}) ao cliente`, 'Clientes', id)
  return NextResponse.json({ ok: true })
}
