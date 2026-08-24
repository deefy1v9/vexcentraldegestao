import { NextResponse } from 'next/server'

/**
 * Endpoint de liveness usado pelo healthcheck do Docker Swarm.
 *
 * Público de propósito (o middleware já ignora /api/*) e deliberadamente
 * sem consulta ao banco: responder aqui significa apenas "o servidor Next
 * subiu e está aceitando requisições". Como o entrypoint só executa
 * `node server.js` DEPOIS de preparar o banco, o Traefik passa a rotear
 * tráfego somente quando o container está de fato pronto.
 *
 * Não depender do banco evita o problema histórico de o healthcheck derrubar
 * o container e travar o deploy em `rollback_paused`.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ status: 'ok' })
}
