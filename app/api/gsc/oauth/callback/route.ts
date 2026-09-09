import { NextRequest, NextResponse } from 'next/server'
import { consumeState, exchangeCode, GscError } from '@/lib/gsc'
import { logActivity } from '@/lib/activity'

/**
 * Retorno do Google. A URI desta rota é fixa e vem da configuração do
 * servidor: nada aqui é montado com o que o navegador manda.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const base = (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')
  const volta = (params: string) => NextResponse.redirect(`${base}/seo?${params}`)

  const erro = searchParams.get('error')
  if (erro) {
    const msg = erro === 'access_denied'
      ? 'Autorização recusada no Google. Nada foi conectado.'
      : 'O Google recusou a autorização.'
    return volta(`erro=${encodeURIComponent(msg)}`)
  }

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (!code || !state) return volta(`erro=${encodeURIComponent('Retorno incompleto do Google.')}`)

  try {
    const { userId } = await consumeState(state)
    const { email, hasRefresh } = await exchangeCode(code, userId)
    await logActivity(userId, 'conectou o Google Search Console', 'SEO', email)
    return volta(hasRefresh ? 'conectado=1' : `aviso=${encodeURIComponent('Conectado, mas sem renovação automática. Reconecte concedendo acesso offline.')}`)
  } catch (err) {
    const msg = err instanceof GscError ? err.message : 'Não foi possível concluir a conexão.'
    return volta(`erro=${encodeURIComponent(msg)}`)
  }
}
