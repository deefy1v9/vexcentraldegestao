import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import {
  cabecalhoDe401, destinoDepoisDoLogin, ESCOPO, hashSha256, mesmoRedirect, metadadosDoAutorizador, metadadosDoRecurso,
  redirectUriPermitido, verificarPkce,
} from '../../lib/mcp/formato'
import {
  argumentosParaDiario, autenticarToken, concederToken, emitirCodigo, OAuthErro, podeUsar, registrarCliente, urlDeRecusa,
  validarPedido, VALIDADE_ACESSO_SEG, type Repo, type Usuario,
} from '../../lib/mcp/oauth-core'
import { criarLimitador } from '../../lib/mcp/limite'

const BASE = 'https://central.vexgrowth.com.br'
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback'

/* ------------------------------ banco em memória ------------------------------ */

type Tab = Record<string, Record<string, unknown>>
function repoFalso(agoraInicial = new Date('2026-10-23T15:00:00Z')) {
  let agora = agoraInicial
  let seq = 0
  const id = () => `id${++seq}`
  const clientes: Tab = {}, codigos: Tab = {}, conexoes: Tab = {}, tokens: Tab = {}
  const usuarios: Record<string, Usuario> = {
    adm: { id: 'adm', name: 'Antonio Gomes', isActive: true, role: 'ADMIN' },
    col: { id: 'col', name: 'Colaborador', isActive: true, role: 'COLABORADOR' },
  }
  const repo: Repo = {
    agora: () => agora,
    async criarCliente(c) { const i = id(); clientes[i] = { id: i, ...c } },
    async clientePorClientId(cid) {
      const c = Object.values(clientes).find((x) => x.clientId === cid)
      return c ? { id: c.id as string, name: c.name as string, redirectUris: c.redirectUris as string[] } : null
    },
    async tocarCliente() {},
    async criarCodigo(c) { const i = id(); codigos[i] = { id: i, usedAt: null, connectionId: null, ...c } },
    async codigoPorHash(h) {
      const a = Object.values(codigos).find((x) => x.codeHash === h)
      if (!a) return null
      const cl = clientes[a.mcpClientId as string]
      return { ...(a as Record<string, unknown>), clientId: cl.clientId as string, appName: cl.name as string } as never
    },
    async marcarCodigoUsado(i) { if (codigos[i].usedAt) return false; codigos[i].usedAt = agora; return true },
    async ligarCodigoAConexao(i, c) { codigos[i].connectionId = c },
    async criarConexao(c) { const i = id(); conexoes[i] = { id: i, revokedAt: null, ...c }; return i },
    async revogarConexao(i, motivo) { if (!conexoes[i] || conexoes[i].revokedAt) return false; conexoes[i].revokedAt = agora; conexoes[i].revokedReason = motivo; return true },
    async criarTokens(ts) { for (const t of ts) { const i = id(); tokens[i] = { id: i, usedAt: null, ...t } } },
    async tokenPorHash(h, kind) {
      const t = Object.values(tokens).find((x) => x.hash === h && x.kind === kind)
      if (!t) return null
      const c = conexoes[t.connectionId as string]
      const cl = clientes[c.mcpClientId as string]
      return { id: t.id as string, connectionId: c.id as string, expiresAt: t.expiresAt as Date, usedAt: t.usedAt as Date | null, revokedAt: c.revokedAt as Date | null, userId: c.userId as string, appName: c.appName as string, clientId: cl.clientId as string, scope: c.scope as string }
    },
    async marcarTokenUsado(i) { if (tokens[i].usedAt) return false; tokens[i].usedAt = agora; return true },
    async usuario(i) { return usuarios[i] ?? null },
  }
  return { repo, conexoes, usuarios, passar: (ms: number) => { agora = new Date(agora.getTime() + ms) } }
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

function pedidoParams(clientId: string, challenge: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: CLAUDE, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: ESCOPO, ...extra })
}

/** Registro → consentimento do admin → troca. Devolve os tokens. */
async function conectar(f: ReturnType<typeof repoFalso>, usuario = 'adm') {
  const reg = await registrarCliente({ client_name: 'Claude Code', redirect_uris: [CLAUDE] }, f.repo)
  const p = pkce()
  const v = await validarPedido(pedidoParams(reg.client_id, p.challenge), BASE, f.repo)
  assert.ok(v.ok)
  const volta = new URL(await emitirCodigo(v.pedido, f.usuarios[usuario], f.repo))
  const code = volta.searchParams.get('code')!
  const tokens = await concederToken({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri: CLAUDE, code_verifier: p.verifier }, f.repo)
  return { reg, p, code, tokens, volta }
}

