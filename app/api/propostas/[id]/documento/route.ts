import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { generateDocument, logEvent, ProposalError } from '@/lib/proposals'
import { ProposalRenderError } from '@/lib/proposal-pdf'

/**
 * Geração e download do documento.
 *
 * POST — gera PDF ou DOCX da versão atual (idempotente por versão+formato).
 * GET  — baixa o arquivo. Os bytes ficam no banco e só saem por esta rota,
 *        autenticada e auditada; não existe URL pública nem previsível.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const format = body.format === 'DOCX' ? 'DOCX' : 'PDF'

  const proposal = await prisma.proposal.findUnique({ where: { id }, select: { id: true } })
  if (!proposal) return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 })

  try {
    const result = await generateDocument(id, format, admin)
    return NextResponse.json({ ok: true, format, ...result })
  } catch (err) {
    const message = err instanceof ProposalError || err instanceof ProposalRenderError
      ? err.message
      : 'Não foi possível gerar o documento.'
    if (!(err instanceof ProposalError) && !(err instanceof ProposalRenderError)) {
      console.error('[propostas] falha ao gerar documento', err)
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') === 'DOCX' ? 'DOCX' : 'PDF'
  const versionParam = searchParams.get('version')

  const proposal = await prisma.proposal.findUnique({ where: { id }, select: { currentVersion: true, number: true } })
  if (!proposal) return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 })
  const version = versionParam ? Number(versionParam) : proposal.currentVersion

  const doc = await prisma.proposalDocument.findUnique({
    where: { proposalId_version_format: { proposalId: id, version, format } },
  })
  if (!doc) return NextResponse.json({ error: 'Documento ainda não gerado para esta versão.' }, { status: 404 })

  await prisma.proposalDocument.update({ where: { id: doc.id }, data: { downloads: { increment: 1 } } })
  await logEvent(id, 'DOWNLOAD', `${format} da versão ${version} baixado por ${admin.name}`, admin.id, { version, format })

  const contentType = format === 'PDF'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  return new NextResponse(new Uint8Array(doc.bytes), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(doc.size),
      // inline para o PDF (prévia no navegador), anexo para o DOCX
      'Content-Disposition': `${format === 'PDF' ? 'inline' : 'attachment'}; filename="${doc.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
