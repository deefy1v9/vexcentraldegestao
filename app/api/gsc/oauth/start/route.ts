import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { buildAuthUrl, GscError } from '@/lib/gsc'
import { GA_SCOPE } from '@/lib/ga-core'

/**
 * Leva o administrador ao consentimento do Google, com state de uso único.
 * `?escopos=analytics` pede também a leitura do Analytics, somando ao que já
 * foi concedido (autorização incremental).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const pedeAnalytics = new URL(req.url).searchParams.get('escopos')?.includes('analytics')

  try {
    const { url } = await buildAuthUrl(admin.id, pedeAnalytics ? [GA_SCOPE] : [])
    return NextResponse.redirect(url)
  } catch (err) {
    const msg = err instanceof GscError ? err.message : 'Falha ao iniciar a conexão.'
    return NextResponse.redirect(new URL(`/seo?erro=${encodeURIComponent(msg)}`, process.env.NEXTAUTH_URL || 'http://localhost:3000'))
  }
}
