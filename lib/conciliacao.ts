import { prisma } from './prisma'
import { cashTotals, validateMovement } from './caixa-core'
import { isConfigured, uazSendText } from './uazapi'
import { baseDaCentral } from './mcp/oauth'
import {
  casar, conciliadoAte, diaUtilAnterior, impressoes, precisaLembrar, type ExtratoLido,
} from './conciliacao-core'

/**
 * Conciliação bancária: grava o extrato lido, casa com o caixa da Central e
 * guarda o que a pessoa decidiu em cada linha. As regras puras (leitura e
 * casamento) estão em ./conciliacao-core.ts; aqui fica só o banco.
 *
 * Nada aqui mexe em dinheiro, cobrança ou cliente: no máximo cria um
 * movimento no caixa da Central quando a pessoa manda lançar uma linha.
 */

const TZ = 'America/Sao_Paulo'
export const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })

/**
 * CNPJs da própria casa: Pix entre eles é transferência entre contas ou saque
 * do Asaas. O da VEX vem fixo; outros (a conta antiga em nome de sócio) ficam
 * na configuração CONCILIACAO_CNPJS_CASA, separados por vírgula.
 */
const CNPJ_VEX = '68652648000186'
async function cnpjsDaCasa(): Promise<string[]> {
  const cfg = await prisma.systemSettings.findUnique({ where: { key: 'CONCILIACAO_CNPJS_CASA' } }).catch(() => null)
  return [CNPJ_VEX, ...(cfg?.value ?? '').split(',').map((v) => v.replace(/D/g, '')).filter((v) => v.length === 14)]
}

/** Quem cuida da conciliação (recebe o lembrete). Padrão: o Antonio. */
export async function responsavel(): Promise<{ id: string; name: string; phone: string | null } | null> {
  const cfg = await prisma.systemSettings.findUnique({ where: { key: 'CONCILIACAO_RESPONSAVEL' } }).catch(() => null)
  const sel = { id: true, name: true, phone: true } as const
  if (cfg?.value) {
    const u = await prisma.user.findUnique({ where: { id: cfg.value }, select: sel })
    if (u) return u
  }
  return prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true, name: { startsWith: 'Antonio' } }, select: sel })
}

export async function definirResponsavel(userId: string) {
  await prisma.systemSettings.upsert({
    where: { key: 'CONCILIACAO_RESPONSAVEL' },
    update: { value: userId },
    create: { key: 'CONCILIACAO_RESPONSAVEL', value: userId },
  })
}

/** Grava as linhas novas do extrato (reimportar não duplica) e já tenta conciliar. */
export async function importarExtrato(lido: ExtratoLido, arquivo: string, userId: string | null) {
  if (lido.linhas.length === 0) throw new Error('Não achei nenhum lançamento neste arquivo.')
  const datas = lido.linhas.map((l) => l.data).sort()
  const marcas = impressoes(lido.conta, lido.linhas)
  const existentes = new Set((await prisma.bankStatementLine.findMany({ where: { impressao: { in: marcas } }, select: { impressao: true } })).map((l) => l.impressao))

  const imp = await prisma.bankStatementImport.create({
    data: { conta: lido.conta, banco: lido.banco, arquivo, inicio: datas[0], fim: datas[datas.length - 1], saldoFinalCents: lido.saldoFinalCents, createdById: userId },
  })
  const novas = lido.linhas
    .map((l, i) => ({ ...l, impressao: marcas[i] }))
    .filter((l) => !existentes.has(l.impressao))
  if (novas.length > 0) {
    await prisma.bankStatementLine.createMany({
      data: novas.map((l) => ({
        importId: imp.id, conta: lido.conta, data: l.data, descricao: l.descricao, documento: l.documento,
        valorCents: l.valorCents, saldoCents: l.saldoCents, contraparte: l.contraparte, impressao: l.impressao,
      })),
      skipDuplicates: true,
    })
  }
  await prisma.bankStatementImport.update({ where: { id: imp.id }, data: { linhasNovas: novas.length } })
  const auto = await conciliarAutomatico()
  return { conta: lido.conta, lidas: lido.linhas.length, novas: novas.length, repetidas: lido.linhas.length - novas.length, ...auto }
}

