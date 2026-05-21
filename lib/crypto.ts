import crypto from 'crypto'

/**
 * Criptografia simétrica (AES-256-GCM) para dados sensíveis em repouso,
 * como senhas de credenciais de clientes — exigência de proteção de dados (LGPD).
 *
 * A chave é derivada de CREDENTIALS_SECRET (ou, na ausência, de AUTH_SECRET),
 * de forma determinística. Mantenha esse segredo estável: se ele mudar, os
 * dados já criptografados não poderão mais ser lidos.
 */
const ALGO = 'aes-256-gcm'
const PREFIX = 'enc:v1:'

function getKey(): Buffer {
  const secret = process.env.CREDENTIALS_SECRET || process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('CREDENTIALS_SECRET ou AUTH_SECRET precisa estar definido para criptografia')
  }
  return crypto.createHash('sha256').update(secret).digest()
}

/** Criptografa um texto. Strings vazias/nulas passam sem alteração. */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return plain ?? null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64')
}

/**
 * Descriptografa um valor. Valores sem o prefixo `enc:v1:` (dados legados
 * gravados em texto puro antes desta mudança) são devolvidos como estão.
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return value ?? null
  if (!value.startsWith(PREFIX)) return value
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const enc = raw.subarray(28)
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch {
    return value
  }
}
