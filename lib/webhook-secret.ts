import crypto from 'crypto'

/**
 * Segredo compartilhado usado para autenticar o webhook do CRM.
 *
 * O endpoint /api/crm/webhook é público (chamado pela UAZAPI, sem sessão),
 * então protegemos com um token na query string. A UAZAPI recebe a URL
 * com `?token=` em /api/crm/webhook-setup e a devolve a cada chamada.
 *
 * Usa CRM_WEBHOOK_SECRET se definido; caso contrário deriva de AUTH_SECRET.
 */
export function getWebhookSecret(): string {
  if (process.env.CRM_WEBHOOK_SECRET) return process.env.CRM_WEBHOOK_SECRET
  const base = process.env.AUTH_SECRET
  if (!base) return ''
  // Deriva um token estável (não expõe o AUTH_SECRET diretamente).
  return crypto.createHash('sha256').update(`crm-webhook:${base}`).digest('hex')
}

/** Compara o token recebido com o esperado, em tempo constante. */
export function isValidWebhookToken(received: string | null): boolean {
  const expected = getWebhookSecret()
  if (!expected) return true // sem segredo configurado: não bloqueia (degrada com aviso)
  if (!received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
