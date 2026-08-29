import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { getAiConfig, type ExtractedInput } from '@/lib/ai-import'
import { analyzeContract, extractContract, ContractAiError, ContractFileError } from '@/lib/contract-ai'
import { buildProposal } from '@/lib/planner'

/**
 * Etapa 1 do "Organizar com IA": analisa o contrato (arquivo enviado ou
 * cadastro do cliente) e monta a proposta de calendário.
 *
 * Restrito a administradores. Nenhuma demanda é criada aqui — a saída é uma
 * prévia guardada em PlanProposal/PlanItem, que exige confirmação explícita.
 */

/** Teto de análises por administrador por hora — protege custo e abuso. */
const RATE_LIMIT_PER_HOUR = 20

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const contentType = req.headers.get('content-type') ?? ''
  let clientId = ''
  let adminNote = ''
  let serviceIds: string[] = []
  let input: ExtractedInput | null = null
  let fileName: string | null = null

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      clientId = String(form.get('clientId') ?? '')
      adminNote = String(form.get('adminNote') ?? '')
      serviceIds = String(form.get('serviceIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      const file = form.get('file')
      if (file instanceof File && file.size > 0) {
        fileName = file.name.slice(0, 160)
        const buf = Buffer.from(await file.arrayBuffer())
        input = await extractContract(buf, file.name, file.type)
      }
    } else {
      const body = await req.json().catch(() => ({}))
      clientId = String(body.clientId ?? '')
      adminNote = String(body.adminNote ?? '')
      serviceIds = Array.isArray(body.serviceIds) ? body.serviceIds.map(String) : []
    }
  } catch (err) {
    if (err instanceof ContractFileError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Não foi possível ler o envio.' }, { status: 400 })
  }

  if (!clientId) return NextResponse.json({ error: 'Selecione o cliente.' }, { status: 400 })

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, status: true, services: { where: { status: 'ATIVO' }, select: { id: true } } },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

  // Serviços precisam ser do próprio cliente — nada de id solto vindo do form
  const validServiceIds = new Set(client.services.map((s) => s.id))
  serviceIds = serviceIds.filter((id) => validServiceIds.has(id))

  const { apiKey } = await getAiConfig()
  if (!apiKey) {
    return NextResponse.json({ error: 'Chave da IA não configurada. Salve OPENAI_API_KEY nas configurações.' }, { status: 409 })
  }

  const recent = await prisma.contractAnalysis.count({
    where: { createdById: admin.id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
  })
  if (recent >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json({ error: 'Limite de análises por hora atingido. Tente novamente mais tarde.' }, { status: 429 })
  }

  // Mesmo arquivo já analisado para este cliente? Reaproveita em vez de
  // gastar uma nova chamada — a prévia é remontada com os dados atuais.
  if (input?.fileHash) {
    const previous = await prisma.contractAnalysis.findFirst({
      where: { clientId, fileHash: input.fileHash, status: { in: ['REVISAO', 'CONFIRMADO'] } },
      orderBy: { createdAt: 'desc' },
    })
    if (previous) {
      const rebuilt = await buildProposal(previous.id)
      return NextResponse.json({ analysisId: previous.id, reused: true, ...rebuilt })
    }
  }

  const analysis = await prisma.contractAnalysis.create({
    data: {
      clientId,
      createdById: admin.id,
      serviceIds,
      fileName,
      fileHash: input?.fileHash ?? null,
      model: (await getAiConfig()).model,
      adminNote: adminNote.slice(0, 2000) || null,
      status: 'ANALISANDO',
    },
  })

  try {
    const { extraction, durationMs, model } = await analyzeContract({ clientId, input, adminNote })
    await prisma.contractAnalysis.update({
      where: { id: analysis.id },
      data: {
        extraction: extraction as unknown as object,
        confidence: extraction.overall_confidence,
        warnings: extraction.ambiguous_information.slice(0, 20),
        missing: extraction.missing_information.slice(0, 20),
        durationMs,
        model,
        status: 'REVISAO',
      },
    })

    const built = await buildProposal(analysis.id)
    await logActivity(admin.id, 'analisou contrato com IA', 'Calendário', client.name)
    return NextResponse.json({ analysisId: analysis.id, reused: false, ...built })
  } catch (err) {
    // Falha da IA: nenhuma demanda é criada, o erro fica registrado
    const message = err instanceof ContractAiError || err instanceof Error
      ? err.message
      : 'Falha na análise.'
    await prisma.contractAnalysis.update({
      where: { id: analysis.id },
      data: { status: 'ERRO', error: message.slice(0, 400) },
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
