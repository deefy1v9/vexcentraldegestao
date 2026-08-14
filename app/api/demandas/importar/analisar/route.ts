import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import {
  extractFile, analyzeWithGemini, deriveDates, getGeminiConfig,
  GeminiRateLimitError, ExtractedInput, ImportItem,
} from '@/lib/ai-import'
import { defaultAssignments } from '@/lib/task-flow'

export const maxDuration = 120

// Rate limit em memória: no máximo 1 análise a cada 20s por processo
let lastAnalysisAt = 0

/**
 * Etapa de análise da importação com IA. Só administradores.
 * Recebe texto colado (JSON) ou arquivo (multipart), extrai o conteúdo,
 * envia ao Gemini e grava as sugestões como AiImport em status REVISAO.
 * Nenhuma demanda é criada aqui.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  if (Date.now() - lastAnalysisAt < 20_000) {
    return NextResponse.json({ error: 'Aguarde alguns segundos entre análises.' }, { status: 429 })
  }

  // Uma análise simultânea por vez
  const running = await prisma.aiImport.findFirst({
    where: { status: 'ANALISANDO', createdAt: { gte: new Date(Date.now() - 3 * 60_000) } },
  })
  if (running) {
    return NextResponse.json({ error: 'Já existe uma análise em andamento. Aguarde ela terminar.' }, { status: 409 })
  }

  // Entrada: multipart (arquivo + instruções opcionais) ou JSON ({ text, note })
  let input: ExtractedInput
  let fileName: string | null = null
  let adminNote = ''
  let defaultResponsibleId = ''
  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return NextResponse.json({ error: 'Envie um arquivo.' }, { status: 400 })
      fileName = file.name
      adminNote = String(form.get('note') ?? '')
      defaultResponsibleId = String(form.get('defaultResponsibleId') ?? '')
      const buf = Buffer.from(await file.arrayBuffer())
      input = await extractFile(buf, file.name, file.type)
    } else {
      const body = await req.json().catch(() => ({}))
      const text = String(body.text ?? '').trim()
      adminNote = String(body.note ?? '')
      defaultResponsibleId = String(body.defaultResponsibleId ?? '')
      if (text.length < 10) {
        return NextResponse.json({ error: 'Cole o conteúdo do calendário ou envie um arquivo.' }, { status: 400 })
      }
      input = {
        kind: 'text',
        text: text.slice(0, 120_000),
        fileHash: createHash('sha256').update(text).digest('hex'),
      }
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Arquivo inválido.' }, { status: 400 })
  }

  // Reimportação do mesmo conteúdo: avisa (a deduplicação final é por item)
  const previous = await prisma.aiImport.findFirst({
    where: { fileHash: input.fileHash, status: 'CONFIRMADO' },
    orderBy: { createdAt: 'desc' },
  })

  const { model } = await getGeminiConfig()
  const imp = await prisma.aiImport.create({
    data: { createdById: admin.id, fileName, fileHash: input.fileHash, model },
  })
  lastAnalysisAt = Date.now()

  try {
    const result = await analyzeWithGemini(input, adminNote)
    const defaults = await defaultAssignments()

    // Responsável padrão escolhido pelo admin vale para todos os itens
    // (continua editável item a item na revisão)
    const forced = defaultResponsibleId
      ? await prisma.user.findFirst({ where: { id: defaultResponsibleId, isActive: true }, select: { id: true } })
      : null

    const items: ImportItem[] = result.items.map((item) => ({
      ...item,
      ...deriveDates(item.publication_at),
      responsible_id: forced?.id ?? item.responsible_id,
      reviewer_id: defaults.reviewerId,
      scheduler_id: defaults.schedulerId,
      warnings: [
        ...(forced ? item.warnings.filter((w) => w !== 'Revisão necessária') : item.warnings),
        ...(previous ? ['Possível duplicidade'] : []),
      ],
    }))

    await prisma.$transaction([
      ...items.map((payload) =>
        prisma.aiImportItem.create({
          data: { importId: imp.id, sourceItem: payload.source_item || null, payload: payload as object },
        }),
      ),
      prisma.aiImport.update({
        where: { id: imp.id },
        data: { status: 'REVISAO', itemsFound: items.length },
      }),
    ])

    await logActivity(admin.id, 'analisou calendário com IA', 'Demandas', fileName ?? 'texto colado')

    const saved = await prisma.aiImportItem.findMany({ where: { importId: imp.id }, orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ importId: imp.id, items: saved, reimport: !!previous })
  } catch (err) {
    const friendly = err instanceof GeminiRateLimitError
      ? 'Limite temporário da análise com IA atingido. Aguarde alguns minutos e tente novamente.'
      : err instanceof Error ? err.message : 'Falha na análise.'
    await prisma.aiImport.update({
      where: { id: imp.id },
      data: { status: 'ERRO', error: friendly.slice(0, 500) },
    }).catch(() => {})
    return NextResponse.json({ error: friendly }, { status: err instanceof GeminiRateLimitError ? 429 : 500 })
  }
}
