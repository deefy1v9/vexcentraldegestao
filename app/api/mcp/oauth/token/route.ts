import { ipDe, limiteToken } from '@/lib/mcp/limite'
import { concederToken, OAuthErro } from '@/lib/mcp/oauth-core'
import { repoPrisma } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Token endpoint do conector: troca o código (com PKCE) por um token de 1 h
 * e um refresh rotativo, e renova. Pública (o aplicativo chama sem cookie);
 * quem protege é o próprio código (uso único, 5 min, preso ao cliente, ao
 * retorno e ao PKCE) e o refresh rotativo, em lib/mcp/oauth-core.ts.
 */
export async function POST(req: Request): Promise<Response> {
  const freio = limiteToken.conferir(`token:${ipDe(req.headers)}`)
  if (!freio.ok) return erro(429, 'rate_limited', 'Muitas trocas seguidas. Aguarde um instante.', { 'retry-after': String(freio.esperarSeg) })
  try {
    const tokens = await concederToken(await lerCampos(req), repoPrisma)
    return Response.json(tokens, { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } })
  } catch (e) {
    if (e instanceof OAuthErro) return erro(e.status, e.codigo, e.message)
    console.error('[mcp] token:', e instanceof Error ? e.message : e)
    return erro(500, 'server_error', 'Não foi possível emitir o token agora. Tente de novo.')
  }
}

export async function GET(): Promise<Response> {
  return erro(405, 'invalid_request', 'Use POST.', { allow: 'POST' })
}

/** O OAuth manda form-urlencoded (RFC 6749); JSON também é aceito. */
async function lerCampos(req: Request): Promise<Record<string, string>> {
  const tipo = req.headers.get('content-type') ?? ''
  const saida: Record<string, string> = {}
  if (tipo.includes('application/json')) {
    const j = (await req.json().catch(() => null)) as Record<string, unknown> | null
    for (const [k, v] of Object.entries(j ?? {})) if (typeof v === 'string') saida[k] = v
    return saida
  }
  for (const [k, v] of new URLSearchParams(await req.text().catch(() => ''))) saida[k] = v
  return saida
}

function erro(status: number, codigo: string, descricao: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error: codigo, error_description: descricao }, { status, headers: { 'cache-control': 'no-store', ...headers } })
}
