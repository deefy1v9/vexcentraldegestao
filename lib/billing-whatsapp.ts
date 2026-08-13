import { prisma } from './prisma'
import { isConfigured, uazSendText } from './uazapi'

/**
 * Confirmação de recebimento via WhatsApp.
 *
 * Dois dias antes do vencimento, os administradores autorizados recebem uma
 * pergunta sobre cada cobrança (cliente + competência). A primeira resposta
 * válida registra o pagamento em transação com trava de status — o segundo
 * "sim" nunca duplica o lançamento. Reutiliza a integração UAZAPI existente
 * (lib/uazapi.ts) e o webhook do CRM; nada novo é configurado.
 */

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const TZ = 'America/Sao_Paulo'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function fmtBRL(v: number) {
  return brl.format(v)
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ }).format(d)
}

function fmtDateTime(d: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

function competencia(month: number, year: number) {
  return `${MONTHS_PT[month - 1]}/${year}`
}

/** Data civil (YYYY-MM-DD) e hora HH:mm atuais em America/Sao_Paulo. */
export function spNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

/* ------------------------- segurança: números autorizados ------------------------- */

/**
 * Variantes canônicas de um número brasileiro: com/sem DDI 55 e com/sem o
 * nono dígito. O casamento exige interseção exata de variantes — nunca um
 * "endsWith" frouxo, para um número parecido de cliente jamais autorizar.
 */
function brVariants(raw: string): Set<string> {
  const digits = (raw || '').replace(/\D/g, '')
  const out = new Set<string>()
  if (!digits) return out
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits
  // local esperado: DDD + 8 ou DDD + 9 dígitos
  if (local.length === 10 || local.length === 11) {
    out.add(local)
    out.add('55' + local)
    if (local.length === 11 && local[2] === '9') {
      const sem9 = local.slice(0, 2) + local.slice(3)
      out.add(sem9)
      out.add('55' + sem9)
    }
    if (local.length === 10) {
      const com9 = local.slice(0, 2) + '9' + local.slice(2)
      out.add(com9)
      out.add('55' + com9)
    }
  } else {
    out.add(digits)
  }
  return out
}

function phonesMatch(a: string, b: string): boolean {
  const va = brVariants(a)
  for (const v of brVariants(b)) if (va.has(v)) return true
  return false
}

/** Admins ativos com telefone — os únicos autorizados a confirmar. */
async function authorizedAdmins() {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true, NOT: { phone: null } },
    select: { id: true, name: true, phone: true },
  })
  return admins.filter((a) => a.phone && a.phone.replace(/\D/g, '').length >= 10)
}

async function adminByPhone(number: string) {
  const admins = await authorizedAdmins()
  return admins.find((a) => phonesMatch(a.phone!, number)) ?? null
}

/* ------------------------------- configurações ------------------------------- */

export async function getBillingSetting(key: string): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT value FROM "SystemSettings" WHERE key = ${key}
  `
  return rows[0]?.value ?? ''
}

async function log(confirmationId: string, kind: string, detail: string, phone?: string) {
  await prisma.paymentConfirmationEvent.create({
    data: { confirmationId, kind, detail: detail.slice(0, 900), phone },
  }).catch(() => {})
}

/* ------------------------------- envio D-2 ------------------------------- */

type Stage = 'D2' | 'D0' | 'OVERDUE'
const STAGE_ORDER: Record<Stage, number> = { D2: 0, D0: 1, OVERDUE: 2 }

function stageMessage(stage: Stage, clientName: string, month: number, year: number, dueDate: Date, balance: number, code: string) {
  const header =
    stage === 'D2' ? ['Confirmação de recebimento', '', `Cliente: ${clientName}`, `Competência: ${competencia(month, year)}`, `Vencimento: ${fmtDate(dueDate)}`, `Valor: ${fmtBRL(balance)}`]
    : stage === 'D0' ? ['Pagamento vence HOJE', '', `Cliente: ${clientName}`, `Competência: ${competencia(month, year)}`, `Vencimento: hoje, ${fmtDate(dueDate)}`, `Valor: ${fmtBRL(balance)}`]
    : ['Pagamento em atraso', '', `Cliente: ${clientName}`, `Competência: ${competencia(month, year)}`, `Venceu em ${fmtDate(dueDate)} e ainda não foi registrado.`, `Valor pendente: ${fmtBRL(balance)}`]

  return [
    ...header,
    '',
    'A cliente já realizou o pagamento?',
    '',
    'Responda com o número:',
    '1 - Sim, recebeu',
    '2 - Ainda não',
    '3 - Pagamento parcial',
    '',
    `Cobrança #${code}`,
  ].join('\n')
}

