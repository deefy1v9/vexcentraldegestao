import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { GROUP_KEYS, validateAgent } from '@/lib/ai/agents'
import { isWatchFrequency } from '@/lib/ai/watch-core'

/** Agentes de IA da Central — só administradores configuram. */

export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const agents = await prisma.aiAgent.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] })
  return NextResponse.json({ agents, groups: GROUP_KEYS })
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const viewer = await getSessionUser()
  const body = await req.json()

  const name = String(body.name ?? '').trim()
  const toolGroups: string[] = Array.isArray(body.toolGroups) ? body.toolGroups.map(String) : []
  const erros = validateAgent({ name, toolGroups, instructions: body.instructions })
  if (erros.length > 0) return NextResponse.json({ error: erros.join(' ') }, { status: 400 })

  const duplicado = await prisma.aiAgent.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
  if (duplicado) return NextResponse.json({ error: 'Já existe um agente com esse nome.' }, { status: 409 })

  const triggers = normalizeTriggers(body.triggers)
  const isDefault = !!body.isDefault
  const total = await prisma.aiAgent.count()

  const agent = await prisma.$transaction(async (tx) => {
    // Só um padrão por vez: o novo padrão desmarca o anterior.
    if (isDefault || total === 0) await tx.aiAgent.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
    return tx.aiAgent.create({
      data: {
        name,
        description: str(body.description),
        instructions: str(body.instructions),
        toolGroups,
        triggers,
        model: str(body.model),
        watchFrequency: watchFreq(body.watchFrequency),
        watchWeekday: weekday(body.watchWeekday),
        isActive: body.isActive !== false,
        isDefault: isDefault || total === 0,
        createdById: viewer?.id ?? null,
      },
    })
  })

  await logActivity(viewer?.id ?? '', 'criou agente de IA', 'Agentes', agent.name)
  return NextResponse.json({ agent })
}

/** Frequência da vigia; qualquer coisa fora da lista vira desligada. */
export function watchFreq(v: unknown): string {
  const s = typeof v === 'string' ? v.toUpperCase() : ''
  return isWatchFrequency(s) ? s : 'DESLIGADA'
}

/** Dia da semana da vigia semanal (0 = domingo). */
export function weekday(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null
}

function str(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s || null
}

export function normalizeTriggers(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : []
  const out = raw.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3)
  return [...new Set(out)].slice(0, 20)
}