/* ------------------------------ regras puras ------------------------------ */

test('retornos: só Claude, ChatGPT e loopback do Claude Code/Codex', () => {
  for (const ok of [CLAUDE, 'https://claude.com/api/mcp/auth_callback', 'https://chatgpt.com/connector_platform_oauth_redirect', 'https://chatgpt.com/connector/oauth/abc_123', 'http://localhost:33418/callback', 'http://127.0.0.1:5173/oauth/callback']) {
    assert.ok(redirectUriPermitido(ok), ok)
  }
  for (const ruim of ['https://evil.com/callback', 'http://claude.ai/api/mcp/auth_callback', 'https://claude.ai/api/mcp/auth_callback?x=1', 'https://claude.ai.evil.com/api/mcp/auth_callback', 'http://localhost:3000/cb#frag', 'http://user:pw@localhost/cb', 'http://10.0.0.1/cb', 'nem-url']) {
    assert.ok(!redirectUriPermitido(ruim), ruim)
  }
})

test('retorno casa exato; no loopback a porta pode mudar', () => {
  assert.ok(mesmoRedirect(CLAUDE, CLAUDE))
  assert.ok(mesmoRedirect('http://localhost/callback', 'http://localhost:51234/callback'))
  assert.ok(!mesmoRedirect('http://localhost/callback', 'http://localhost:51234/outro'))
  assert.ok(!mesmoRedirect('http://localhost/callback', 'http://127.0.0.1:51234/callback'))
  assert.ok(!mesmoRedirect(CLAUDE, 'https://claude.com/api/mcp/auth_callback'))
})

test('PKCE S256: só o verificador certo passa', () => {
  const p = pkce()
  assert.ok(verificarPkce(p.verifier, p.challenge))
  assert.ok(!verificarPkce(pkce().verifier, p.challenge))
  assert.ok(!verificarPkce('curto', p.challenge))
})

test('metadados e 401 apontam para o login da Central', () => {
  assert.equal(metadadosDoRecurso(BASE).resource, `${BASE}/api/mcp`)
  assert.deepEqual(metadadosDoRecurso(BASE).authorization_servers, [BASE])
  const a = metadadosDoAutorizador(BASE)
  assert.equal(a.authorization_endpoint, `${BASE}/autorizar`)
  assert.deepEqual(a.code_challenge_methods_supported, ['S256'])
  assert.deepEqual(a.token_endpoint_auth_methods_supported, ['none'])
  assert.match(cabecalhoDe401(BASE, false), /resource_metadata="https:\/\/central\.vexgrowth\.com\.br\/\.well-known\/oauth-protected-resource"/)
  assert.match(cabecalhoDe401(BASE, true), /error="invalid_token"/)
  assert.doesNotMatch(cabecalhoDe401(BASE, false), /invalid_token/)
})

test('login volta só para dentro da Central (sem redirecionamento aberto)', () => {
  assert.equal(destinoDepoisDoLogin(`${BASE}/autorizar?client_id=a&state=b`, BASE), '/autorizar?client_id=a&state=b')
  assert.equal(destinoDepoisDoLogin('/autorizar?x=1', BASE), '/autorizar?x=1')
  assert.equal(destinoDepoisDoLogin('https://evil.com/autorizar', BASE), '/dashboard')
  assert.equal(destinoDepoisDoLogin('//evil.com/x', BASE), '/dashboard')
  assert.equal(destinoDepoisDoLogin('/login', BASE), '/dashboard')
  assert.equal(destinoDepoisDoLogin(null, BASE), '/dashboard')
})

test('diário guarda só filtros curtos', () => {
  const a = argumentosParaDiario({ competencia: '2026-10', termo: 'x'.repeat(500), n: 3, sim: true, nada: null, obj: { a: 1 } })
  assert.equal(a.competencia, '2026-10')
  assert.equal((a.termo as string).length, 200)
  assert.equal(a.n, 3)
  assert.equal(a.sim, true)
  assert.equal(a.nada, null)
  assert.equal(a.obj, '[object Object]')
  assert.deepEqual(argumentosParaDiario(undefined), {})
})

