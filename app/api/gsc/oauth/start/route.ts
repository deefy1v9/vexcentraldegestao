import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { buildAuthUrl, GscError } from '@/lib/gsc'

/** Leva o administrador ao consentimento do Google, com state de uso único. */
export async function GET() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  try {
    const { url } = await buildAuthUrl(admin.id)
    return NextResponse.redirect(url)
  } catch (err) {
    const msg = err instanceof GscError ? err.message : 'Falha ao iniciar a conexão.'
    return NextResponse.redirect(new URL(`/seo?erro=${encodeURIComponent(msg)}`, process.env.NEXTAUTH_URL || 'http://localhost:3000'))
  }
}
