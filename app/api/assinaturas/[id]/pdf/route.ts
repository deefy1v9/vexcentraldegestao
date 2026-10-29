import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { pdfDoContrato } from '@/lib/assinatura'
import { respostaDoPdf } from '@/lib/assinatura-http'

/** GET (admin) — o PDF original (?tipo=original) ou o assinado (?tipo=assinado). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const tipo = new URL(req.url).searchParams.get('tipo') === 'assinado' ? 'assinado' : 'original'
  const pdf = await pdfDoContrato({ id }, tipo)
  if (!pdf) return NextResponse.json({ error: 'PDF não encontrado.' }, { status: 404 })
  return respostaDoPdf(pdf)
}
