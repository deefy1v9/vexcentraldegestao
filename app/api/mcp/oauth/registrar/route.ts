import { ipDe, limiteRegistro } from '@/lib/mcp/limite'
import { OAuthErro, registrarCliente } from '@/lib/mcp/oauth-core'
import { repoPrisma } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Registro do aplicativo (RFC 7591): o assistente se apresenta aqui antes do
 * primeiro login. Pública de propósito (vem antes de existir pessoa); quem
 * protege é a lista fechada de retornos (lib/mcp/formato) e o freio por IP.
 */
export async function POST(req: Request): Promise<Response> {
  const freio = limiteRegistro.conferir(`registro:${ipDe(req.headers)}`)
  if (!freio.ok) return erro(429, 'rate_limited', 'Muitos registros seguidos. Aguarde alguns minutos.', { 'retry-after': String(freio.esperarSeg) })
  const corpo = await req.json().catch(() => null)
  try {
    return Response.json(await registrarCliente(corpo, repoPrisma), { status: 201, headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    if (e instanceof OAuthErro) return erro(e.status, e.codigo, e.message)
    console.error('[mcp] registrar:', e instanceof Error ? e.message : e)
    return erro(500, 'server_error', 'Não foi possível registrar agora. Tente de novo.')
  }
}

function erro(status: number, codigo: string, descricao: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error: codigo, error_description: descricao }, { status, headers: { 'cache-control': 'no-store', ...headers } })
}