/**
 * Varredura diária de cobranças pendentes, em três estágios por cobrança
 * (cliente + competência): D-2 (dois dias antes do vencimento), D0 (vence
 * hoje) e OVERDUE (venceu sem pagamento). Cada estágio dispara no máximo uma
 * vez — a coluna `stage` registra o último enviado e a chave única
 * (cliente, ano, mês) impede duplicidade mesmo com reexecução.
 */
export async function runBillingReminders(): Promise<{ sent: number; skipped: number }> {
  if (!(await isConfigured())) return { sent: 0, skipped: 0 }

  const admins = await authorizedAdmins()
  if (admins.length === 0) return { sent: 0, skipped: 0 }

  const { date: today } = spNow()
  const dayMs = 24 * 60 * 60 * 1000
  const todayUTC = new Date(`${today}T00:00:00Z`)
  // Janela: vencidos há até 30 dias (não ressuscita cobrança antiga) até D+2
  const from = new Date(todayUTC.getTime() - 30 * dayMs)
  const to = new Date(todayUTC.getTime() + 3 * dayMs)

  const window = await prisma.clientPayment.findMany({
    where: { status: 'PENDENTE', dueDate: { gte: from, lt: to } },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { dueDate: 'asc' },
  })

  // Agrupa por cobrança (cliente + competência)
  const groups = new Map<string, typeof window>()
  for (const p of window) {
    const key = `${p.clientId}|${p.year}|${p.month}`
    const g = groups.get(key)
    if (g) g.push(p)
    else groups.set(key, [p])
  }

  let sent = 0
  let skipped = 0

  for (const items of groups.values()) {
    const first = items[0] // vencimento mais próximo do grupo
    const dueStr = first.dueDate.toISOString().slice(0, 10)
    const diffDays = Math.round((new Date(`${dueStr}T00:00:00Z`).getTime() - todayUTC.getTime()) / dayMs)

    const stage: Stage | null =
      diffDays === 2 ? 'D2'
      : diffDays === 0 ? 'D0'
      : diffDays < 0 ? 'OVERDUE'
      : null // D+1 ou D+3: nenhum estágio novo hoje
    if (!stage) { skipped++; continue }

    // Saldo pendente da competência inteira
    const balance = items.reduce((s, p) => s + p.amount, 0)
    if (balance <= 0) { skipped++; continue }

    const existing = await prisma.paymentConfirmation.findUnique({
      where: { clientId_year_month: { clientId: first.clientId, year: first.year, month: first.month } },
    })

    let confirmation = existing
    if (!existing) {
      // Web Crypto: funciona no runtime Node e no bundle da instrumentation
      const code = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()
      try {
        confirmation = await prisma.paymentConfirmation.create({
          data: {
            code,
            clientId: first.clientId,
            year: first.year,
            month: first.month,
            amount: balance,
            dueDate: first.dueDate,
            stage,
            sentTo: admins.map((a) => a.phone).join(','),
          },
        })
      } catch {
        skipped++ // corrida com outra execução: já existe
        continue
      }
    } else {
      // Cobrança encerrada não recebe mais lembrete
      if (existing.status === 'CONFIRMADO') { skipped++; continue }
      // Só avança de estágio (D2 → D0 → OVERDUE); nunca repete o mesmo
      if (STAGE_ORDER[stage] <= STAGE_ORDER[(existing.stage as Stage) ?? 'D2']) { skipped++; continue }
      await prisma.paymentConfirmation.update({
        where: { id: existing.id },
        data: { stage, amount: balance },
      })
    }
    if (!confirmation) { skipped++; continue }

    const text = stageMessage(stage, first.client.name, first.month, first.year, first.dueDate, balance, confirmation.code)
    const stageLabel = stage === 'D2' ? 'D-2' : stage === 'D0' ? 'vence hoje' : 'em atraso'

    for (const admin of admins) {
      try {
        await uazSendText(admin.phone!, text)
        await log(confirmation.id, 'ENVIO', `Lembrete (${stageLabel}) enviado para ${admin.name}`, admin.phone!)
      } catch (err) {
        await log(confirmation.id, 'ERRO', `Falha ao enviar (${stageLabel}) para ${admin.name}: ${String(err)}`, admin.phone!)
      }
    }
    sent++
  }

  return { sent, skipped }
}