/**
 * Casa as linhas pendentes com os movimentos do caixa ainda sem extrato e
 * aplica o que a Central aprendeu (contraparte marcada como pessoal ou
 * interna). Idempotente: o que já foi decidido não volta.
 */
export async function conciliarAutomatico(): Promise<{ casadas: number; ignoradas: number }> {
  const pendentes = await prisma.bankStatementLine.findMany({ where: { status: 'PENDENTE' }, select: { id: true, data: true, valorCents: true, contraparte: true } })
  if (pendentes.length === 0) return { casadas: 0, ignoradas: 0 }
  const datas = pendentes.map((l) => l.data).sort()
  const de = new Date(`${datas[0]}T00:00:00Z`); de.setUTCDate(de.getUTCDate() - 7)
  const ate = new Date(`${datas[datas.length - 1]}T23:59:59Z`); ate.setUTCDate(ate.getUTCDate() + 7)
  const movs = await prisma.cashMovement.findMany({
    where: { date: { gte: de, lte: ate }, bankLines: { none: {} } },
    select: { id: true, date: true, kind: true, amountCents: true },
  })
  const casamentos = casar(pendentes, movs.map((m) => ({ id: m.id, dia: m.date.toISOString().slice(0, 10), kind: m.kind, amountCents: m.amountCents })))
  let casadas = 0
  for (const c of casamentos) {
    for (const [i, id] of c.linhas.entries()) {
      await prisma.bankStatementLine.update({
        where: { id },
        data: { status: 'CONCILIADO', auto: true, conciliadoEm: new Date(), diferencaCents: i === 0 ? c.diferencaCents : 0, movimentos: { connect: c.movimentos.map((m) => ({ id: m })) } },
      })
      casadas++
    }
  }

  // Contrapartes que a pessoa mandou lembrar como pessoal (do Davi) ou interna
  const casadasIds = new Set(casamentos.flatMap((c) => c.linhas))
  const restantes = pendentes.filter((l) => !casadasIds.has(l.id) && l.contraparte)
  const regras = await prisma.bankCounterparty.findMany({ where: { chave: { in: [...new Set(restantes.map((l) => l.contraparte!))] }, acao: { in: ['PESSOAL', 'INTERNA'] } } })
  const porChave = new Map(regras.map((r) => [r.chave, r.acao]))
  let ignoradas = 0
  for (const l of restantes) {
    const acao = porChave.get(l.contraparte!)
    if (!acao) continue
    await prisma.bankStatementLine.update({ where: { id: l.id }, data: { status: 'IGNORADO', motivo: acao, auto: true, conciliadoEm: new Date() } })
    ignoradas++
  }
  return { casadas, ignoradas }
}

export type AcaoLinha =
  | { acao: 'vincular'; movimentos: string[] }
  | { acao: 'lancar'; kind: string; descricao: string; categoria?: string | null; partnerId?: string | null; lembrar?: boolean }
  | { acao: 'ignorar'; motivo: 'INTERNA' | 'PESSOAL' | 'OUTRO'; lembrar?: boolean }
  | { acao: 'desfazer' }

