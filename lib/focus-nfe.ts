import { prisma } from './prisma'
import { focusBasicAuth } from './billing-core'

/**
 * Cliente HTTP da Focus NFe — exclusivo do backend.
 *
 * - HTTP Basic: o token é o usuário e a senha é vazia (Base64("token:")).
 * - Tokens de homologação e produção são separados e escolhidos por
 *   FOCUS_NFE_ENV; base URLs próprias por ambiente.
 * - FOCUS_NFSE_MODE: 'municipal' usa /v2/nfse; 'national' usa /v2/nfsen.
 * - Nada de token em logs, respostas ou frontend.
 */

const HOMOLOG_URL = process.env.FOCUS_NFE_HOMOLOGACAO_BASE_URL || 'https://homologacao.focusnfe.com.br'
const PROD_URL = process.env.FOCUS_NFE_PRODUCAO_BASE_URL || 'https://api.focusnfe.com.br'

async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.systemSettings.findMany({ where: { key: { in: keys } } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function getFocusConfig() {
  const s = await getSettings([
    'FOCUS_NFE_ENV', 'FOCUS_NFE_TOKEN_HOMOLOGACAO', 'FOCUS_NFE_TOKEN_PRODUCAO',
    'FOCUS_NFSE_MODE', 'FOCUS_WEBHOOK_TOKEN', 'FOCUS_CERT_STATUS',
  ])
  const env = (s.FOCUS_NFE_ENV || process.env.FOCUS_NFE_ENV || 'homologacao').toLowerCase()
  const isProd = env === 'producao' || env === 'production'
  const mode = (s.FOCUS_NFSE_MODE || process.env.FOCUS_NFSE_MODE || 'municipal').toLowerCase()
  return {
    env: isProd ? 'producao' : 'homologacao',
    baseUrl: isProd ? PROD_URL : HOMOLOG_URL,
    token: isProd
      ? s.FOCUS_NFE_TOKEN_PRODUCAO || process.env.FOCUS_NFE_TOKEN_PRODUCAO || ''
      : s.FOCUS_NFE_TOKEN_HOMOLOGACAO || process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO || '',
    mode: mode === 'national' || mode === 'nacional' ? 'national' : 'municipal',
    webhookToken: s.FOCUS_WEBHOOK_TOKEN || process.env.FOCUS_WEBHOOK_TOKEN || '',
    // Certificado digital e-CNPJ A1: enquanto PENDING, a emissão de NFS-e
    // fica bloqueada (estado controlado — Asaas e o resto seguem normais).
    // Após cadastrar o certificado na Focus, gravar FOCUS_CERT_STATUS=OK.
    certStatus: (s.FOCUS_CERT_STATUS || process.env.FOCUS_CERT_STATUS || 'PENDING').toUpperCase(),
  }
}

/** Prefixo da API conforme o modo (municipal /v2/nfse, nacional /v2/nfsen). */
export async function nfsePath(): Promise<string> {
  const { mode } = await getFocusConfig()
  return mode === 'national' ? '/v2/nfsen' : '/v2/nfse'
}

export class FocusError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function focusFetch(path: string, init?: RequestInit & { timeoutMs?: number }) {
  const { baseUrl, token } = await getFocusConfig()
  if (!token) throw new FocusError(0, 'Token da Focus NFe não configurado para o ambiente atual.')

  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: focusBasicAuth(token),
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000),
    })
  } catch (err) {
    throw new FocusError(0, /abort|timeout/i.test(String(err)) ? 'TIMEOUT' : 'Falha de conexão com a Focus NFe.')
  }

  const body = await res.json().catch(() => null)
  if (!res.ok && res.status !== 422) {
    const desc =
      (body as { mensagem?: string; erros?: Array<{ mensagem?: string }> })?.mensagem ??
      (body as { erros?: Array<{ mensagem?: string }> })?.erros?.[0]?.mensagem ??
      `HTTP ${res.status}`
    throw new FocusError(res.status, `Focus: ${String(desc).slice(0, 300)}`)
  }
  return { status: res.status, body }
}

async function log(action: string, refId: string | null, ok: boolean, error?: string) {
  await prisma.integrationLog.create({
    data: { provider: 'FOCUS', action, refId, ok, error: error?.slice(0, 500) ?? null },
  }).catch(() => {})
}

/* --------------------------------- NFS-e --------------------------------- */

export async function emitNfse(ref: string, payload: object) {
  const base = await nfsePath()
  try {
    const r = await focusFetch(`${base}?ref=${encodeURIComponent(ref)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    await log('emitNfse', ref, true)
    return r
  } catch (err) {
    await log('emitNfse', ref, false, String(err))
    throw err
  }
}

export async function consultNfse(ref: string) {
  const base = await nfsePath()
  return focusFetch(`${base}/${encodeURIComponent(ref)}`)
}

export async function cancelNfse(ref: string, justificativa: string) {
  const base = await nfsePath()
  try {
    const r = await focusFetch(`${base}/${encodeURIComponent(ref)}`, {
      method: 'DELETE',
      body: JSON.stringify({ justificativa }),
    })
    await log('cancelNfse', ref, true)
    return r
  } catch (err) {
    await log('cancelNfse', ref, false, String(err))
    throw err
  }
}

export async function resendNfseEmail(ref: string, emails: string[]) {
  const base = await nfsePath()
  try {
    const r = await focusFetch(`${base}/${encodeURIComponent(ref)}/email`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    })
    await log('resendEmail', ref, true)
    return r
  } catch (err) {
    await log('resendEmail', ref, false, String(err))
    throw err
  }
}

export async function resendNfseHook(ref: string) {
  const base = await nfsePath()
  return focusFetch(`${base}/${encodeURIComponent(ref)}/hook`, { method: 'POST' })
}

/* -------------------------------- webhooks -------------------------------- */

export async function listHooks() {
  const r = await focusFetch('/v2/hooks')
  return (Array.isArray(r.body) ? r.body : []) as Array<{ id?: string; url?: string; event?: string }>
}

/** Garante o gatilho nfse/nfsen apontando para o sistema, com token secreto. */
export async function ensureHook(url: string, webhookToken: string, cnpj?: string): Promise<{ created: boolean }> {
  const { mode } = await getFocusConfig()
  const event = mode === 'national' ? 'nfsen' : 'nfse'
  // Token na query string (validado no endpoint) — headers personalizados
  // não são garantidos em todas as contas Focus
  const hookUrl = `${url}?token=${encodeURIComponent(webhookToken)}`
  const hooks = await listHooks()
  if (hooks.some((h) => (h.url === hookUrl || h.url === url) && h.event === event)) return { created: false }
  await focusFetch('/v2/hooks', {
    method: 'POST',
    body: JSON.stringify({
      url: hookUrl,
      event,
      ...(cnpj ? { cnpj: cnpj.replace(/\D/g, '') } : {}),
    }),
  })
  await log('ensureHook', url, true)
  return { created: true }
}

/* ------------------------------- diagnóstico ------------------------------- */

/**
 * Testa credencial sem efeito colateral: consulta uma referência inexistente.
 * 404 = autenticou (não achou a nota); 401/403 = token inválido.
 */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const base = await nfsePath()
    const { baseUrl, token } = await getFocusConfig()
    if (!token) return { ok: false, error: 'Token não configurado.' }
    const res = await fetch(`${baseUrl}${base}/diagnostico-vex-000`, {
      headers: { Authorization: focusBasicAuth(token) },
      signal: AbortSignal.timeout(20_000),
    })
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'Token inválido para o ambiente atual.' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
