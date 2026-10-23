import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Conector de IA da Central (servidor MCP): as regras puras, sem banco.
 * O Claude Code e o Codex (no Habblaud) e o Claude se conectam por OAuth com
 * PKCE; aqui ficam a lista fechada de retornos, o PKCE, o formato dos
 * segredos e os metadados que o assistente lê para achar o login.
 * Testado em scripts/tests/mcp-oauth.test.ts.
 */

/** O único escopo: ler a Central como a pessoa que autorizou. */
export const ESCOPO = 'central.leitura'

export const CAMINHO_MCP = '/api/mcp'
export const CAMINHO_AUTORIZAR = '/autorizar'
export const CAMINHO_TOKEN = '/api/mcp/oauth/token'
export const CAMINHO_REGISTRAR = '/api/mcp/oauth/registrar'
export const CAMINHO_METADADOS_RECURSO = '/.well-known/oauth-protected-resource'

export const urlDoConector = (base: string) => `${base}${CAMINHO_MCP}`

/**
 * Endereços de retorno aceitos (para onde o código de autorização vai).
 * Lista FECHADA de propósito: um retorno desconhecido seria o caminho para
 * roubar o código de quem clicou em "Autorizar".
 *   - o Claude (claude.ai e claude.com);
 *   - o ChatGPT;
 *   - o loopback do Claude Code e do Codex (RFC 8252): localhost e
 *     127.0.0.1 em qualquer porta, porque ela muda a cada sessão.
 */
const RETORNOS_FIXOS = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://chat.openai.com/connector_platform_oauth_redirect',
])
const RETORNO_CHATGPT = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/

function loopback(u: URL): boolean {
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.pathname.length > 0 && !u.search && !u.hash
}

export function redirectUriPermitido(uri: string): boolean {
  let u: URL
  try { u = new URL(uri) } catch { return false }
  if (u.username || u.password || u.hash) return false
  if (loopback(u)) return true
  if (u.protocol !== 'https:') return false
  return RETORNOS_FIXOS.has(uri) || RETORNO_CHATGPT.test(uri)
}

/**
 * O retorno pedido casa com o registrado? Igualdade exata, menos no loopback,
 * onde a porta é ignorada (o Claude Code registra sem porta e volta com a da sessão).
 */
export function mesmoRedirect(registrado: string, pedido: string): boolean {
  if (registrado === pedido) return true
  try {
    const a = new URL(registrado)
    const b = new URL(pedido)
    if (!loopback(a) || !loopback(b)) return false
    return a.hostname === b.hostname && a.pathname === b.pathname
  } catch {
    return false
  }
}

/** PKCE S256: o desafio é o SHA-256 do verificador, em base64url. */
export function verificarPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false
  const esperado = Buffer.from(createHash('sha256').update(verifier).digest().toString('base64url'))
  const veio = Buffer.from(challenge)
  return veio.length === esperado.length && timingSafeEqual(veio, esperado)
}

export const hashSha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Segredo novo com prefixo: `cgc_` (código), `cga_` (acesso), `cgr_` (renovação). */
export function novoSegredo(prefixo: 'cgc' | 'cga' | 'cgr'): { valor: string; hash: string } {
  const valor = `${prefixo}_${randomBytes(32).toString('base64url')}`
  return { valor, hash: hashSha256(valor) }
}
export const FORMATO_CODIGO = /^cgc_[A-Za-z0-9_-]{43}$/
export const FORMATO_TOKEN = /^cga_[A-Za-z0-9_-]{43}$/
export const FORMATO_RENOVACAO = /^cgr_[A-Za-z0-9_-]{43}$/

/** RFC 9728: onde está o autorizador deste recurso. */
export function metadadosDoRecurso(base: string) {
  return {
    resource: urlDoConector(base),
    authorization_servers: [base],
    scopes_supported: [ESCOPO],
    bearer_methods_supported: ['header'],
    resource_name: 'VEX Central',
    resource_documentation: `${base}/agentes`,
  }
}

/** RFC 8414: só código de autorização com PKCE S256, cliente público, renovação. */
export function metadadosDoAutorizador(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}${CAMINHO_AUTORIZAR}`,
    token_endpoint: `${base}${CAMINHO_TOKEN}`,
    registration_endpoint: `${base}${CAMINHO_REGISTRAR}`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [ESCOPO],
    service_documentation: `${base}/agentes`,
  }
}

/** O cabeçalho do 401 que leva o assistente ao login. */
export function cabecalhoDe401(base: string, comToken: boolean): string {
  const partes = ['Bearer realm="VEX Central"', `resource_metadata="${base}${CAMINHO_METADADOS_RECURSO}"`, `scope="${ESCOPO}"`]
  if (comToken) partes.splice(1, 0, 'error="invalid_token"')
  return partes.join(', ')
}

// O destino depois do login mora em ./destino.ts (sem Node, roda na tela de login).
export { destinoDepoisDoLogin } from './destino'