/** O que a pessoa decidiu numa linha. Devolve uma mensagem curta para a tela. */
export async function aplicarAcao(linhaId: string, a: AcaoLinha, userId: string | null): Promise<string> {
  const l = await prisma.bankStatementLine.findUnique({ where: { id: linhaId }, include: { movimentos: { select: { id: true } } } })
  if (!l) throw new Error('Linha do extrato não encontrada.')
  const daCasa = await cnpjsDaCasa()
  const feito = { conciliadoEm: new Date(), conciliadoPor: userId, auto: false }

  if (a.acao === 'desfazer') {
    await prisma.bankStatementLine.update({
      where: { id: l.id },
      data: { status: 'PENDENTE', motivo: null, diferencaCents: 0, auto: false, conciliadoEm: null, conciliadoPor: null, movimentos: { disconnect: l.movimentos } },
    })
    return 'Linha voltou para pendente. Os movimentos do caixa continuam lá.'
  }
  if (l.status !== 'PENDENTE') throw new Error('Esta linha já foi tratada. Desfaça antes de mudar.')

  if (a.acao === 'ignorar') {
    await prisma.bankStatementLine.update({ where: { id: l.id }, data: { status: 'IGNORADO', motivo: a.motivo, ...feito } })
    if (a.lembrar && l.contraparte && a.motivo !== 'OUTRO' && !daCasa.includes(l.contraparte)) {
      await prisma.bankCounterparty.upsert({ where: { chave: l.contraparte }, update: { acao: a.motivo }, create: { chave: l.contraparte, acao: a.motivo } })
    }
    return a.motivo === 'PESSOAL' ? 'Marcada como repasse pessoal do Davi.' : a.motivo === 'INTERNA' ? 'Marcada como transferência entre contas da VEX.' : 'Linha ignorada.'
  }

  if (a.acao === 'vincular') {
    if (a.movimentos.length === 0) throw new Error('Escolha pelo menos um movimento do caixa.')
    const movs = await prisma.cashMovement.findMany({ where: { id: { in: a.movimentos } }, select: { id: true, kind: true, amountCents: true } })
    if (movs.length !== a.movimentos.length) throw new Error('Movimento do caixa não encontrado.')
    const central = movs.reduce((s, m) => s + (m.kind === 'ENTRADA' || m.kind === 'APORTE' ? 1 : -1) * Math.abs(m.amountCents), 0)
    await prisma.bankStatementLine.update({
      where: { id: l.id },
      data: { status: 'CONCILIADO', diferencaCents: l.valorCents - central, ...feito, movimentos: { connect: movs.map((m) => ({ id: m.id })) } },
    })
    return l.valorCents === central ? 'Conciliada.' : `Conciliada com diferença de ${((l.valorCents - central) / 100).toFixed(2).replace('.', ',')}.`
  }

  // lançar: cria o movimento no caixa com o valor e o dia do banco
  const amountCents = Math.abs(l.valorCents)
  const entra = l.valorCents > 0
  if (entra && !['ENTRADA', 'APORTE'].includes(a.kind)) throw new Error('Dinheiro que entrou vira entrada ou aporte de sócio.')
  if (!entra && !['SAIDA', 'RETIRADA'].includes(a.kind)) throw new Error('Dinheiro que saiu vira saída ou retirada de sócio.')
  const descricao = a.descricao.trim()
  const partnerId = a.kind === 'RETIRADA' || a.kind === 'APORTE' ? a.partnerId ?? null : null
  const erros = validateMovement({ kind: a.kind, amountCents, description: descricao, date: l.data, partnerId })
  if (erros.length > 0) throw new Error(erros.join(' '))
  const mov = await prisma.cashMovement.create({
    data: {
      kind: a.kind, amountCents, description: descricao, category: a.categoria?.trim() || null, account: l.conta,
      date: new Date(`${l.data}T12:00:00Z`), partnerId, createdById: userId, source: 'MANUAL',
      notes: `Lançado pela conciliação: ${l.descricao}`,
    },
  })
  await prisma.bankStatementLine.update({ where: { id: l.id }, data: { status: 'CONCILIADO', ...feito, movimentos: { connect: { id: mov.id } } } })
  if (a.lembrar && l.contraparte && !daCasa.includes(l.contraparte)) {
    const regra = { acao: 'LANCAR', kind: a.kind, descricao, categoria: a.categoria ?? null, partnerId }
    await prisma.bankCounterparty.upsert({ where: { chave: l.contraparte }, update: regra, create: { chave: l.contraparte, ...regra } })
  }
  return 'Lançada no caixa e conciliada.'
}

