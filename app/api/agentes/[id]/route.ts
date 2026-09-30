import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { validateAgent } from '@/lib/ai/agents'
import { normalizeTriggers } from '../route'

/** Edição e remoção de um agente. Só administradores. */

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const { id } = await params
  const viewer = await getSessionUser()
  const body = await req.json()

  const atual = await prisma.aiAgent.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Agente não encontrado.' }, { status: 404 })

  const name = body.name !== undefined ? String(body.name).trim() : atual.name
  const toolGroups: string[] = body.toolGroups !== undefined
    ? (Array.isArray(body.toolGroups) ? body.toolGroups.map(String) : [])
    : atual.toolGroups
  const erros = validateAgent({ name, toolGroups, instructions: body.instructions ?? atual.instructions })
  if (erros.length > 0) return NextResponse.json({ error: erros.join(' ') }, { status: 400 })

  const duplicado = await prisma.aiAgent.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } },
  })
  if (duplicado) return NextResponse.json({ error: 'Já existe um agente com esse nome.' }, { status: 409 })

  const querPadrao = body.isDefault === true
  const agent = await prisma.$transaction(async (tx) => {
    if (querPadrao) await tx.aiAgent.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } })
    return tx.aiAgent.update({
      where: { id },
      data: {
        name,
        description: opt(body.description, atual.description),
        instructions: opt(body.instructions, atual.instructions),
        toolGroups,
        triggers: body.triggers !== undefined ? normalizeTriggers(body.triggers) : atual.triggers,
        model: opt(body.model, atual.model),
        isActive: body.isActive !== undefined ? !!body.isActive : atual.isActive,
        // Desmarcar o padrão na mão deixaria ninguém atendendo: só troca quem é.
        isDefault: querPadrao ? true : atual.isDefault,
      },
    })
  })

  await logActivity(viewer?.id ?? '', 'editou agente de IA', 'Agentes', agent.name)
  return NextResponse.json({ agent })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const { id } = await params
  const viewer = await getSessionUser()
  const agent = await prisma.aiAgent.findUnique({ where: { id } })
  if (!agent) return NextResponse.json({ error: 'Agente não encontrado.' }, { status: 404 })

  await prisma.aiAgent.delete({ where: { id } })
  // O padrão não pode sumir: o mais antigo que sobrou assume.
  if (agent.isDefault) {
    const proximo = await prisma.aiAgent.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
    if (proximo) await prisma.aiAgent.update({ where: { id: proximo.id }, data: { isDefault: true } })
  }
  await logActivity(viewer?.id ?? '', 'removeu agente de IA', 'Agentes', agent.name)
  return NextResponse.json({ ok: true })
}

function opt(value: unknown, atual: string | null): string | null {
  if (value === undefined) return atual
  const s = typeof value === 'string' ? value.trim() : ''
  return s || null
}
