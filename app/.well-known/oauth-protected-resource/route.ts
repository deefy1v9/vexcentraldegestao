import { metadadosDoRecurso } from '@/lib/mcp/formato'
import { baseDaCentral } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** RFC 9728: o conector (/api/mcp) diz onde fica o autorizador. É o primeiro endereço que o assistente lê ao receber o 401. */
export async function GET(): Promise<Response> {
  return Response.json(metadadosDoRecurso(baseDaCentral()), { headers: { 'cache-control': 'public, max-age=300' } })
}