test('freio: estoura no limite e libera depois da janela', () => {
  const l = criarLimitador(2, 60_000)
  assert.deepEqual(l.conferir('k', 0), { ok: true })
  assert.deepEqual(l.conferir('k', 1000), { ok: true })
  const r = l.conferir('k', 2000)
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.esperarSeg === 58)
  assert.deepEqual(l.conferir('outra', 2000), { ok: true })
  assert.deepEqual(l.conferir('k', 60_001), { ok: true })
})

/* ------------------------------ fluxo OAuth ------------------------------ */

test('registro: recusa retorno desconhecido e lista vazia; cliente público', async () => {
  const f = repoFalso()
  await assert.rejects(registrarCliente({ redirect_uris: ['https://evil.com/cb'] }, f.repo), (e: OAuthErro) => e.codigo === 'invalid_redirect_uri')
  await assert.rejects(registrarCliente({ redirect_uris: [] }, f.repo), (e: OAuthErro) => e.codigo === 'invalid_client_metadata')
  await assert.rejects(registrarCliente(null, f.repo), (e: OAuthErro) => e.codigo === 'invalid_client_metadata')
  const r = await registrarCliente({ client_name: '  Claude   Code ', redirect_uris: [CLAUDE, CLAUDE] }, f.repo)
  assert.equal(r.client_name, 'Claude Code')
  assert.deepEqual(r.redirect_uris, [CLAUDE])
  assert.equal(r.token_endpoint_auth_method, 'none')
})

test('pedido: cliente ou retorno desconhecido fica na nossa tela; o resto volta ao app com erro e state', async () => {
  const f = repoFalso()
  const reg = await registrarCliente({ redirect_uris: [CLAUDE] }, f.repo)
  const p = pkce()
  const desconhecido = await validarPedido(pedidoParams('nao-existe', p.challenge), BASE, f.repo)
  assert.ok(!desconhecido.ok && 'fatal' in desconhecido)
  const outroRetorno = await validarPedido(pedidoParams(reg.client_id, p.challenge, { redirect_uri: 'https://claude.com/api/mcp/auth_callback' }), BASE, f.repo)
  assert.ok(!outroRetorno.ok && 'fatal' in outroRetorno)
  for (const [extra, erro] of [
    [{ response_type: 'token' }, 'unsupported_response_type'],
    [{ code_challenge_method: 'plain' }, 'invalid_request'],
    [{ code_challenge: 'curto' }, 'invalid_request'],
    [{ scope: 'admin' }, 'invalid_scope'],
    [{ resource: 'https://outro.com/api/mcp' }, 'invalid_target'],
  ] as const) {
    const v = await validarPedido(pedidoParams(reg.client_id, p.challenge, extra), BASE, f.repo)
    assert.ok(!v.ok && 'redirecionar' in v, erro)
    const u = new URL((v as { redirecionar: string }).redirecionar)
    assert.equal(u.origin + u.pathname, CLAUDE)
    assert.equal(u.searchParams.get('error'), erro)
    assert.equal(u.searchParams.get('state'), 'xyz')
  }
  const ok = await validarPedido(pedidoParams(reg.client_id, p.challenge, { scope: `${ESCOPO} offline_access`, resource: `${BASE}/api/mcp` }), BASE, f.repo)
  assert.ok(ok.ok)
})

test('fluxo completo: admin autoriza, troca o código e o token abre o conector', async () => {
  const f = repoFalso()
  const { tokens, volta } = await conectar(f)
  assert.equal(volta.searchParams.get('state'), 'xyz')
  assert.equal(tokens.token_type, 'Bearer')
  assert.equal(tokens.expires_in, VALIDADE_ACESSO_SEG)
  const aut = await autenticarToken(`Bearer ${tokens.access_token}`, f.repo)
  assert.ok(aut.ok)
  assert.equal(aut.ok && aut.usuario.id, 'adm')
  assert.equal(aut.ok && aut.conexao.appName, 'Claude Code')
})

test('consentimento: colaborador não autoriza; Cancelar devolve access_denied', async () => {
  const f = repoFalso()
  const reg = await registrarCliente({ redirect_uris: [CLAUDE] }, f.repo)
  const v = await validarPedido(pedidoParams(reg.client_id, pkce().challenge), BASE, f.repo)
  assert.ok(v.ok)
  await assert.rejects(emitirCodigo(v.pedido, f.usuarios.col, f.repo), (e: OAuthErro) => e.codigo === 'access_denied')
  await assert.rejects(emitirCodigo(v.pedido, null, f.repo), (e: OAuthErro) => e.codigo === 'access_denied')
  const recusa = new URL(urlDeRecusa(v.pedido))
  assert.equal(recusa.searchParams.get('error'), 'access_denied')
  assert.equal(recusa.searchParams.get('state'), 'xyz')
  assert.equal(podeUsar({ id: 'x', name: 'x', isActive: false, role: 'ADMIN' }), false)
})

