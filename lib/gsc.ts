import { randomBytes } from 'crypto'
import { OAuth2Client } from 'google-auth-library'
import { prisma } from './prisma'
import { encryptSecret, decryptSecret } from './crypto'
import { getSettings } from './settings'
import {
  GSC_SCOPE, cacheKey, isFresh, mergeScopes, mergeTokens, needsRefresh, stateExpiry, isStateUsable,
  type DateRange,
} from './gsc-core'

/**
 * Integração com o Google Search Console.
 *
 * Tokens ficam cifrados em repouso e nunca saem em resposta de API nem em
 * log. A URI de retorno vem sempre de configuração do servidor — nunca de
 * parâmetro do navegador, senão qualquer um redirecionaria o código de
 * autorização para fora.
 */

export class GscError extends Error {}

/**
 * Traduz a falha do Google sem vazar segredo. O corpo de erro do OAuth traz
 * `error` e `error_description` (por exemplo `redirect_uri_mismatch`), que
 * são diagnóstico, não credencial — o token nunca aparece nesses campos.
 */
export function describeGoogleError(err: unknown): string {
  const e = err as {
    message?: string
    response?: { status?: number; data?: { error?: string; error_description?: string } }
  }
  const dados = e?.response?.data
  const codigo = typeof dados?.error === 'string' ? dados.error : null
  const detalhe = typeof dados?.error_description === 'string' ? dados.error_description : null

  const conhecidos: Record<string, string> = {
    redirect_uri_mismatch: 'A URI de retorno não confere com a cadastrada no Google Cloud.',
    invalid_client: 'Client ID ou Client Secret inválidos.',
    invalid_grant: 'O código de autorização expirou ou já foi usado. Comece a conexão de novo.',
    access_denied: 'Autorização recusada no Google.',
    unauthorized_client: 'O cliente OAuth não está autorizado para este fluxo.',
    invalid_scope: 'O escopo pedido não está habilitado no cliente OAuth.',
    admin_policy_enforced: 'A política da organização no Google bloqueou o acesso.',
  }
  if (codigo && conhecidos[codigo]) return `${conhecidos[codigo]} (${codigo})`
  if (codigo) return `${codigo}${detalhe ? `: ${detalhe}` : ''}`
  if (e?.response?.status) return `O Google respondeu ${e.response.status}.`
  return e?.message ? `Falha ao falar com o Google: ${e.message}` : 'Falha ao falar com o Google.'
}

const AUTH_ENDPOINT_SCOPES = [GSC_SCOPE, 'openid', 'email']

/* ------------------------------ credenciais ------------------------------ */

export interface GscCredentials {
  clientId: string
  clientSecret: string
  redirectUri: string
}

function appUrl(): string {
  return (process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')
}

export function defaultRedirectUri(): string {
  return `${appUrl()}/api/gsc/oauth/callback`
}

/**
 * Credenciais do ambiente; sem elas, das configurações do sistema (cifradas).
 * Nada aqui é exposto ao frontend.
 */
export async function getCredentials(): Promise<GscCredentials | null> {
  const doBanco = await getSettings(['GSC_CLIENT_ID', 'GSC_CLIENT_SECRET', 'GSC_REDIRECT_URI'])
  const clientId = (process.env.GSC_CLIENT_ID || doBanco.GSC_CLIENT_ID || '').trim()
  const clientSecret = (process.env.GSC_CLIENT_SECRET || doBanco.GSC_CLIENT_SECRET || '').trim()
  const redirectUri = (process.env.GSC_REDIRECT_URI || doBanco.GSC_REDIRECT_URI || defaultRedirectUri()).trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, redirectUri }
}

export async function missingCredentials(): Promise<string[]> {
  const c = await getCredentials()
  if (c) return []
  const doBanco = await getSettings(['GSC_CLIENT_ID', 'GSC_CLIENT_SECRET'])
  const faltando: string[] = []
  if (!(process.env.GSC_CLIENT_ID || doBanco.GSC_CLIENT_ID)) faltando.push('GSC_CLIENT_ID')
  if (!(process.env.GSC_CLIENT_SECRET || doBanco.GSC_CLIENT_SECRET)) faltando.push('GSC_CLIENT_SECRET')
  return faltando
}

