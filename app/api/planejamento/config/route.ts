import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { getPlannerConfig } from '@/lib/planner'
import { DEFAULT_PLANNER_CONFIG, isValidISO } from '@/lib/planner-core'

/**
 * Configuração administrativa do planejamento: dias dos grupos, capacidade,
 * antecedências, sábado/domingo, feriados e duração estimada por tipo.
 * Valores ficam em SystemSettings; os padrões seguros vivem no core.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const config = await getPlannerConfig()
  return NextResponse.json({ config, defaults: DEFAULT_PLANNER_CONFIG })
}

function daysToString(value: unknown, fallback: number[]): string {
  const arr = Array.isArray(value) ? value : String(value ?? '').split(',')
  const days = arr.map((d) => Number(String(d).trim())).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  return (days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : fallback).join(',')
}

function clampToString(value: unknown, fallback: number, min: number, max: number): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(fallback)
  return String(Math.min(max, Math.max(min, Math.round(n))))
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const d = DEFAULT_PLANNER_CONFIG
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  const updates: Record<string, string> = {}
  if (has('groupADays')) updates.PLAN_GROUP_A_DAYS = daysToString(body.groupADays, d.groupADays)
  if (has('groupBDays')) updates.PLAN_GROUP_B_DAYS = daysToString(body.groupBDays, d.groupBDays)
  if (has('allowSaturday')) updates.PLAN_ALLOW_SATURDAY = body.allowSaturday ? 'true' : 'false'
  if (has('allowSunday')) updates.PLAN_ALLOW_SUNDAY = body.allowSunday ? 'true' : 'false'
  if (has('holidayMode')) updates.PLAN_HOLIDAY_MODE = body.holidayMode === 'allow' ? 'allow' : 'skip'
  if (has('extraHolidays')) {
    const list = (Array.isArray(body.extraHolidays) ? body.extraHolidays : String(body.extraHolidays ?? '').split(','))
      .map((x: unknown) => String(x).trim())
      .filter(isValidISO)
    updates.PLAN_EXTRA_HOLIDAYS = list.join(',')
  }
  if (has('capacityPerDay')) updates.PLAN_CAPACITY_PER_DAY = clampToString(body.capacityPerDay, d.capacityPerDay, 1, 100)
  if (has('capacityPerUser')) updates.PLAN_CAPACITY_PER_USER = clampToString(body.capacityPerUser, d.capacityPerUser, 1, 50)
  if (has('leadProduction')) updates.PLAN_LEAD_PRODUCTION = clampToString(body.leadProduction, d.leadProduction, 0, 30)
  if (has('leadReview')) updates.PLAN_LEAD_REVIEW = clampToString(body.leadReview, d.leadReview, 0, 30)
  if (has('leadApproval')) updates.PLAN_LEAD_APPROVAL = clampToString(body.leadApproval, d.leadApproval, 0, 30)
  if (has('leadSchedule')) updates.PLAN_LEAD_SCHEDULE = clampToString(body.leadSchedule, d.leadSchedule, 0, 30)
  if (has('durationByType') && body.durationByType && typeof body.durationByType === 'object') {
    const clean = Object.fromEntries(
      Object.entries(body.durationByType as Record<string, unknown>)
        .map(([k, v]) => [String(k).slice(0, 40), Number(v)])
        .filter(([, v]) => Number.isFinite(v as number) && (v as number) > 0 && (v as number) <= 2000),
    )
    updates.PLAN_DURATION_BY_TYPE = JSON.stringify(clean)
  }

  // Produção nunca pode ser depois da revisão — regra do fluxo existente
  const leadProduction = Number(updates.PLAN_LEAD_PRODUCTION ?? (await getPlannerConfig()).leadProduction)
  const leadReview = Number(updates.PLAN_LEAD_REVIEW ?? (await getPlannerConfig()).leadReview)
  if (leadProduction < leadReview) {
    return NextResponse.json(
      { error: 'A antecedência de produção precisa ser maior ou igual à de revisão.' },
      { status: 400 },
    )
  }

  for (const [key, value] of Object.entries(updates)) {
    await prisma.$executeRaw`
      INSERT INTO "SystemSettings" (key, value, "updatedAt")
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${value}, "updatedAt" = NOW()
    `
  }

  await logActivity(admin.id, 'atualizou a configuração do planejamento', 'Calendário', 'Planejamento')
  return NextResponse.json({ config: await getPlannerConfig() })
}
