import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity'
import { encryptSecret, decryptSecret } from '@/lib/crypto'
import { AI_SETTING_KEYS, AI_ENCRYPTED_KEYS } from '@/lib/ai/config'

const ALLOWED_KEYS = ['UAZAPI_URL', 'UAZAPI_TOKEN', ...AI_SETTING_KEYS]

// Chaves guardadas cifradas (AES-256-GCM) em SystemSettings. O UAZAPI_TOKEN dá
// acesso total à instância de WhatsApp da agência — não pode ficar em texto
// puro no banco. Valores legados sem o prefixo `enc:v1:` continuam legíveis.
const ENCRYPTED_KEYS = new Set<string>(['UAZAPI_TOKEN', ...AI_ENCRYPTED_KEYS])

export async function GET() {
  // Expõe o UAZAPI_TOKEN — restrito a administradores.
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const rows = await prisma.systemSettings.findMany({
    where: { key: { in: ALLOWED_KEYS } },
  })

  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = ENCRYPTED_KEYS.has(row.key)
      ? decryptSecret(row.value) ?? ''
      : row.value
  }
  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const body = await req.json()

  const changed: string[] = []
  for (const k of ALLOWED_KEYS.filter((key) => body[key] !== undefined)) {
    const raw = String(body[k])
    const stored = ENCRYPTED_KEYS.has(k) ? encryptSecret(raw) ?? '' : raw

    await prisma.$executeRaw`
      INSERT INTO "SystemSettings" (key, value, "updatedAt")
      VALUES (${k}, ${stored}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${stored}, "updatedAt" = NOW()
    `
    changed.push(k)
  }

  if (changed.length > 0) {
    await logActivity(user.id, 'alterou configurações do sistema', 'CRM', changed.join(', '))
  }

  return NextResponse.json({ ok: true })
}
