import { randomBytes } from 'node:crypto'
import {
  ESCOPOS, escoposConcedidos, FORMATO_CODIGO, FORMATO_RENOVACAO, FORMATO_TOKEN, hashSha256, mesmoRedirect, novoSegredo,
  redirectUriPermitido, urlDoConector, verificarPkce,
} from './formato'

/**
 * OAuth do conector de IA, com o banco injetado (Repo): o aplicativo se
 * registra, a pessoa autoriza com a sessão da Central, o aplicativo troca o
 * código por um token de 1 hora e renova com um refresh rotativo. Segredos
 * só como SHA-256. A ligação com o Prisma está em ./oauth.ts; os testes
 * (scripts/tests/mcp-oauth.test.ts) usam um Repo em memória.
 *
 * Quem pode: só administrador ativo. Relido a cada troca e a cada pedido.
 */

export const VALIDADE_CODIGO_MS = 5 * 60 * 1000
export const VALIDADE_ACESSO_SEG = 3600
export const VALIDADE_RENOVACAO_MS = 30 * 24 * 60 * 60 * 1000

export class OAuthErro extends Error {
  constructor(public readonly codigo: string, mensagem: string, public readonly status = 400) {
    super(mensagem)
    this.name = 'OAuthErro'
  }
}
const invalido = (m = 'O código ou o token não vale mais. Conecte de novo pelo seu assistente de IA.') => new OAuthErro('invalid_grant', m)

export interface Usuario { id: string; name: string; isActive: boolean; role: string }

export interface Repo {
  agora(): Date
  criarCliente(c: { clientId: string; name: string; redirectUris: string[] }): Promise<void>
  clientePorClientId(clientId: string): Promise<{ id: string; name: string; redirectUris: string[] } | null>
  tocarCliente(id: string): Promise<void>
  criarCodigo(c: { codeHash: string; mcpClientId: string; userId: string; redirectUri: string; codeChallenge: string; scope: string; expiresAt: Date }): Promise<void>
  codigoPorHash(hash: string): Promise<{
    id: string; mcpClientId: string; userId: string; redirectUri: string; codeChallenge: string; scope: string
    expiresAt: Date; usedAt: Date | null; connectionId: string | null; clientId: string; appName: string
  } | null>
  /** Atômico: true só para quem marcou primeiro. */
  marcarCodigoUsado(id: string): Promise<boolean>
  ligarCodigoAConexao(id: string, connectionId: string): Promise<void>
  criarConexao(c: { userId: string; mcpClientId: string; appName: string; scope: string }): Promise<string>
  revogarConexao(id: string, motivo: string, porId?: string | null): Promise<boolean>
  criarTokens(t: Array<{ connectionId: string; kind: 'ACESSO' | 'RENOVACAO'; hash: string; expiresAt: Date }>): Promise<void>
  tokenPorHash(hash: string, kind: 'ACESSO' | 'RENOVACAO'): Promise<{
    id: string; connectionId: string; expiresAt: Date; usedAt: Date | null
    revokedAt: Date | null; userId: string; appName: string; clientId: string; scope: string
  } | null>
  /** Atômico: true só para quem marcou primeiro. */
  marcarTokenUsado(id: string): Promise<boolean>
  usuario(id: string): Promise<Usuario | null>
}

/** A pessoa ainda pode usar o conector? Só administrador ativo. */
export function podeUsar(u: Usuario | null): u is Usuario {
  return !!u && u.isActive && u.role === 'ADMIN'
}

/* ------------------------------ registro (RFC 7591) ------------------------------ */

export interface ClienteRegistrado {
  client_id: string
  client_id_issued_at: number
  client_name: string
  redirect_uris: string[]
  token_endpoint_auth_method: 'none'
  grant_types: string[]
  response_types: string[]
  scope: string
}

/** Registra o aplicativo, só com retornos conhecidos. Sempre cliente público (sem segredo). */
export async function registrarCliente(corpo: unknown, repo: Repo): Promise<ClienteRegistrado> {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as { client_name?: unknown; redirect_uris?: unknown }
  const lista = Array.isArray(c.redirect_uris) ? c.redirect_uris : null
  if (!lista || lista.length < 1 || lista.length > 10 || !lista.every((u) => typeof u === 'string')) {
    throw new OAuthErro('invalid_client_metadata', 'O registro precisa de redirect_uris (de 1 a 10 endereços).')
  }
  const uris = [...new Set((lista as string[]).map((u) => u.trim()))]
  if (!uris.every(redirectUriPermitido)) {
    throw new OAuthErro('invalid_redirect_uri', 'Este endereço de retorno não é aceito. O conector da Central aceita o Claude, o ChatGPT e o Claude Code/Codex (localhost).')
  }
  const nome = (typeof c.client_name === 'string' ? c.client_name : '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Aplicativo'
  const clientId = randomBytes(24).toString('base64url')
  await repo.criarCliente({ clientId, name: nome, redirectUris: uris })
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(repo.agora().getTime() / 1000),
    client_name: nome,
    redirect_uris: uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: ESCOPOS.join(' '),
  }
}

