import { metadadosDoRecurso } from '@/lib/mcp/formato'
import { baseDaCentral } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** O mesmo documento no caminho do recurso: alguns assistentes sondam este endereço. */
export async function GET(): Promise<Response> {
  return Response.json(metadadosDoRecurso(baseDaCentral()), { headers: { 'cache-control': 'public, max-age=300' } })
}