function oauthClient(cred: GscCredentials): OAuth2Client {
  return new OAuth2Client({
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
    redirectUri: cred.redirectUri,
  })
}

/* --------------------------------- state --------------------------------- */

/** Cria o state de uso único e devolve a URL de consentimento. */
export async function buildAuthUrl(
  userId: string,
  extraScopes: string[] = [],
): Promise<{ url: string; redirectUri: string }> {
  const cred = await getCredentials()
  if (!cred) throw new GscError('Credenciais do Google não configuradas no servidor.')

  await prisma.gscOAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  const state = randomBytes(32).toString('base64url')
  await prisma.gscOAuthState.create({ data: { state, userId, expiresAt: stateExpiry() } })

  // Autorização incremental: o que já foi concedido continua valendo
  const escopos = [...new Set([...AUTH_ENDPOINT_SCOPES, ...extraScopes])]
  const url = oauthClient(cred).generateAuthUrl({
    access_type: 'offline', // refresh token para renovar sem novo consentimento
    prompt: 'consent',
    include_granted_scopes: true,
    scope: escopos,
    state,
  })
  return { url, redirectUri: cred.redirectUri }
}

/** Valida e queima o state. Uma tentativa serve uma vez só. */
export async function consumeState(state: string): Promise<{ userId: string }> {
  const row = await prisma.gscOAuthState.findUnique({ where: { state } })
  const check = isStateUsable(row, new Date())
  if (!check.ok || !row) throw new GscError(check.reason ?? 'Tentativa de conexão inválida.')
  await prisma.gscOAuthState.update({ where: { state }, data: { usedAt: new Date() } })
  return { userId: row.userId }
}

/* ------------------------------- conexão ------------------------------- */