test('troca: PKCE, cliente e retorno têm que bater; código vence em 5 min', async () => {
  const f = repoFalso()
  const reg = await registrarCliente({ redirect_uris: [CLAUDE] }, f.repo)
  const novoCodigo = async () => {
    const p = pkce()
    const v = await validarPedido(pedidoParams(reg.client_id, p.challenge), BASE, f.repo)
    assert.ok(v.ok)
    return { p, code: new URL(await emitirCodigo(v.pedido, f.usuarios.adm, f.repo)).searchParams.get('code')! }
  }
  const base = (c: { p: { verifier: string }; code: string }) => ({ grant_type: 'authorization_code', code: c.code, client_id: reg.client_id, redirect_uri: CLAUDE, code_verifier: c.p.verifier })
  const invalido = (e: OAuthErro) => e.codigo === 'invalid_grant'
  let c = await novoCodigo()
  await assert.rejects(concederToken({ ...base(c), code_verifier: pkce().verifier }, f.repo), invalido)
  c = await novoCodigo()
  await assert.rejects(concederToken({ ...base(c), client_id: 'outro' }, f.repo), invalido)
  c = await novoCodigo()
  await assert.rejects(concederToken({ ...base(c), redirect_uri: 'https://claude.com/api/mcp/auth_callback' }, f.repo), invalido)
  c = await novoCodigo()
  f.passar(5 * 60 * 1000 + 1)
  await assert.rejects(concederToken(base(c), f.repo), invalido)
  await assert.rejects(concederToken({ grant_type: 'password' }, f.repo), (e: OAuthErro) => e.codigo === 'unsupported_grant_type')
  await assert.rejects(concederToken({ grant_type: 'authorization_code', code: 'lixo' }, f.repo), invalido)
})

test('código usado de novo (vazou): recusa e derruba a conexão que ele criou', async () => {
  const f = repoFalso()
  const { reg, p, code, tokens } = await conectar(f)
  await assert.rejects(concederToken({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri: CLAUDE, code_verifier: p.verifier }, f.repo))
  assert.deepEqual(await autenticarToken(`Bearer ${tokens.access_token}`, f.repo), { ok: false, motivo: 'revogado' })
})

test('renovação: rotativa; o refresh antigo de volta derruba tudo', async () => {
  const f = repoFalso()
  const { reg, tokens } = await conectar(f)
  const novos = await concederToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: reg.client_id }, f.repo)
  assert.notEqual(novos.access_token, tokens.access_token)
  assert.ok((await autenticarToken(`Bearer ${novos.access_token}`, f.repo)).ok)
  // roubo: o refresh já trocado volta
  await assert.rejects(concederToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, f.repo), (e: OAuthErro) => e.codigo === 'invalid_grant')
  assert.deepEqual(await autenticarToken(`Bearer ${novos.access_token}`, f.repo), { ok: false, motivo: 'revogado' })
  await assert.rejects(concederToken({ grant_type: 'refresh_token', refresh_token: novos.refresh_token }, f.repo))
})

test('renovação: outro cliente não renova; refresh vence em 30 dias', async () => {
  const f = repoFalso()
  const { tokens } = await conectar(f)
  await assert.rejects(concederToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: 'outro' }, f.repo))
  const f2 = repoFalso()
  const c2 = await conectar(f2)
  f2.passar(30 * 24 * 60 * 60 * 1000 + 1)
  await assert.rejects(concederToken({ grant_type: 'refresh_token', refresh_token: c2.tokens.refresh_token }, f2.repo))
})

test('cada pedido relê a pessoa: desativar ou tirar o admin derruba na hora', async () => {
  const f = repoFalso()
  const { tokens, reg } = await conectar(f)
  f.usuarios.adm.role = 'COLABORADOR'
  assert.deepEqual(await autenticarToken(`Bearer ${tokens.access_token}`, f.repo), { ok: false, motivo: 'sem_acesso' })
  await assert.rejects(concederToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: reg.client_id }, f.repo))
  f.usuarios.adm.role = 'ADMIN'
  f.usuarios.adm.isActive = false
  assert.deepEqual(await autenticarToken(`Bearer ${tokens.access_token}`, f.repo), { ok: false, motivo: 'sem_acesso' })
})

