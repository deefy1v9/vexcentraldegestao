import { prisma } from './prisma'
import { decryptSecret } from './crypto'

/**
 * Leitura central de SystemSettings, com descriptografia transparente.
 *
 * Chaves de integração dão acesso a dinheiro (Asaas), emissão fiscal (Focus),
 * à caixa de e-mail e a APIs pagas — não podem ficar em texto puro no banco,
 * onde qualquer dump ou backup as expõe.
 *
 * Compatível com o que já está gravado: `decryptSecret` devolve sem alteração
 * qualquer valor que não tenha o prefixo `enc:v1:`. Os segredos existentes
 * seguem funcionando em texto puro e passam a ser cifrados quando forem
 * salvos de novo pela tela de configurações.
 */
export const SECRET_SETTING_KEYS = new Set<string>([
  'ASAAS_API_KEY',
  'ASAAS_WEBHOOK_TOKEN',
  'FOCUS_NFE_TOKEN_HOMOLOGACAO',
  'FOCUS_NFE_TOKEN_PRODUCAO',
  'FOCUS_WEBHOOK_TOKEN',
  'OPENAI_API_KEY',
  'SMTP_PASS',
  'UAZAPI_TOKEN',
])

/** Lê várias chaves de uma vez, já descriptografadas quando for o caso. */
export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.systemSettings.findMany({ where: { key: { in: keys } } })
  return Object.fromEntries(
    rows.map((r) => [r.key, SECRET_SETTING_KEYS.has(r.key) ? (decryptSecret(r.value) ?? '') : r.value]),
  )
}

/** Lê uma chave só. Devolve string vazia se não existir. */
export async function getSetting(key: string): Promise<string> {
  const s = await getSettings([key])
  return s[key] ?? ''
}
