import { NextRequest, NextResponse } from 'next/server'
import { runDispatcher } from '@/lib/scheduler'
import { isValidWebhookToken } from '@/lib/webhook-secret'

/**
 * Disparo manual/externo do despachante de mensagens agendadas.
 *
 * O laço interno (instrumentation.ts) já roda a cada minuto — esta rota existe
 * para diagnóstico e para o caso de a operação preferir um cron externo.
 *
 * É pública como o webhook (o middleware não cobre /api), então usa o mesmo
 * token compartilhado.
 */
export async function POST(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!isValidWebhookToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const report = await runDispatcher()
  return NextResponse.json({ ok: true, ...report })
}