test('token: ausente, de outro formato, vencido em 1 h, desconectado', async () => {
  const f = repoFalso()
  const { tokens, reg } = await conectar(f)
  assert.deepEqual(await autenticarToken(null, f.repo), { ok: false, motivo: 'ausente' })
  assert.deepEqual(await autenticarToken('Basic abc', f.repo), { ok: false, motivo: 'ausente' })
  assert.deepEqual(await autenticarToken('Bearer cga_curto', f.repo), { ok: false, motivo: 'invalido' })
  assert.deepEqual(await autenticarToken(`Bearer ${tokens.refresh_token}`, f.repo), { ok: false, motivo: 'invalido' })
  assert.deepEqual(await autenticarToken(`Bearer cga_${'A'.repeat(43)}`, f.repo), { ok: false, motivo: 'invalido' })
  f.passar(VALIDADE_ACESSO_SEG * 1000 + 1)
  assert.deepEqual(await autenticarToken(`Bearer ${tokens.access_token}`, f.repo), { ok: false, motivo: 'vencido' })
  const renovado = await concederToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: reg.client_id }, f.repo)
  const conexaoId = Object.keys(f.conexoes)[0]
  assert.ok(await f.repo.revogarConexao(conexaoId, 'desconectada'))
  assert.deepEqual(await autenticarToken(`Bearer ${renovado.access_token}`, f.repo), { ok: false, motivo: 'revogado' })
})

test('segredos ficam só como hash: o valor nunca é gravado', async () => {
  const f = repoFalso()
  const gravados: string[] = []
  const repo: Repo = { ...f.repo, async criarTokens(t) { gravados.push(...t.map((x) => x.hash)); return f.repo.criarTokens(t) } }
  const reg = await registrarCliente({ redirect_uris: [CLAUDE] }, repo)
  const p = pkce()
  const v = await validarPedido(pedidoParams(reg.client_id, p.challenge), BASE, repo)
  assert.ok(v.ok)
  const code = new URL(await emitirCodigo(v.pedido, f.usuarios.adm, repo)).searchParams.get('code')!
  const t = await concederToken({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri: CLAUDE, code_verifier: p.verifier }, repo)
  assert.deepEqual(gravados, [hashSha256(t.access_token), hashSha256(t.refresh_token)])
  assert.ok(!gravados.includes(t.access_token))
})

test('troca relê a pessoa: desativada entre o Autorizar e a troca, não recebe token', async () => {
  const f = repoFalso()
  const reg = await registrarCliente({ redirect_uris: [CLAUDE] }, f.repo)
  const p = pkce()
  const v = await validarPedido(pedidoParams(reg.client_id, p.challenge), BASE, f.repo)
  assert.ok(v.ok)
  const code = new URL(await emitirCodigo(v.pedido, f.usuarios.adm, f.repo)).searchParams.get('code')!
  f.usuarios.adm.isActive = false
  await assert.rejects(concederToken({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri: CLAUDE, code_verifier: p.verifier }, f.repo), (e: OAuthErro) => e.codigo === 'invalid_grant')
})

test('o pedido ao conector só aceita token de acesso (nunca o de renovação)', async () => {
  const f = repoFalso()
  const { tokens } = await conectar(f)
  const pedidos: string[] = []
  const espiao: Repo = { ...f.repo, tokenPorHash: (h, kind) => { pedidos.push(kind); return f.repo.tokenPorHash(h, kind) } }
  assert.ok((await autenticarToken(`Bearer ${tokens.access_token}`, espiao)).ok)
  assert.deepEqual(pedidos, ['ACESSO'])
})

test('token de renovação nunca abre o conector, mesmo com cara de token de acesso', async () => {
  const f = repoFalso()
  await conectar(f)
  const conexaoId = Object.keys(f.conexoes)[0]
  const disfarcado = `cga_${'B'.repeat(43)}`
  await f.repo.criarTokens([{ connectionId: conexaoId, kind: 'RENOVACAO', hash: hashSha256(disfarcado), expiresAt: new Date('2027-01-01') }])
  assert.deepEqual(await autenticarToken(`Bearer ${disfarcado}`, f.repo), { ok: false, motivo: 'invalido' })
})
