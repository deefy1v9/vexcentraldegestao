import { prisma } from './prisma'

/**
 * Cliente HTTP do Asaas — exclusivo do backend.
 *
 * - Autenticação pelo header `access_token` (a API Key; Wallet ID não serve).
 * - Ambientes rigidamente separados: sandbox e produção têm base URLs
 *   próprias; a escolha vem de ASAAS_ENV (SystemSettings/env).
 * - Tokens nunca aparecem em logs, respostas HTTP ou no frontend.
 * - Timeout de 30s e erros sanitizados (sem headers, sem token).
 */

const SANDBOX_URL = process.env.ASAAS_SANDBOX_BASE_URL || 'https://api-sandbox.asaas.com/v3'
const PRODUCTION_URL = process.env.ASAAS_PRODUCTION_BASE_URL || 'https://api.asaas.com/v3'

async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.systemSettings.findMany({ where: { key: { in: keys } } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function getAsaasConfig() {
  const s = await getSettings(['ASAAS_ENV', 'ASAAS_API_KEY', 'ASAAS_WEBHOOK_TOKEN'])
  const env = (s.ASAAS_ENV || process.env.ASAAS_ENV || 'sandbox').toLowerCase()
  return {
    env: env === 'production' ? 'production' : 'sandbox',
    baseUrl: env === 'production' ? PRODUCTION_URL : SANDBOX_URL,
    apiKey: s.ASAAS_API_KEY || process.env.ASAAS_API_KEY || '',
    webhookToken: s.ASAAS_WEBHOOK_TOKEN || process.env.ASAAS_WEBHOOK_TOKEN || '',
  }
}

export class AsaasError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function asaasFetch(path: string, init?: RequestInit & { timeoutMs?: number }) {
  const { baseUrl, apiKey } = await getAsaasConfig()
  if (!apiKey) throw new AsaasError(0, 'ASAAS_API_KEY não configurada.')

  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        access_token: apiKey,
        'User-Agent': 'vex-gestao',
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000),
    })
  } catch (err) {
    // Timeout/rede: o chamador decide consultar por externalReference antes
    // de repetir um POST
    throw new AsaasError(0, /abort|timeout/i.test(String(err)) ? 'TIMEOUT' : 'Falha de conexão com o Asaas.')
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const desc =
      (body as { errors?: Array<{ description?: string }> })?.errors?.[0]?.description ??
      `HTTP ${res.status}`
    // Mensagem sanitizada: nunca inclui token nem headers
    throw new AsaasError(res.status, `Asaas: ${String(desc).slice(0, 300)}`)
  }
  return body
}

async function log(action: string, refId: string | null, ok: boolean, error?: string) {
  await prisma.integrationLog.create({
    data: { provider: 'ASAAS', action, refId, ok, error: error?.slice(0, 500) ?? null },
  }).catch(() => {})
}

/* --------------------------------- clientes -------------------------------- */

export interface AsaasCustomerPayload {
  name: string
  cpfCnpj: string
  email?: string
  phone?: string
  postalCode?: string
  address?: string
  addressNumber?: string
  complement?: string
  province?: string // bairro
  externalReference: string
  notificationDisabled: boolean
  additionalEmails?: string
  municipalInscription?: string
}

interface AsaasCustomer {
  id: string
  name: string
  cpfCnpj?: string
  deleted?: boolean
}

export async function findCustomerByExternalRef(externalReference: string): Promise<AsaasCustomer | null> {
  const data = await asaasFetch(`/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`)
  const item = (data as { data?: AsaasCustomer[] })?.data?.[0]
  return item && !item.deleted ? item : null
}

export async function findCustomerByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomer | null> {
  const digits = cpfCnpj.replace(/\D/g, '')
  if (!digits) return null
  const data = await asaasFetch(`/customers?cpfCnpj=${digits}&limit=1`)
  const item = (data as { data?: AsaasCustomer[] })?.data?.[0]
  return item && !item.deleted ? item : null
}

export async function createCustomer(payload: AsaasCustomerPayload): Promise<AsaasCustomer> {
  try {
    const data = (await asaasFetch('/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    })) as AsaasCustomer
    await log('createCustomer', data.id, true)
    return data
  } catch (err) {
    await log('createCustomer', payload.externalReference, false, String(err))
    throw err
  }
}

export async function updateCustomer(id: string, payload: Partial<AsaasCustomerPayload>): Promise<AsaasCustomer> {
  try {
    const data = (await asaasFetch(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })) as AsaasCustomer
    await log('updateCustomer', id, true)
    return data
  } catch (err) {
    await log('updateCustomer', id, false, String(err))
    throw err
  }
}

/* --------------------------------- cobranças -------------------------------- */

export interface AsaasPayment {
  id: string
  status: string
  value: number
  netValue?: number
  billingType?: string
  dueDate?: string
  invoiceUrl?: string
  bankSlipUrl?: string
  externalReference?: string
  confirmedDate?: string
  paymentDate?: string
  clientPaymentDate?: string
  creditDate?: string
  deleted?: boolean
}

export async function createPayment(payload: {
  customer: string
  billingType: string
  value: number
  dueDate: string
  description: string
  externalReference: string
}): Promise<AsaasPayment> {
  try {
    const data = (await asaasFetch('/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    })) as AsaasPayment
    await log('createPayment', data.id, true)
    return data
  } catch (err) {
    await log('createPayment', payload.externalReference, false, String(err))
    throw err
  }
}

export async function findPaymentByExternalRef(externalReference: string): Promise<AsaasPayment | null> {
  const data = await asaasFetch(`/payments?externalReference=${encodeURIComponent(externalReference)}&limit=1`)
  const item = (data as { data?: AsaasPayment[] })?.data?.[0]
  return item && !item.deleted ? item : null
}

export async function getPayment(id: string): Promise<AsaasPayment> {
  return (await asaasFetch(`/payments/${id}`)) as AsaasPayment
}

export async function getIdentificationField(id: string): Promise<{ identificationField?: string; barCode?: string }> {
  return (await asaasFetch(`/payments/${id}/identificationField`)) as {
    identificationField?: string
    barCode?: string
  }
}

/* ------------------------------- diagnóstico ------------------------------- */

/** Testa a conexão sem efeitos colaterais (GET com limit=1). */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    await asaasFetch('/customers?limit=1')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Lista webhooks cadastrados (para o diagnóstico saber se está configurado). */
export async function listWebhooks(): Promise<Array<{ url?: string; enabled?: boolean; events?: string[] }>> {
  const data = await asaasFetch('/webhooks')
  return ((data as { data?: Array<{ url?: string; enabled?: boolean; events?: string[] }> })?.data) ?? []
}

/** Cria/garante o webhook de cobranças apontando para o sistema. */
export async function ensureWebhook(url: string, authToken: string): Promise<{ created: boolean }> {
  const existing = await listWebhooks()
  if (existing.some((w) => w.url === url && w.enabled !== false)) return { created: false }
  await asaasFetch('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      name: 'VEX Central de Gestão',
      url,
      email: undefined,
      enabled: true,
      interrupted: false,
      authToken,
      sendType: 'SEQUENTIALLY',
      events: [
        'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED',
        'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED',
        'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_BANK_SLIP_CANCELLED',
      ],
    }),
  })
  await log('ensureWebhook', url, true)
  return { created: true }
}
