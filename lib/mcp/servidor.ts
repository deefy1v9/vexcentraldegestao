import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { cabecalhoDe401, temAcoes } from './formato'
import { autenticarToken, type ConexaoAutenticada } from './oauth-core'
import { baseDaCentral, registrarConsulta, repoPrisma } from './oauth'
import { FERRAMENTAS_MCP, FerramentaErro, type ContextoMcp, type Ferramenta } from './ferramentas'
import { FERRAMENTAS_ACOES } from './acoes'
import { limiteConsultas } from './limite'

/**
 * O servidor MCP da Central, atrás de /api/mcp. Sem estado: cada pedido
 * autentica o token, relê o acesso da pessoa, monta o servidor só com as
 * ferramentas de leitura e responde em JSON. O SDK oficial cuida do
 * protocolo; aqui ficam a porta, o freio e o diário.
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const MENSAGEM_401: Record<string, string> = {
  ausente: 'Este endereço é o conector de IA da VEX Central. Conecte pelo seu assistente (Claude Code, Codex ou Claude) para entrar.',
  invalido: 'O token não é deste conector.',
  vencido: 'O token venceu. O assistente renova sozinho; se não renovar, conecte de novo.',
  revogado: 'Esta conexão foi desconectada em Agentes. Conecte de novo se quiser.',
  sem_acesso: 'Este acesso não está mais ativo (só administradores usam o conector).',
}

export const INSTRUCOES =
  'Você está lendo a Central de Gestão da VEX Growth como a pessoa que autorizou, só leitura. ' +
  'Valores em reais (BRL) e datas no fuso de Brasília. Para números do mês use resumo_financeiro; ' +
  'para quem deve, listar_recebiveis; para o que falta pagar, contas_a_pagar; para atrasos da equipe, demandas_por_prazo; ' +
  'para clientes em risco, risco_de_churn; para saber se o cliente respondeu o briefing, briefings (e ler_briefing para as respostas). Use buscar_clientes e buscar_equipe para achar ids antes de filtrar. ' +
  'Com ações autorizadas, o agente trabalha só nas demandas da fila_do_agente: leia o pedido (ler_grupo_do_cliente, ler_demanda), ' +
  'faça o trabalho e use entregar_para_validacao; quem aprova é sempre uma pessoa, e o aviso ao cliente só sai depois disso. ' +
  'Nada aqui envia mensagem ao cliente.'

/** Leitura para toda conexão; as ações só para quem autorizou ações. */
export function ferramentasDaConexao(escopo: string): Ferramenta[] {
  return [...FERRAMENTAS_MCP, ...FERRAMENTAS_ACOES].filter((f) => (f.escopo ?? 'leitura') === 'leitura' || temAcoes(escopo))
}

/** O que o assistente vê de cada ferramenta: ação = não é só leitura (ele pede permissão antes). */
export function anotacoes(f: Ferramenta) {
  return { readOnlyHint: f.somenteLeitura !== false, destructiveHint: false, openWorldHint: false }
}

function montarServidor(ctx: ContextoMcp, conexao: ConexaoAutenticada): McpServer {
  const servidor = new McpServer({ name: 'VEX Central', version: '1.0.0' }, { instructions: INSTRUCOES })
  for (const f of ferramentasDaConexao(conexao.scope)) {
    servidor.registerTool(
      f.nome,
      { title: f.titulo, description: f.descricao, inputSchema: f.entrada, annotations: anotacoes(f) },
      async (args: Record<string, unknown>) => {
        const inicio = Date.now()
        let erro: string | null = null
        try {
          return { content: [{ type: 'text' as const, text: await f.executar(ctx, args ?? {}) }] }
        } catch (e) {
          erro = e instanceof FerramentaErro ? e.message : 'Não consegui consultar agora. Tente de novo em instantes.'
          if (!(e instanceof FerramentaErro)) console.error(`[mcp] ${f.nome}:`, e instanceof Error ? e.message : e)
          return { content: [{ type: 'text' as const, text: erro }], isError: true }
        } finally {
          void registrarConsulta({ conexao, ferramenta: f.nome, argumentos: args, duracaoMs: Date.now() - inicio, erro })
        }
      },
    )
  }
  return servidor
}

function recusar(status: number, erro: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ erro }), { status, headers: { ...JSON_HEADERS, ...headers } })
}

export function metodoNaoPermitido(): Response {
  return recusar(405, 'Use POST neste endereço.', { allow: 'POST' })
}

/** A porta: autentica, freia, monta o servidor e deixa o SDK responder. */
export async function responderMcp(req: Request): Promise<Response> {
  const base = baseDaCentral()
  const aut = await autenticarToken(req.headers.get('authorization'), repoPrisma)
  if (!aut.ok) {
    return recusar(401, MENSAGEM_401[aut.motivo] ?? MENSAGEM_401.invalido, { 'www-authenticate': cabecalhoDe401(base, aut.motivo !== 'ausente') })
  }
  const freio = limiteConsultas.conferir(`mcp:${aut.conexao.id}`)
  if (!freio.ok) return recusar(429, `Muitas consultas seguidas. Tente de novo em ${freio.esperarSeg} s.`, { 'retry-after': String(freio.esperarSeg) })

  const ctx: ContextoMcp = { userId: aut.usuario.id, conexaoId: aut.conexao.id, appName: aut.conexao.appName, base, agora: new Date() }
  const servidor = montarServidor(ctx, aut.conexao)
  const transporte = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await servidor.connect(transporte)
  try {
    return await transporte.handleRequest(req)
  } finally {
    void transporte.close().catch(() => {})
    void servidor.close().catch(() => {})
  }
}
