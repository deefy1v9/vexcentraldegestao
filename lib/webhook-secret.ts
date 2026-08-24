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

  // Sem segredo configurado, o endpoint público não tem como se defender:
  // rejeita (fail-closed) em vez de aceitar qualquer requisição. O app já
  // exige AUTH_SECRET para o next-auth, então isto só acontece em ambiente
  // mal configurado — e aí é melhor o CRM não receber nada do que aceitar
  // mensagens forjadas de qualquer origem.
  if (!expected) {
    console.error(
      'CRM webhook rejeitado: defina AUTH_SECRET (ou CRM_WEBHOOK_SECRET) para autenticar o endpoint.',
    )
    return false
  }

  if (!received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
