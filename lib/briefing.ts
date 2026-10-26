import crypto from 'crypto'
import { prisma } from './prisma'
import { decryptSecret, encryptSecret } from './crypto'
import {
  MODELOS_PADRAO, alertasDe, ehSensivel, identificacao, soDigitos,
  type Pergunta, type Respostas,
} from './briefing-core'

/**
 * Briefings no banco: modelos iniciais, links, gravação da resposta (com os
 * campos sensíveis cifrados) e a ligação com o cliente. Regras puras em
 * briefing-core.ts.
 */

/** Segredo de link: 18 bytes em base64url (24 caracteres), impossível de adivinhar. */
export const novoToken = () => crypto.randomBytes(18).toString('base64url')

/** Cria os briefings de tráfego, site e site com blog se ainda não existirem. */
export async function garantirBriefingsPadrao(): Promise<void> {
  const existentes = await prisma.briefingTemplate.findMany({ select: { slug: true } })
  const tem = new Set(existentes.map((e) => e.slug))
  for (const [i, m] of MODELOS_PADRAO.entries()) {
    if (tem.has(m.slug)) continue
    await prisma.briefingTemplate.create({
      data: { slug: m.slug, name: m.name, description: m.description, questions: m.perguntas as object[], publicToken: novoToken(), position: i },
    }).catch(() => undefined) // outra requisição criou junto: tudo bem
  }
}

export const perguntasDe = (json: unknown) => (Array.isArray(json) ? json : []) as Pergunta[]

/** O link (geral do briefing ou de um cliente) e o que ele abre. Briefing desligado não abre. */
export async function abrirLink(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const geral = await prisma.briefingTemplate.findUnique({ where: { publicToken: token } })
  if (geral) return geral.active ? { template: geral, convite: null } : null
  const convite = await prisma.briefingInvite.findUnique({
    where: { token },
    include: { template: true, client: { select: { id: true, name: true } } },
  })
  if (!convite || !convite.template.active) return null
  return { template: convite.template, convite }
}

/** Cliente pelo CNPJ ou e-mail informado. Só liga quando há exatamente um. */
export async function acharCliente(id: { cnpj?: string; email?: string }): Promise<string | null> {
  const cnpj = soDigitos(id.cnpj)
  if (cnpj.length === 14) {
    const todos = await prisma.client.findMany({ where: { cnpj: { not: null } }, select: { id: true, cnpj: true } })
    const achados = todos.filter((c) => soDigitos(c.cnpj) === cnpj)
    if (achados.length === 1) return achados[0].id
  }
  const email = id.email?.trim().toLowerCase()
  if (email) {
    const achados = await prisma.client.findMany({
      where: { OR: [{ email: { equals: email, mode: 'insensitive' } }, { billingEmail: { equals: email, mode: 'insensitive' } }] },
      select: { id: true },
      take: 2,
    })
    if (achados.length === 1) return achados[0].id
  }
  return null
}

/** Cifra o que é sensível antes de ir para o banco. */
export function cifrarSensiveis(perguntas: Pergunta[], respostas: Respostas): Respostas {
  const saida: Respostas = {}
  for (const [k, v] of Object.entries(respostas)) {
    const p = perguntas.find((x) => x.id === k)
    saida[k] = p && ehSensivel(p) && typeof v === 'string' ? (encryptSecret(v) ?? '') : v
  }
  return saida
}

export const revelar = (cifrado: string) => decryptSecret(cifrado) ?? ''

/** Grava a resposta do cliente: perguntas congeladas, sensíveis cifrados, alertas e cliente. */
export async function gravarResposta(params: {
  templateId: string
  perguntas: Pergunta[]
  respostas: Respostas
  convite: { id: string; clientId: string } | null
}) {
  const id = identificacao(params.perguntas, params.respostas)
  const clientId = params.convite?.clientId ?? (await acharCliente({ cnpj: id.cnpj, email: id.email }))
  return prisma.briefingResponse.create({
    data: {
      templateId: params.templateId,
      inviteId: params.convite?.id ?? null,
      clientId,
      respondentName: id.nome ?? null,
      respondentEmail: id.email ?? null,
      companyName: id.empresa ?? null,
      questions: params.perguntas as object[],
      answers: cifrarSensiveis(params.perguntas, params.respostas),
      alerts: alertasDe(params.perguntas, params.respostas),
    },
    select: { id: true },
  })
}
