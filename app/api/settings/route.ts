import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_KEYS = ['UAZAPI_URL', 'UAZAPI_TOKEN']

export async function GET() {
  // Expõe o UAZAPI_TOKEN — restrito a administradores.
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const rows = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
    SELECT key, value FROM "SystemSettings" WHERE key IN ('UAZAPI_URL', 'UAZAPI_TOKEN')
  `

  const result: Record<string, string> = {}
  for (const row of rows) result[row.key] = row.value
  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const body = await req.json()

  for (const k of ALLOWED_KEYS.filter((key) => body[key] !== undefined)) {
    await prisma.$executeRaw`
      INSERT INTO "SystemSettings" (key, value, "updatedAt")
      VALUES (${k}, ${String(body[k])}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${String(body[k])}, "updatedAt" = NOW()
    `
  }

  return NextResponse.json({ ok: true })
}
