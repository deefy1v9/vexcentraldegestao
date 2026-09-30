import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { runSingleWatch } from '@/lib/ai/watch'

/**
 * Prévia (ou envio manual) do aviso de um agente vigia.
 *
 * Sem `enviar: true`, só devolve o texto: serve para conferir a redação antes
 * de deixar o agente solto. Com `enviar: true`, manda para os sócios agora.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const agent = await prisma.aiAgent.findUnique({
    where: { id },
    select: { id: true, name: true, instructions: true, toolGroups: true },
  })
  if (!agent) return NextResponse.json({ error: 'Agente não encontrado.' }, { status: 404 })
  if (agent.toolGroups.length === 0) {
    return NextResponse.json({ error: 'Escolha pelo menos uma área para o agente vigiar.' }, { status: 400 })
  }

  const r = await runSingleWatch(agent, { enviar: body.enviar === true })
  return NextResponse.json(r)
}