/** Situação de cada conta, as linhas pedidas e as sugestões para as pendentes. */
export async function painelConciliacao(filtro: { status?: string; conta?: string }) {
  const hoje = hojeSP()
  const [contas, todas, imps, saldoCentral, resp, socios] = await Promise.all([
    prisma.bankStatementLine.groupBy({ by: ['conta', 'status'], _count: { _all: true } }),
    prisma.bankStatementLine.findMany({ select: { conta: true, data: true, status: true } }),
    prisma.bankStatementImport.findMany({ orderBy: { createdAt: 'desc' }, select: { conta: true, fim: true, saldoFinalCents: true, createdAt: true, arquivo: true } }),
    prisma.cashMovement.findMany({ select: { kind: true, amountCents: true } }).then((m) => cashTotals(m).saldoCents),
    responsavel(),
    prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  const nomes = [...new Set(contas.map((c) => c.conta))]
  const resumo = nomes.map((conta) => {
    const doConta = imps.filter((i) => i.conta === conta)
    const cobertoAte = doConta.map((i) => i.fim).filter(Boolean).sort().pop() ?? null
    const ultimoComSaldo = [...doConta].sort((a, b) => (b.fim ?? '').localeCompare(a.fim ?? '') || b.createdAt.getTime() - a.createdAt.getTime()).find((i) => i.saldoFinalCents !== null)
    const n = (s: string) => contas.find((c) => c.conta === conta && c.status === s)?._count._all ?? 0
    return {
      conta,
      pendentes: n('PENDENTE'), conciliadas: n('CONCILIADO'), ignoradas: n('IGNORADO'),
      cobertoAte,
      conciliadoAte: conciliadoAte(todas.filter((l) => l.conta === conta), cobertoAte),
      saldoBancoCents: ultimoComSaldo?.saldoFinalCents ?? null,
      ultimoArquivo: doConta[0] ? { nome: doConta[0].arquivo, em: doConta[0].createdAt } : null,
    }
  }).sort((a, b) => (b.cobertoAte ?? '').localeCompare(a.cobertoAte ?? ''))

  const status = filtro.status && ['PENDENTE', 'CONCILIADO', 'IGNORADO'].includes(filtro.status) ? filtro.status : undefined
  const linhas = await prisma.bankStatementLine.findMany({
    where: { ...(status ? { status } : {}), ...(filtro.conta ? { conta: filtro.conta } : {}) },
    orderBy: [{ data: 'desc' }, { createdAt: 'asc' }],
    take: 400,
    include: { movimentos: { select: { id: true, kind: true, amountCents: true, description: true, date: true } } },
  })

  // Sugestões: movimentos do caixa ainda sem extrato, mesmo sentido, até 10 dias
  const pend = linhas.filter((l) => l.status === 'PENDENTE')
  const livres = pend.length
    ? await prisma.cashMovement.findMany({ where: { bankLines: { none: {} } }, select: { id: true, kind: true, amountCents: true, description: true, date: true }, orderBy: { date: 'desc' }, take: 500 })
    : []
  const regras = await prisma.bankCounterparty.findMany({ where: { chave: { in: [...new Set(pend.map((l) => l.contraparte).filter((c): c is string => !!c))] } } })
  const daCasa = await cnpjsDaCasa()
  const sugestoes = Object.fromEntries(pend.map((l) => {
    const entra = l.valorCents > 0
    const cands = livres
      .filter((m) => (m.kind === 'ENTRADA' || m.kind === 'APORTE') === entra)
      .map((m) => ({ m, dias: Math.abs((m.date.getTime() - Date.parse(`${l.data}T12:00:00Z`)) / 86_400_000), dif: Math.abs(Math.abs(l.valorCents) - m.amountCents) }))
      .filter((x) => x.dias <= 10 && x.dif <= Math.max(200, Math.abs(l.valorCents) * 0.1))
      .sort((a, b) => a.dif - b.dif || a.dias - b.dias)
      .slice(0, 3)
      .map((x) => ({ id: x.m.id, kind: x.m.kind, amountCents: x.m.amountCents, description: x.m.description, dia: x.m.date.toISOString().slice(0, 10) }))
    return [l.id, { movimentos: cands, regra: regras.find((r) => r.chave === l.contraparte) ?? null, daCasa: !!l.contraparte && daCasa.includes(l.contraparte) }]
  }))

  const saldoBancos = resumo.reduce((s, c) => s + (c.saldoBancoCents ?? 0), 0)
  return {
    hoje,
    responsavel: resp,
    socios,
    contas: resumo,
    saldoCentralCents: saldoCentral,
    saldoBancosCents: resumo.some((c) => c.saldoBancoCents !== null) ? saldoBancos : null,
    linhas: linhas.map((l) => ({
      id: l.id, conta: l.conta, data: l.data, descricao: l.descricao, documento: l.documento, valorCents: l.valorCents,
      contraparte: l.contraparte, status: l.status, motivo: l.motivo, diferencaCents: l.diferencaCents, auto: l.auto,
      movimentos: l.movimentos.map((m) => ({ id: m.id, kind: m.kind, amountCents: m.amountCents, description: m.description, dia: m.date.toISOString().slice(0, 10) })),
    })),
    sugestoes,
  }
}

/** A conta principal (a que tem o extrato mais recente) e até quando está em dia. */
export async function situacaoPrincipal(): Promise<{ conta: string; conciliadoAte: string | null; pendentes: number } | null> {
  const ultimo = await prisma.bankStatementImport.findFirst({ orderBy: [{ fim: 'desc' }, { createdAt: 'desc' }], select: { conta: true } })
  if (!ultimo) return null
  const [linhas, imps] = await Promise.all([
    prisma.bankStatementLine.findMany({ where: { conta: ultimo.conta }, select: { data: true, status: true } }),
    prisma.bankStatementImport.findMany({ where: { conta: ultimo.conta }, select: { fim: true } }),
  ])
  const cobertoAte = imps.map((i) => i.fim).filter(Boolean).sort().pop() ?? null
  return { conta: ultimo.conta, conciliadoAte: conciliadoAte(linhas, cobertoAte), pendentes: linhas.filter((l) => l.status === 'PENDENTE').length }
}

/**
 * Lembrete diário ao responsável (dia útil, depois das 9h, uma vez por dia):
 * só sai quando a conta principal não está conciliada até o dia útil anterior.
 */
export async function lembrarConciliacao(): Promise<{ enviado: boolean }> {
  const hoje = hojeSP()
  const sit = await situacaoPrincipal()
  if (!precisaLembrar(hoje, sit?.conciliadoAte ?? null)) return { enviado: false }
  const ja = await prisma.agentNotice.findUnique({ where: { kind_refId: { kind: 'conciliacao', refId: hoje } } }).catch(() => null)
  if (ja) return { enviado: false }
  const resp = await responsavel()
  if (!resp?.phone || !(await isConfigured().catch(() => false))) return { enviado: false }

  const br = (d: string) => d.split('-').reverse().join('/')
  const texto = [
    '📒 *Conciliação bancária*',
    '',
    sit
      ? `${sit.conta} está conciliado até ${sit.conciliadoAte ? br(sit.conciliadoAte) : '—'}${sit.pendentes ? ` e tem ${sit.pendentes} linha(s) pendente(s)` : ''}.`
      : 'Nenhum extrato foi enviado ainda.',
    `Baixe o extrato de ${br(diaUtilAnterior(hoje))} no app do Santander Empresas (PDF ou OFX) e suba aqui:`,
    `${baseDaCentral()}/financeiro?aba=conciliacao`,
  ].join('\n')
  // Marca antes de enviar: numa corrida, o pior caso é um lembrete a menos
  await prisma.agentNotice.create({ data: { kind: 'conciliacao', refId: hoje, detail: sit?.conta ?? null } }).catch(() => null)
  await uazSendText(resp.phone, texto)
  return { enviado: true }
}
