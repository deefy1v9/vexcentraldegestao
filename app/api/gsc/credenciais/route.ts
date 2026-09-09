import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { encryptSecret } from '@/lib/crypto'
import { logActivity } from '@/lib/activity'
import { defaultRedirectUri } from '@/lib/gsc'

/**
 * Guarda as credenciais do cliente OAuth no próprio sistema, cifradas em
 * repouso — evita passar o segredo por chat, e-mail ou repositório. Variável
 * de ambiente, quando existir, continua tendo prioridade sobre isto.
 *
 * O segredo entra, mas nunca sai: a leitura devolve apenas se está definido.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => ({}))
  const clientId = String(body.clientId ?? '').trim()
  const clientSecret = String(body.clientSecret ?? '').trim()
  const redirectUri = String(body.redirectUri ?? '').trim()

  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    return NextResponse.json({ error: 'Client ID inválido: deve terminar em .apps.googleusercontent.com' }, { status: 400 })
  }
  if (clientSecret && clientSecret.length < 10) {
    return NextResponse.json({ error: 'Client secret inválido.' }, { status: 400 })
  }
  if (redirectUri && !/^https?:\/\//.test(redirectUri)) {
    return NextResponse.json({ error: 'URI de retorno inválida.' }, { status: 400 })
  }

  const gravar = async (key: string, value: string) => {
    await prisma.$executeRaw`
      INSERT INTO "SystemSettings" (key, value, "updatedAt")
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${value}, "updatedAt" = NOW()
    `
  }

  await gravar('GSC_CLIENT_ID', clientId)
  // Campo em branco significa "não mexi": não apaga um segredo já gravado
  if (clientSecret) await gravar('GSC_CLIENT_SECRET', encryptSecret(clientSecret) ?? '')
  if (redirectUri) await gravar('GSC_REDIRECT_URI', redirectUri)

  await logActivity(admin.id, 'salvou credenciais do Google Search Console', 'SEO', clientId.split('-')[0])
  return NextResponse.json({ ok: true, redirectUri: redirectUri || defaultRedirectUri() })
}