/* --------------------------- registro do pagamento --------------------------- */

/**
 * Marca como pago o saldo pendente da competência (integral) ou um valor
 * parcial, alocando das parcelas mais antigas para as mais novas. Uma parcela
 * coberta pela metade é dividida em duas (parte paga + resto pendente), então
 * receita recebida, saldo, dashboard e financeiro ficam corretos sozinhos.
 * Roda dentro da transação que já travou a confirmação.
 */
async function settlePayments(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  conf: { clientId: string; year: number; month: number },
  value: number | null, // null = integral
  account: string | null,
  paidAt: Date,
) {
  const pending = await tx.clientPayment.findMany({
    where: { clientId: conf.clientId, year: conf.year, month: conf.month, status: 'PENDENTE' },
    orderBy: { dueDate: 'asc' },
  })
  const balance = pending.reduce((s, p) => s + p.amount, 0)
  if (balance <= 0) throw new Error('SEM_SALDO')

  const toSettle = value == null ? balance : value
  if (toSettle <= 0 || toSettle > balance + 0.005) throw new Error('VALOR_INVALIDO')

  let remaining = toSettle
  for (const p of pending) {
    if (remaining <= 0.005) break
    if (p.amount <= remaining + 0.005) {
      await tx.clientPayment.update({
        where: { id: p.id },
        data: { status: 'PAGO', paidAt, receivedAccount: account },
      })
      remaining -= p.amount
    } else {
      // Divide a parcela: parte paga agora, resto continua pendente
      await tx.clientPayment.update({
        where: { id: p.id },
        data: { amount: remaining, status: 'PAGO', paidAt, receivedAccount: account },
      })
      await tx.clientPayment.create({
        data: {
          clientId: p.clientId,
          serviceId: p.serviceId,
          month: p.month,
          year: p.year,
          amount: Math.round((p.amount - remaining) * 100) / 100,
          dueDate: p.dueDate,
          status: 'PENDENTE',
        },
      })
      remaining = 0
    }
  }
  return { settled: toSettle, balance }
}

/* ------------------------------ respostas ------------------------------ */

type Confirmation = NonNullable<Awaited<ReturnType<typeof prisma.paymentConfirmation.findFirst>>>

const ACTIVE_STATUSES = ['AGUARDANDO', 'AGUARDANDO_VALOR', 'AGUARDANDO_CONTA', 'PARCIAL']

function alreadyRegisteredMsg(conf: Confirmation) {
  return `Esse pagamento já foi registrado por ${conf.respondedByName ?? 'outro responsável'} em ${conf.respondedAt ? fmtDateTime(conf.respondedAt) : '—'}. Nenhum novo lançamento foi criado.`
}

/** Interpreta "R$ 1.234,56" / "1234,56" / "1500" → número em reais. */
function parseBRLValue(text: string): number | null {
  const cleaned = text.replace(/[^\d.,]/g, '')
  if (!cleaned) return null
  let normalized = cleaned
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    normalized = cleaned.replace(/\./g, '')
  }
  const v = Number(normalized)
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null
}