/* ------------------------------ pedido de autorização ------------------------------ */

export interface PedidoDeAutorizacao {
  mcpClientId: string
  clientId: string
  appNome: string
  redirectUri: string
  codeChallenge: string
  state: string | null
  escopo: string
}

export type ValidacaoDoPedido =
  | { ok: true; pedido: PedidoDeAutorizacao }
  /** Cliente ou retorno desconhecido: o erro fica na nossa tela, NUNCA num redirect. */
  | { ok: false; fatal: string }
  /** Cliente e retorno certos, o resto errado: volta ao aplicativo com `error`. */
  | { ok: false; redirecionar: string }

export async function validarPedido(params: URLSearchParams, base: string, repo: Repo): Promise<ValidacaoDoPedido> {
  const clientId = params.get('client_id') ?? ''
  const redirectUri = params.get('redirect_uri') ?? ''
  const cliente = clientId ? await repo.clientePorClientId(clientId) : null
  if (!cliente) return { ok: false, fatal: 'Aplicativo desconhecido. Comece de novo pelo seu assistente de IA.' }
  if (!redirectUriPermitido(redirectUri) || !cliente.redirectUris.some((r) => mesmoRedirect(r, redirectUri))) {
    return { ok: false, fatal: 'O endereço de retorno não é o que este aplicativo registrou.' }
  }
  const state = params.get('state')
  const voltar = (error: string, descricao: string): ValidacaoDoPedido => {
    const u = new URL(redirectUri)
    u.searchParams.set('error', error)
    u.searchParams.set('error_description', descricao)
    if (state) u.searchParams.set('state', state)
    return { ok: false, redirecionar: u.toString() }
  }
  if (params.get('response_type') !== 'code') return voltar('unsupported_response_type', 'Só o fluxo de código de autorização é aceito.')
  const challenge = params.get('code_challenge') ?? ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || params.get('code_challenge_method') !== 'S256') return voltar('invalid_request', 'PKCE com S256 é obrigatório.')
  const resource = params.get('resource')
  if (resource && resource !== urlDoConector(base)) return voltar('invalid_target', 'Este token só serve para o conector da Central.')
  const escopos = escoposConcedidos(params.get('scope'))
  if (!escopos) return voltar('invalid_scope', `O conector só tem os escopos ${ESCOPOS.join(' e ')}.`)
  return { ok: true, pedido: { mcpClientId: cliente.id, clientId, appNome: cliente.name, redirectUri, codeChallenge: challenge, state, escopo: escopos.join(' ') } }
}

/** Código de 5 minutos, uso único. Devolve a URL de retorno com `code` e `state`. */
export async function emitirCodigo(pedido: PedidoDeAutorizacao, usuario: Usuario | null, repo: Repo): Promise<string> {
  if (!podeUsar(usuario)) throw new OAuthErro('access_denied', 'Só administradores podem conectar assistentes à Central.', 403)
  const { valor, hash } = novoSegredo('cgc')
  await repo.criarCodigo({
    codeHash: hash, mcpClientId: pedido.mcpClientId, userId: usuario.id, redirectUri: pedido.redirectUri,
    codeChallenge: pedido.codeChallenge, scope: pedido.escopo, expiresAt: new Date(repo.agora().getTime() + VALIDADE_CODIGO_MS),
  })
  const u = new URL(pedido.redirectUri)
  u.searchParams.set('code', valor)
  if (pedido.state) u.searchParams.set('state', pedido.state)
  return u.toString()
}

/** A pessoa clicou em Cancelar: o aplicativo recebe access_denied. */
export function urlDeRecusa(pedido: PedidoDeAutorizacao): string {
  const u = new URL(pedido.redirectUri)
  u.searchParams.set('error', 'access_denied')
  u.searchParams.set('error_description', 'A pessoa não autorizou.')
  if (pedido.state) u.searchParams.set('state', pedido.state)
  return u.toString()
}

/* ------------------------------ token ------------------------------ */

