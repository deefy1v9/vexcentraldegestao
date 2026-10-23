import { metodoNaoPermitido, responderMcp } from '@/lib/mcp/servidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Conector de IA da Central (servidor MCP): é este endereço que se cola no
 * Claude Code, no Codex (Habblaud) ou no Claude. Não lê cookie: quem
 * autoriza é o token OAuth do cabeçalho Authorization, conferido em
 * lib/mcp/servidor.ts a cada pedido. Sem token: 401 que leva ao login.
 */
export async function POST(req: Request): Promise<Response> {
  return responderMcp(req)
}

/** Sem fluxo SSE solto nem sessão: o servidor responde em JSON a cada POST. */
export async function GET(): Promise<Response> {
  return metodoNaoPermitido()
}

export async function DELETE(): Promise<Response> {
  return metodoNaoPermitido()
}
