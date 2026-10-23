import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { argumentosParaDiario, type ConexaoAutenticada, type Repo } from './oauth-core'

/**
 * O conector de IA sobre o Prisma: o Repo do OAuth (./oauth-core.ts), o
 * diário de consultas e as conexões que a tela de Agentes mostra.
 */

/** Endereço público da Central (o que vai no conector e nos metadados). */
export const baseDaCentral = () => (process.env.NEXTAUTH_URL || 'https://central.vexgrowth.com.br').replace(/\/$/, '')

export const repoPrisma: Repo = {
  agora: () => new Date(),
  async criarCliente(c) {
    await prisma.mcpClient.create({ data: c })
  },
  clientePorClientId: (clientId) => prisma.mcpClient.findUnique({ where: { clientId }, select: { id: true, name: true, redirectUris: true } }),
  async tocarCliente(id) {
    await prisma.mcpClient.update({ where: { id }, data: { lastUsedAt: new Date() } })
  },
  async criarCodigo(c) {
    await prisma.mcpAuthCode.create({ data: c })
  },
  async codigoPorHash(hash) {
    const a = await prisma.mcpAuthCode.findUnique({ where: { codeHash: hash }, include: { mcpClient: { select: { clientId: true, name: true } } } })
    return a && { ...a, clientId: a.mcpClient.clientId, appName: a.mcpClient.name }
  },
  async marcarCodigoUsado(id) {
    const r = await prisma.mcpAuthCode.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } })
    return r.count === 1
  },
  async ligarCodigoAConexao(id, connectionId) {
    await prisma.mcpAuthCode.update({ where: { id }, data: { connectionId } })
  },
  async criarConexao(c) {
    return (await prisma.mcpConnection.create({ data: c, select: { id: true } })).id
  },
  async revogarConexao(id, motivo, porId = null) {
    const r = await prisma.mcpConnection.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: motivo.slice(0, 200), revokedById: porId } })
    return r.count === 1
  },
  async criarTokens(t) {
    await prisma.mcpToken.createMany({ data: t })
  },
  async tokenPorHash(hash, kind) {
    const t = await prisma.mcpToken.findUnique({
      where: { hash },
      include: { connection: { select: { revokedAt: true, userId: true, appName: true, scope: true, mcpClient: { select: { clientId: true } } } } },
    })
    if (!t || t.kind !== kind) return null
    return {
      id: t.id, connectionId: t.connectionId, expiresAt: t.expiresAt, usedAt: t.usedAt, revokedAt: t.connection.revokedAt,
      userId: t.connection.userId, appName: t.connection.appName, clientId: t.connection.mcpClient.clientId, scope: t.connection.scope,
    }
  },
  async marcarTokenUsado(id) {
    const r = await prisma.mcpToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } })
    return r.count === 1
  },
  usuario: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, name: true, isActive: true, role: true } }),
}

/** Uma linha no diário por consulta. Nunca derruba a resposta. */
export async function registrarConsulta(d: { conexao: ConexaoAutenticada; ferramenta: string; argumentos: unknown; duracaoMs: number; erro: string | null }) {
  try {
    await prisma.$transaction([
      prisma.mcpQuery.create({
        data: {
          connectionId: d.conexao.id, userId: d.conexao.userId, tool: d.ferramenta,
          args: argumentosParaDiario(d.argumentos) as Prisma.InputJsonValue,
          durationMs: Math.max(0, Math.round(d.duracaoMs)), error: d.erro ? d.erro.slice(0, 300) : null,
        },
      }),
      prisma.mcpConnection.update({ where: { id: d.conexao.id }, data: { queryCount: { increment: 1 }, lastUsedAt: new Date() } }),
    ])
  } catch (e) {
    console.error('[mcp] diário:', e instanceof Error ? e.message : e)
  }
}

/** Conexões (ativas primeiro) e as últimas consultas, para a tela de Agentes. */
export async function painelDoConector() {
  const [conexoes, consultas] = await Promise.all([
    prisma.mcpConnection.findMany({
      orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      take: 50,
      select: { id: true, appName: true, scope: true, createdAt: true, lastUsedAt: true, queryCount: true, revokedAt: true, revokedReason: true, user: { select: { name: true } } },
    }),
    prisma.mcpQuery.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, tool: true, args: true, durationMs: true, error: true, createdAt: true, connection: { select: { appName: true, user: { select: { name: true } } } } },
    }),
  ])
  return { conexoes, consultas }
}