export interface RespostaDeToken {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

async function emitirTokens(connectionId: string, escopo: string, repo: Repo): Promise<RespostaDeToken> {
  const acesso = novoSegredo('cga')
  const renovacao = novoSegredo('cgr')
  const agora = repo.agora().getTime()
  await repo.criarTokens([
    { connectionId, kind: 'ACESSO', hash: acesso.hash, expiresAt: new Date(agora + VALIDADE_ACESSO_SEG * 1000) },
    { connectionId, kind: 'RENOVACAO', hash: renovacao.hash, expiresAt: new Date(agora + VALIDADE_RENOVACAO_MS) },
  ])
  return { access_token: acesso.valor, token_type: 'Bearer', expires_in: VALIDADE_ACESSO_SEG, refresh_token: renovacao.valor, scope: escopo }
}

async function trocarCodigo(c: Record<string, string>, repo: Repo): Promise<RespostaDeToken> {
  const code = c.code ?? ''
  if (!FORMATO_CODIGO.test(code)) throw invalido()
  const a = await repo.codigoPorHash(hashSha256(code))
  if (!a) throw invalido()
  if (a.usedAt) {
    // Código trocado de novo: alguém o interceptou. Derruba o que ele gerou.
    if (a.connectionId) await repo.revogarConexao(a.connectionId, 'código de autorização reutilizado')
    throw invalido()
  }
  if (a.expiresAt.getTime() <= repo.agora().getTime()) throw invalido('O código venceu (vale 5 minutos). Conecte de novo.')
  if (a.clientId !== (c.client_id ?? '')) throw invalido()
  if (a.redirectUri !== (c.redirect_uri ?? '')) throw invalido()
  if (!verificarPkce(c.code_verifier ?? '', a.codeChallenge)) throw invalido()
  if (!podeUsar(await repo.usuario(a.userId))) throw invalido('Este acesso não está mais liberado.')
  // Primeira escrita, atômica: duas trocas ao mesmo tempo não ganham as duas
  if (!(await repo.marcarCodigoUsado(a.id))) throw invalido()
  const conexao = await repo.criarConexao({ userId: a.userId, mcpClientId: a.mcpClientId, appName: a.appName, scope: a.scope })
  await repo.ligarCodigoAConexao(a.id, conexao)
  await repo.tocarCliente(a.mcpClientId)
  return emitirTokens(conexao, a.scope, repo)
}

async function renovar(c: Record<string, string>, repo: Repo): Promise<RespostaDeToken> {
  const rt = c.refresh_token ?? ''
  if (!FORMATO_RENOVACAO.test(rt)) throw invalido()
  const t = await repo.tokenPorHash(hashSha256(rt), 'RENOVACAO')
  if (!t) throw invalido()
  if (t.usedAt) {
    // Refresh já trocado voltou: é roubo. Derruba a conexão inteira.
    await repo.revogarConexao(t.connectionId, 'refresh token reutilizado')
    throw invalido()
  }
  if (t.revokedAt || t.expiresAt.getTime() <= repo.agora().getTime()) throw invalido()
  if (c.client_id && c.client_id !== t.clientId) throw invalido()
  if (!podeUsar(await repo.usuario(t.userId))) throw invalido('Este acesso não está mais liberado.')
  if (!(await repo.marcarTokenUsado(t.id))) throw invalido()
  return emitirTokens(t.connectionId, t.scope, repo)
}

/** O token endpoint: `authorization_code` ou `refresh_token`. */
export async function concederToken(campos: Record<string, string>, repo: Repo): Promise<RespostaDeToken> {
  const grant = campos.grant_type ?? ''
  if (grant === 'authorization_code') return trocarCodigo(campos, repo)
  if (grant === 'refresh_token') return renovar(campos, repo)
  throw new OAuthErro('unsupported_grant_type', 'Só authorization_code e refresh_token.')
}

/* ------------------------------ autenticar um pedido ao /api/mcp ------------------------------ */

export interface ConexaoAutenticada { id: string; userId: string; appName: string; scope: string }
export type AutenticacaoMcp =
  | { ok: true; usuario: Usuario; conexao: ConexaoAutenticada }
  | { ok: false; motivo: 'ausente' | 'invalido' | 'vencido' | 'revogado' | 'sem_acesso' }

/**
 * Quem está chamando o servidor MCP. O token leva à conexão, a conexão à
 * pessoa; acesso e papel relidos AQUI, a cada pedido: desativar a pessoa ou
 * tirar o administrador vale no pedido seguinte, sem esperar o token vencer.
 */
export async function autenticarToken(authorization: string | null, repo: Repo): Promise<AutenticacaoMcp> {
  const v = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '')?.[1]
  if (!v) return { ok: false, motivo: 'ausente' }
  if (!FORMATO_TOKEN.test(v)) return { ok: false, motivo: 'invalido' }
  const t = await repo.tokenPorHash(hashSha256(v), 'ACESSO')
  if (!t) return { ok: false, motivo: 'invalido' }
  if (t.revokedAt) return { ok: false, motivo: 'revogado' }
  if (t.expiresAt.getTime() <= repo.agora().getTime()) return { ok: false, motivo: 'vencido' }
  const u = await repo.usuario(t.userId)
  if (!podeUsar(u)) return { ok: false, motivo: 'sem_acesso' }
  return { ok: true, usuario: u, conexao: { id: t.connectionId, userId: t.userId, appName: t.appName, scope: t.scope } }
}

/** Só os filtros, curtos: a resposta nunca entra no diário. */
export function argumentosParaDiario(argumentos: unknown): Record<string, string | number | boolean | null> {
  const args: Record<string, string | number | boolean | null> = {}
  if (argumentos && typeof argumentos === 'object') {
    for (const [k, v] of Object.entries(argumentos as Record<string, unknown>).slice(0, 20)) {
      args[k.slice(0, 40)] = typeof v === 'string' ? v.slice(0, 200) : typeof v === 'number' || typeof v === 'boolean' || v === null ? v : String(v).slice(0, 200)
    }
  }
  return args
}