/** Troca o código pelos tokens e grava a conexão cifrada. */
export async function exchangeCode(code: string, userId: string) {
  const cred = await getCredentials()
  if (!cred) throw new GscError('Credenciais do Google não configuradas no servidor.')

  const client = oauthClient(cred)
  let tokens
  try {
    const res = await client.getToken(code)
    tokens = res.tokens
  } catch (err) {
    console.error('[gsc] troca do código falhou:', describeGoogleError(err))
    throw new GscError(describeGoogleError(err))
  }
  if (!tokens.access_token) throw new GscError('O Google não devolveu o token de acesso.')

  // O e-mail só identifica a conta na tela; se não vier, a conexão continua
  let email = ''
  if (tokens.id_token) {
    try {
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: cred.clientId })
      email = ticket.getPayload()?.email ?? ''
    } catch (err) {
      console.error('[gsc] id_token não verificado:', describeGoogleError(err))
    }
  }
  if (!email) {
    try {
      client.setCredentials({ access_token: tokens.access_token })
      const info = await client.request<{ email?: string }>({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' })
      email = info.data.email ?? ''
    } catch (err) {
      console.error('[gsc] userinfo indisponível:', describeGoogleError(err))
    }
  }
  if (!email) email = `conta-google-${Date.now().toString(36)}`

  const existente = await prisma.gscConnection.findUnique({ where: { googleEmail: email } })
  const mesclado = mergeTokens(
    {
      refreshToken: existente ? decryptSecret(existente.refreshToken) : null,
      accessToken: null,
      expiryDate: existente?.expiryDate ?? null,
    },
    tokens,
  )

  // Escopos somam: autorizar o Analytics não pode derrubar o Search Console
  const escopos = mergeScopes(existente?.scope, tokens.scope)

  const dados = {
    accessToken: encryptSecret(mesclado.accessToken),
    refreshToken: encryptSecret(mesclado.refreshToken),
    expiryDate: mesclado.expiryDate,
    scope: escopos || GSC_SCOPE,
    status: mesclado.refreshToken ? 'ATIVA' : 'SEM_REFRESH',
    lastError: null,
    connectedById: userId,
  }
  const connection = existente
    ? await prisma.gscConnection.update({ where: { id: existente.id }, data: dados })
    : await prisma.gscConnection.create({ data: { googleEmail: email, ...dados } })

  return { connectionId: connection.id, email, hasRefresh: !!mesclado.refreshToken }
}

export async function getConnection() {
  return prisma.gscConnection.findFirst({ orderBy: { createdAt: 'asc' } })
}

/**
 * Cliente autenticado e pronto. Renova o access token quando preciso e
 * preserva o refresh token — o Google só o envia na primeira autorização.
 */
export async function authorizedClient(connectionId: string): Promise<OAuth2Client> {
  const cred = await getCredentials()
  if (!cred) throw new GscError('Credenciais do Google não configuradas no servidor.')
  const conn = await prisma.gscConnection.findUnique({ where: { id: connectionId } })
  if (!conn) throw new GscError('Conexão não encontrada.')

  const refreshToken = decryptSecret(conn.refreshToken)
  const accessToken = decryptSecret(conn.accessToken)
  const client = oauthClient(cred)
  client.setCredentials({
    access_token: accessToken ?? undefined,
    refresh_token: refreshToken ?? undefined,
    expiry_date: conn.expiryDate?.getTime(),
  })

  if (needsRefresh(conn.expiryDate)) {
    if (!refreshToken) {
      await prisma.gscConnection.update({
        where: { id: conn.id },
        data: { status: 'SEM_REFRESH', lastError: 'Conexão sem refresh token. Reconecte a conta.' },
      })
      throw new GscError('A autorização expirou. Reconecte a conta do Google.')
    }
    try {
      const { credentials } = await client.refreshAccessToken()
      const mesclado = mergeTokens(
        { refreshToken, accessToken, expiryDate: conn.expiryDate },
        credentials,
      )
      await prisma.gscConnection.update({
        where: { id: conn.id },
        data: {
          accessToken: encryptSecret(mesclado.accessToken),
          refreshToken: encryptSecret(mesclado.refreshToken),
          expiryDate: mesclado.expiryDate,
          status: 'ATIVA',
          lastError: null,
        },
      })
      client.setCredentials({
        access_token: mesclado.accessToken ?? undefined,
        refresh_token: mesclado.refreshToken ?? undefined,
        expiry_date: mesclado.expiryDate?.getTime(),
      })
    } catch {
      // Mensagem genérica de propósito: erro do Google pode conter token
      await prisma.gscConnection.update({
        where: { id: conn.id },
        data: { status: 'REVOGADA', lastError: 'A autorização foi revogada ou expirou. Reconecte a conta.' },
      })
      throw new GscError('A autorização foi revogada ou expirou. Reconecte a conta do Google.')
    }
  }
  return client
}

/** Desconecta a conta: revoga no Google e apaga as credenciais locais. */
export async function disconnect(connectionId: string): Promise<{ propriedades: number }> {
  const conn = await prisma.gscConnection.findUnique({
    where: { id: connectionId },
    include: { _count: { select: { properties: true } } },
  })
  if (!conn) throw new GscError('Conexão não encontrada.')

  const token = decryptSecret(conn.refreshToken) ?? decryptSecret(conn.accessToken)
  if (token) {
    try {
      const cred = await getCredentials()
      if (cred) await oauthClient(cred).revokeToken(token)
    } catch {
      // Revogação pode falhar se já estava revogado; seguimos apagando aqui
    }
  }
  // Cascata leva propriedades e cache junto
  await prisma.gscConnection.delete({ where: { id: connectionId } })
  return { propriedades: conn._count.properties }
}

/* ------------------------------ propriedades ------------------------------ */

export interface SiteEntry {
  siteUrl: string
  permissionLevel: string | null
}

export async function listSites(connectionId: string): Promise<SiteEntry[]> {
  const client = await authorizedClient(connectionId)
  const res = await client.request<{ siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> }>({
    url: 'https://www.googleapis.com/webmasters/v3/sites',
  })
  return (res.data.siteEntry ?? [])
    .filter((s): s is { siteUrl: string; permissionLevel?: string } => !!s.siteUrl)
    .map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel ?? null }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl))
}