async function confirmFull(confId: string, admin: { id: string; name: string }, phone: string, account: string) {
  const now = new Date()
  return prisma.$transaction(async (tx) => {
    // Trava transacional: só um responsável consegue mover o status
    const locked = await tx.paymentConfirmation.updateMany({
      where: { id: confId, status: { in: ['AGUARDANDO', 'AGUARDANDO_CONTA', 'PARCIAL'] } },
      data: {
        status: 'CONFIRMADO',
        respondedBy: admin.id,
        respondedByName: admin.name,
        respondedPhone: phone,
        respondedAt: now,
        receivedAccount: account,
        actionPhone: null,
        pendingValue: null,
      },
    })
    if (locked.count === 0) return null
    const conf = await tx.paymentConfirmation.findUniqueOrThrow({ where: { id: confId } })
    const result = await settlePayments(tx, conf, null, account || null, now)
    return { conf, ...result }
  })
}

async function confirmPartial(confId: string, admin: { id: string; name: string }, phone: string, value: number, account: string) {
  const now = new Date()
  return prisma.$transaction(async (tx) => {
    // Trava ANTES de dar baixa: se a UAZAPI reentregar o mesmo webhook, a
    // segunda tentativa não passa daqui e o valor nunca é lançado em dobro.
    const locked = await tx.paymentConfirmation.updateMany({
      where: { id: confId, status: 'AGUARDANDO_VALOR' },
      data: {
        status: 'PARCIAL',
        respondedBy: admin.id,
        respondedByName: admin.name,
        respondedPhone: phone,
        respondedAt: now,
        receivedAccount: account || null,
        actionPhone: null,
        pendingValue: null,
      },
    })
    if (locked.count === 0) return null
    const conf = await tx.paymentConfirmation.findUniqueOrThrow({ where: { id: confId } })
    const result = await settlePayments(tx, conf, value, account || null, now)
    const fullyPaid = result.settled >= result.balance - 0.005
    if (fullyPaid) {
      await tx.paymentConfirmation.update({ where: { id: confId }, data: { status: 'CONFIRMADO' } })
    }
    return { conf, ...result, fullyPaid }
  })
}

async function notifyOthers(conf: Confirmation, clientName: string, exceptPhone: string) {
  const admins = await authorizedAdmins()
  const when = conf.respondedAt ? fmtDateTime(conf.respondedAt) : fmtDateTime(new Date())
  const text = `O pagamento da cliente ${clientName} já foi confirmado por ${conf.respondedByName} em ${when}.`
  for (const a of admins) {
    if (phonesMatch(a.phone!, exceptPhone)) continue
    await uazSendText(a.phone!, text).catch(() => {})
    await log(conf.id, 'AVISO', `Aviso de confirmação enviado a ${a.name}`, a.phone!)
  }
}

/**
 * Tenta tratar uma mensagem recebida como resposta de cobrança.
 * Retorna true se a mensagem foi consumida por este fluxo (o webhook não
 * deve encaminhá-la ao CRM); false se não tem relação com cobranças.
 */
