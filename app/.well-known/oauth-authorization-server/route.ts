import { metadadosDoAutorizador } from '@/lib/mcp/formato'
import { baseDaCentral } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** RFC 8414: os endereços do OAuth do conector (autorizar, token, registro). Público por natureza. */
export async function GET(): Promise<Response> {
  return Response.json(metadadosDoAutorizador(baseDaCentral()), { headers: { 'cache-control': 'public, max-age=300' } })
}