/** Propriedade só é consultada quando existe vínculo salvo no banco. */
export async function getAuthorizedProperty(propertyId: string) {
  const prop = await prisma.gscProperty.findUnique({
    where: { id: propertyId },
    include: { connection: true, client: { select: { id: true, name: true } } },
  })
  if (!prop) throw new GscError('Propriedade não vinculada.')
  return prop
}

/* -------------------------------- relatórios -------------------------------- */

export interface QueryRow {
  keys?: string[]
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}

async function searchAnalytics(
  connectionId: string,
  siteUrl: string,
  body: Record<string, unknown>,
): Promise<QueryRow[]> {
  const client = await authorizedClient(connectionId)
  // encodeURIComponent preserva sc-domain: e o prefixo de URL como vieram
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`
  const res = await client.request<{ rows?: QueryRow[] }>({ url, method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
  return res.data.rows ?? []
}

export interface Report {
  totals: QueryRow | undefined
  previousTotals: QueryRow | undefined
  byDate: QueryRow[]
  queries: QueryRow[]
  pages: QueryRow[]
}

/**
 * Relatório completo do período, com cache por propriedade + período.
 * Totais vêm de consulta sem dimensão; as tabelas são "principais
 * resultados", porque a API não garante devolver todas as linhas.
 */
export async function getReport(
  propertyId: string,
  range: DateRange,
  previous: { startDate: string; endDate: string },
  opts: { force?: boolean; ttlMinutes?: number } = {},
): Promise<{ report: Report; cached: boolean; fetchedAt: Date }> {
  const prop = await getAuthorizedProperty(propertyId)
  const key = cacheKey(propertyId, range, 'relatorio')

  if (!opts.force) {
    const cache = await prisma.gscCache.findUnique({ where: { key } })
    if (cache && isFresh(cache.expiresAt)) {
      return { report: cache.payload as unknown as Report, cached: true, fetchedAt: cache.fetchedAt }
    }
  }

  const base = { startDate: range.startDate, endDate: range.endDate, dataState: 'final' as const }
  const [totals, previousTotals, byDate, queries, pages] = await Promise.all([
    searchAnalytics(prop.connectionId, prop.siteUrl, { ...base, dimensions: [] }),
    searchAnalytics(prop.connectionId, prop.siteUrl, { ...previous, dataState: 'final', dimensions: [] }),
    searchAnalytics(prop.connectionId, prop.siteUrl, { ...base, dimensions: ['date'], rowLimit: 500 }),
    searchAnalytics(prop.connectionId, prop.siteUrl, { ...base, dimensions: ['query'], rowLimit: 25 }),
    searchAnalytics(prop.connectionId, prop.siteUrl, { ...base, dimensions: ['page'], rowLimit: 25 }),
  ])

  const report: Report = {
    totals: totals[0],
    previousTotals: previousTotals[0],
    byDate,
    queries,
    pages,
  }
  const fetchedAt = new Date()
  const expiresAt = new Date(fetchedAt.getTime() + (opts.ttlMinutes ?? 30) * 60_000)
  await prisma.gscCache.upsert({
    where: { key },
    create: { key, propertyId, payload: report as unknown as object, fetchedAt, expiresAt },
    update: { payload: report as unknown as object, fetchedAt, expiresAt },
  })
  await prisma.gscConnection.update({ where: { id: prop.connectionId }, data: { lastSyncAt: fetchedAt } })
  return { report, cached: false, fetchedAt }
}

/**
 * Pergunta ao Google quais escopos o token realmente tem e regrava.
 *
 * A fonte da verdade é o Google: o que guardamos pode estar desatualizado
 * (escopo revogado na conta) ou ter sido gravado errado. `tokeninfo` devolve
 * a lista exata concedida ao token atual.
 */
export async function syncGrantedScopes(connectionId: string): Promise<string> {
  const client = await authorizedClient(connectionId)
  const token = (await client.getAccessToken()).token
  if (!token) throw new GscError('Sem token de acesso para verificar os escopos.')
  const res = await client.request<{ scope?: string }>({
    url: 'https://www.googleapis.com/oauth2/v3/tokeninfo',
    params: { access_token: token },
  })
  const scope = (res.data.scope ?? '').trim()
  if (scope) await prisma.gscConnection.update({ where: { id: connectionId }, data: { scope } })
  return scope
}