export async function handleBillingReply(number: string, rawText: string): Promise<boolean> {
  const admin = await adminByPhone(number)
  if (!admin) return false // não autorizado: segue fluxo normal do CRM

  const text = (rawText || '').trim()
  const lower = text.toLowerCase()

  // Confirmações ativas (qualquer status não-final conta como contexto)
  const active = await prisma.paymentConfirmation.findMany({
    where: { status: { in: ACTIVE_STATUSES } },
    include: { client: { select: { name: true } } },
    orderBy: { sentAt: 'desc' },
  })

  // Referência explícita por código (#AB12)
  const codeMatch = lower.match(/#\s*([a-z0-9]{3,8})/)
  let target = codeMatch
    ? active.find((c) => c.code.toLowerCase() === codeMatch[1]) ?? null
    : null

  if (codeMatch && !target) {
    // Código citado mas não está ativo: pode já ter sido processado
    const done = await prisma.paymentConfirmation.findFirst({
      where: { code: { equals: codeMatch[1], mode: 'insensitive' }, status: 'CONFIRMADO' },
    })
    if (done) {
      await uazSendText(number, alreadyRegisteredMsg(done))
      return true
    }
    await uazSendText(number, `Não encontrei nenhuma cobrança ativa com o código #${codeMatch[1].toUpperCase()}.`)
    return true
  }

  // Fluxos de duas etapas presos a este número têm prioridade
  const pendingMine = active.find(
    (c) => c.actionPhone && phonesMatch(c.actionPhone, number) &&
      (c.status === 'AGUARDANDO_VALOR' || c.status === 'AGUARDANDO_CONTA'),
  )

  const isOption = /^([123])\b/.test(lower) ||
    /^(sim|ja recebeu|já recebeu|recebeu|recebido|pago)\b/.test(lower) ||
    /^(ainda n|nao|não)\b/.test(lower) ||
    /^parcial|pagamento parcial/.test(lower)

  if (pendingMine && !target && !isOption) {
    target = pendingMine
  }

  if (!target) {
    if (!isOption && !pendingMine) return false // conversa comum → CRM
    if (active.length === 1) {
      target = active[0]
    } else if (active.length === 0) {
      await uazSendText(number, 'Nenhuma cobrança aguardando confirmação no momento. Nenhum pagamento foi registrado.')
      return true
    } else {
      const lista = active.slice(0, 8).map((c) => `#${c.code} — ${c.client.name} (${competencia(c.month, c.year)}, ${fmtBRL(c.amount)})`).join('\n')
      await uazSendText(number, `Há mais de uma cobrança aguardando confirmação. Responda citando o código, por exemplo "1 #${active[0].code}".\n\n${lista}`)
      return true
    }
  }

  const clientName = target.client.name

  /* --- etapa 2: valor do pagamento parcial --- */
  if (target.status === 'AGUARDANDO_VALOR' && target.actionPhone && phonesMatch(target.actionPhone, number)) {
    const value = parseBRLValue(text)
    const balance = await currentBalance(target)
    if (value == null) {
      await uazSendText(number, `Não entendi o valor. Envie apenas o número, por exemplo: 1500,00`)
      return true
    }
    if (value > balance + 0.005) {
      await uazSendText(number, `O valor informado (${fmtBRL(value)}) é maior que o saldo pendente (${fmtBRL(balance)}). Envie um valor até o saldo.`)
      await log(target.id, 'AVISO', `Valor parcial acima do saldo: ${value}`, number)
      return true
    }
    try {
      const account = await getBillingSetting('DEFAULT_RECEIVING_ACCOUNT')
      const result = await confirmPartial(target.id, admin, number, value, account)
      if (!result) {
        const done = await prisma.paymentConfirmation.findUnique({ where: { id: target.id } })
        if (done && done.respondedByName) await uazSendText(number, alreadyRegisteredMsg(done))
        return true
      }
      await log(target.id, 'PAGAMENTO', `Parcial de ${fmtBRL(value)} registrado por ${admin.name}${account ? ` na conta ${account}` : ''}`, number)
      const rest = result.balance - result.settled
      await uazSendText(number, result.fullyPaid
        ? `Pagamento de ${fmtBRL(value)} da cliente ${clientName} registrado com sucesso para ${competencia(target.month, target.year)}. Cobrança quitada.`
        : `Pagamento parcial de ${fmtBRL(value)} da cliente ${clientName} registrado para ${competencia(target.month, target.year)}. Saldo restante: ${fmtBRL(Math.round(rest * 100) / 100)}.`)
      const fresh = await prisma.paymentConfirmation.findUnique({ where: { id: target.id } })
      if (fresh) await notifyOthers(fresh, clientName, number)
    } catch (err) {
      await log(target.id, 'ERRO', `Falha no parcial: ${String(err)}`, number)
      await uazSendText(number, 'Não consegui registrar o pagamento parcial. Tente novamente.')
    }
    return true
  }

  /* --- etapa 2: conta de recebimento --- */
  if (target.status === 'AGUARDANDO_CONTA' && target.actionPhone && phonesMatch(target.actionPhone, number)) {
    const account = text.slice(0, 80)
    if (!account) {
      await uazSendText(number, 'Em qual conta o pagamento foi recebido?')
      return true
    }
    const result = await confirmFull(target.id, admin, number, account)
    if (!result) {
      const done = await prisma.paymentConfirmation.findUnique({ where: { id: target.id } })
      if (done?.status === 'CONFIRMADO') await uazSendText(number, alreadyRegisteredMsg(done))
      return true
    }
    await log(target.id, 'PAGAMENTO', `Integral de ${fmtBRL(result.settled)} registrado por ${admin.name} na conta ${account}`, number)
    await uazSendText(number, `Pagamento de ${fmtBRL(result.settled)} da cliente ${clientName} registrado com sucesso para ${competencia(target.month, target.year)}.`)
    await notifyOthers(result.conf, clientName, number)
    return true
  }

  /* --- etapa 1: opções 1/2/3 --- */
  const opt =
    /^1\b/.test(lower) || /^(sim|ja recebeu|já recebeu|recebeu|recebido|pago)\b/.test(lower) ? 1
    : /^2\b/.test(lower) || /^(ainda n|nao|não)\b/.test(lower) ? 2
    : /^3\b/.test(lower) || /parcial/.test(lower) ? 3
    : 0

  await log(target.id, 'RESPOSTA', `${admin.name}: "${text.slice(0, 120)}"`, number)

  if (opt === 0) {
    await uazSendText(number, `Para a cobrança #${target.code} (${clientName}), responda:\n1 - Sim, recebeu\n2 - Ainda não\n3 - Pagamento parcial`)
    return true
  }

  if (opt === 2) {
    await prisma.paymentConfirmation.update({
      where: { id: target.id },
      data: { actionPhone: null, pendingValue: null, status: 'AGUARDANDO' },
    }).catch(() => {})
    await uazSendText(number, 'Certo. A cobrança continuará pendente no sistema.')
    return true
  }

  if (opt === 3) {
    const locked = await prisma.paymentConfirmation.updateMany({
      where: { id: target.id, status: { in: ['AGUARDANDO', 'PARCIAL', 'AGUARDANDO_VALOR', 'AGUARDANDO_CONTA'] } },
      data: { status: 'AGUARDANDO_VALOR', actionPhone: number },
    })
    if (locked.count === 0) {
      const done = await prisma.paymentConfirmation.findUnique({ where: { id: target.id } })
      if (done) await uazSendText(number, alreadyRegisteredMsg(done))
      return true
    }
    await uazSendText(number, 'Qual valor foi recebido?')
    return true
  }

  // opt === 1: Sim, recebeu
  const account = await getBillingSetting('DEFAULT_RECEIVING_ACCOUNT')
  if (!account) {
    const locked = await prisma.paymentConfirmation.updateMany({
      where: { id: target.id, status: { in: ['AGUARDANDO', 'PARCIAL'] } },
      data: { status: 'AGUARDANDO_CONTA', actionPhone: number },
    })
    if (locked.count === 0) {
      const done = await prisma.paymentConfirmation.findUnique({ where: { id: target.id } })
      if (done?.status === 'CONFIRMADO') await uazSendText(number, alreadyRegisteredMsg(done))
      return true
    }
    await uazSendText(number, 'Em qual conta o pagamento foi recebido?')
    return true
  }

  const result = await confirmFull(target.id, admin, number, account)
  if (!result) {
    const done = await prisma.paymentConfirmation.findUnique({ where: { id: target.id } })
    if (done?.status === 'CONFIRMADO') await uazSendText(number, alreadyRegisteredMsg(done))
    return true
  }
  await log(target.id, 'PAGAMENTO', `Integral de ${fmtBRL(result.settled)} registrado por ${admin.name} na conta ${account}`, number)
  await uazSendText(number, `Pagamento de ${fmtBRL(result.settled)} da cliente ${clientName} registrado com sucesso para ${competencia(target.month, target.year)}.`)
  await notifyOthers(result.conf, clientName, number)
  return true
}

async function currentBalance(conf: { clientId: string; year: number; month: number }) {
  const pending = await prisma.clientPayment.findMany({
    where: { clientId: conf.clientId, year: conf.year, month: conf.month, status: 'PENDENTE' },
  })
  return pending.reduce((s, p) => s + p.amount, 0)
}
