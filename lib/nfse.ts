import { prisma } from './prisma'
import {
  nfseRef, missingFiscalConfigFields, missingNfseFields,
  applyCompetenceToDescription, requiresCodigoServicoMunicipal,
} from './billing-core'
import * as focus from './focus-nfe'
import * as asaas from './asaas'
import { getSettings } from './settings'
import { asaasNfseRef, applyAsaasInvoice, buildAsaasInvoicePayload } from './nfse-asaas'

export type NfseProvider = 'focus' | 'asaas'

/**
 * Quem emite a nota: Focus NFe (API própria) ou o Asaas (Portal Nacional,
 * vinculada à cobrança). Padrão: Focus — a troca é explícita em
 * NFSE_PROVIDER para nunca sair nota em dobro.
 */
export async function getNfseProvider(): Promise<NfseProvider> {
  const s = await getSettings(['NFSE_PROVIDER'])
  return (s.NFSE_PROVIDER || process.env.NFSE_PROVIDER || 'focus').toLowerCase() === 'asaas' ? 'asaas' : 'focus'
}

/**
 * Emissão de NFS-e via Focus.
 *
 * - Uma nota por cobrança (unique chargeId) com referência determinística.
 * - Emissão só acontece com configuração fiscal completa E cadastro do
 *   tomador completo — nada de valores fiscais presumidos.
 * - O POST aceito NÃO significa autorizado: o status final vem do webhook
 *   ou da consulta pela referência (processamento assíncrono da prefeitura).
 * - Em timeout, consulta pela referência antes de repetir o envio.
 */

export async function getFiscalConfig() {
  return prisma.fiscalConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  })
}

/** Alíquota efetiva do ISS da competência (null quando não confirmada). */
export async function aliquotaForCompetence(year: number, month: number): Promise<number | null> {
  const row = await prisma.fiscalAliquota.findUnique({ where: { year_month: { year, month } } })
  return row ? Number(row.aliquotaIss) : null
}

function competenceLabel(year: number, month: number) {
  return `${String(month).padStart(2, '0')}/${year}`
}

/**
 * Estado da configuração fiscal. Além dos campos do prestador, a alíquota
 * efetiva do ISS da competência corrente é bloqueadora — no Simples ela muda
 * mês a mês e o sistema nunca assume um valor.
 */
export async function fiscalReadiness(competence?: { year: number; month: number }) {
  const cfg = await getFiscalConfig()
  const provider = await getNfseProvider()
  // Pelo Asaas a autenticação na prefeitura e o serviço ficam na conta Asaas
  const missing = missingFiscalConfigFields(cfg).filter((m) =>
    provider !== 'asaas' || !/Web Service|Código municipal do serviço/.test(m))

  const now = new Date()
  const ref = competence ?? {
    year: Number(now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 4)),
    month: Number(now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(5, 7)),
  }
  const aliquota = await aliquotaForCompetence(ref.year, ref.month)
  if (aliquota == null) {
    missing.push(`Alíquota efetiva do ISS da competência ${competenceLabel(ref.year, ref.month)}`)
  }

  return { cfg, missing, ready: missing.length === 0, competence: ref, aliquota }
}

function isoDateSP(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Monta o payload municipal (grupos exigidos pela Focus). */
export function buildNfsePayload(params: {
  cfg: Awaited<ReturnType<typeof getFiscalConfig>>
  client: {
    legalName: string | null
    name: string
    cnpj: string | null
    billingEmail: string | null
    email: string | null
    zipCode: string | null
    street: string | null
    addressNumber: string | null
    complement: string | null
    district: string | null
    city: string | null
    state: string | null
    ibgeCode: string | null
    fiscalDescription: string | null
  }
  valueDecimal: string // "1234.56" — valor da cobrança confirmada
  competencia: string // "MM/AAAA"
  aliquotaIss: number // alíquota efetiva confirmada para a competência
}) {
  const { cfg, client, valueDecimal, competencia, aliquotaIss } = params
  const doc = (client.cnpj ?? '').replace(/\D/g, '')
  const discriminacao = applyCompetenceToDescription(
    client.fiscalDescription || cfg.descricaoPadrao || 'Prestação de serviços',
    competencia,
  )

  return {
    data_emissao: isoDateSP(new Date()),
    natureza_operacao: cfg.naturezaOperacao,
    ...(cfg.regimeEspecial ? { regime_especial_tributacao: cfg.regimeEspecial } : {}),
    optante_simples_nacional: cfg.optanteSimples,
    incentivador_cultural: cfg.incentivadorCultural,
    prestador: {
      cnpj: (cfg.cnpj ?? '').replace(/\D/g, ''),
      inscricao_municipal: cfg.inscricaoMunicipal,
      codigo_municipio: cfg.codigoMunicipio,
    },
    tomador: {
      ...(doc.length === 11 ? { cpf: doc } : { cnpj: doc }),
      razao_social: client.legalName || client.name,
      // Sem e-mail no tomador: a Focus só emite — a nota vai ao cliente pelo
      // sistema, no layout da marca (lib/email-notify), nunca em dobro
      endereco: {
        logradouro: client.street,
        numero: client.addressNumber,
        ...(client.complement ? { complemento: client.complement } : {}),
        bairro: client.district,
        codigo_municipio: client.ibgeCode,
        uf: client.state,
        cep: (client.zipCode ?? '').replace(/\D/g, ''),
      },
    },
    servico: {
      aliquota: aliquotaIss,
      discriminacao,
      iss_retido: cfg.issRetido,
      item_lista_servico: cfg.itemListaServico,
      ...(cfg.codigoTributacao ? { codigo_tributario_municipio: cfg.codigoTributacao } : {}),
      // Municípios que não utilizam o código municipal do serviço (Osasco)
      // não recebem o campo no payload
      ...(cfg.codigoServicoMunicipal && requiresCodigoServicoMunicipal(cfg.codigoMunicipio)
        ? { codigo_municipal_de_tributacao: cfg.codigoServicoMunicipal } : {}),
      ...(cfg.cnae ? { codigo_cnae: cfg.cnae.replace(/\D/g, '') } : {}),
      valor_servicos: Number(valueDecimal),
      ...(cfg.pis != null ? { valor_pis: Number(cfg.pis) } : {}),
      ...(cfg.cofins != null ? { valor_cofins: Number(cfg.cofins) } : {}),
      ...(cfg.csll != null ? { valor_csll: Number(cfg.csll) } : {}),
      ...(cfg.inss != null ? { valor_inss: Number(cfg.inss) } : {}),
    },
  }
}

/** Traduz o status da Focus para o interno. */
export function mapFocusStatus(s: string | undefined): string {
  const map: Record<string, string> = {
    processando_autorizacao: 'PROCESSANDO',
    autorizado: 'AUTORIZADO',
    erro_autorizacao: 'ERRO_AUTORIZACAO',
    cancelado: 'CANCELADO',
    erro_cancelamento: 'ERRO_CANCELAMENTO',
  }
  return map[s ?? ''] ?? 'PROCESSANDO'
}

export class NfseBlockedError extends Error {}

/**
 * Emite a NFS-e de uma cobrança (idempotente). Valida configuração fiscal e
 * dados do tomador; nunca emite duas notas para a mesma cobrança.
 */
export async function emitForCharge(chargeId: string): Promise<{ invoiceId: string; status: string }> {
  const charge = await prisma.asaasCharge.findUniqueOrThrow({
    where: { id: chargeId },
    include: { client: true, nfse: true, items: true },
  })

  // Nota única por cobrança
  if (charge.nfse && charge.nfse.status !== 'ERRO_AUTORIZACAO') {
    return { invoiceId: charge.nfse.id, status: charge.nfse.status }
  }

  if ((await getNfseProvider()) === 'asaas') return emitForChargeAsaas(charge)

  // Prontidão avaliada na competência da própria cobrança (a alíquota efetiva
  // do ISS muda mês a mês no Simples Nacional)
  const { cfg, missing, ready, aliquota } = await fiscalReadiness({
    year: charge.year,
    month: charge.month,
  })
  if (!ready || aliquota == null) {
    throw new NfseBlockedError(`Configuração fiscal incompleta: ${missing.join(', ')}`)
  }

  const missingClient = missingNfseFields(charge.client)
  if (missingClient.length > 0) {
    throw new NfseBlockedError(`Cadastro fiscal do cliente incompleto: ${missingClient.join(', ')}`)
  }

  const ref = nfseRef(charge.id)
  const invoice = charge.nfse ?? (await prisma.nfseInvoice.create({
    data: { chargeId: charge.id, focusRef: ref, status: 'PROCESSANDO' },
  }).catch(async () => {
    const raced = await prisma.nfseInvoice.findUnique({ where: { chargeId: charge.id } })
    if (raced) return raced
    throw new Error('Não foi possível registrar a NFS-e.')
  }))

  // Timeout anterior? Consulta pela referência antes de reenviar
  try {
    const existing = await focus.consultNfse(ref)
    const st = (existing.body as { status?: string })?.status
    if (existing.status !== 404 && st && st !== 'erro_autorizacao') {
      await applyFocusPayload(invoice.id, existing.body as Record<string, unknown>)
      const updated = await prisma.nfseInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
      return { invoiceId: updated.id, status: updated.status }
    }
  } catch {
    // 404/erro na consulta: segue para a emissão
  }

  // Discriminação: descrição fiscal do cliente + itens que compuseram a
  // cobrança (recorrentes e avulsos daquela competência)
  const itemsLine = charge.items.length > 0
    ? charge.items.map((i) => `${i.description} — ${(i.cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`).join('; ')
    : ''
  const payload = buildNfsePayload({
    cfg,
    client: {
      ...charge.client,
      fiscalDescription: itemsLine
        ? `${charge.client.fiscalDescription || cfg.descricaoPadrao || 'Prestação de serviços'}. Itens: ${itemsLine}`
        : charge.client.fiscalDescription,
    },
    valueDecimal: String(charge.value),
    competencia: `${String(charge.month).padStart(2, '0')}/${charge.year}`,
    aliquotaIss: aliquota,
  })

  try {
    const r = await focus.emitNfse(ref, payload)
    const st = (r.body as { status?: string })?.status
    await prisma.nfseInvoice.update({
      where: { id: invoice.id },
      data: {
        status: r.status === 422 ? 'ERRO_AUTORIZACAO' : mapFocusStatus(st),
        lastError: r.status === 422 ? JSON.stringify(r.body).slice(0, 500) : null,
        raw: (r.body ?? undefined) as object | undefined,
      },
    })
    return { invoiceId: invoice.id, status: r.status === 422 ? 'ERRO_AUTORIZACAO' : mapFocusStatus(st) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg !== 'TIMEOUT') {
      await prisma.nfseInvoice.update({
        where: { id: invoice.id },
        data: { status: 'ERRO_AUTORIZACAO', lastError: msg.slice(0, 500) },
      })
    }
    throw err
  }
}

/**
 * Emissão pelo Asaas: a nota é vinculada à cobrança já existente lá. O
 * tomador é o cadastro do cliente no Asaas (CPF/CNPJ + nome); endereço não
 * é exigido. Idempotente pela referência externa.
 */
async function emitForChargeAsaas(charge: {
  id: string; year: number; month: number; asaasId: string | null; value: unknown
  nfse: { id: string; status: string } | null
  items: Array<{ description: string; cents: number }>
  client: {
    id: string; name: string; legalName: string | null; cnpj: string | null; billingEmail: string | null; email: string | null
    fiscalDescription: string | null; asaasCustomerId: string | null
    zipCode: string | null; street: string | null; addressNumber: string | null; district: string | null
    city: string | null; state: string | null; ibgeCode: string | null
  }
}): Promise<{ invoiceId: string; status: string }> {
  if (!charge.asaasId) throw new NfseBlockedError('A cobrança ainda não foi gerada no Asaas.')

  const { cfg, missing, ready, aliquota } = await fiscalReadiness({ year: charge.year, month: charge.month })
  if (!ready || aliquota == null) {
    throw new NfseBlockedError(`Configuração fiscal incompleta: ${missing.join(', ')}`)
  }
  const faltam: string[] = []
  if (!(charge.client.cnpj ?? '').replace(/\D/g, '')) faltam.push('CPF/CNPJ')
  if (!(charge.client.legalName || charge.client.name)) faltam.push('Nome/razão social')
  if (!(charge.client.billingEmail || charge.client.email)) faltam.push('E-mail')
  // O Portal Nacional exige endereço completo do tomador (CEP válido)
  faltam.push(...missingNfseFields(charge.client))
  if (faltam.length > 0) throw new NfseBlockedError(`Cadastro fiscal do cliente incompleto: ${faltam.join(', ')}`)

  // O tomador é o cadastro no Asaas: garante que ele reflita o endereço atual
  const { syncCustomer } = await import('./billing-asaas')
  await syncCustomer(charge.client.id)

  const ref = asaasNfseRef(charge.id)
  // Já existe lá? Autorizada/em processamento: reaproveita. Com erro ou ainda
  // agendada: corrige a mesma nota (o Asaas só aceita uma por cobrança).
  // Cancelada: nota nova.
  const found = await asaas.findInvoiceByExternalRef(ref).catch(() => null)
  const fixable = found && ['ERROR', 'SCHEDULED'].includes(found.status) ? found : null
  const existing = found && !fixable && !['CANCELED', 'CANCELLATION_DENIED'].includes(found.status) ? found : null
  const invoice = charge.nfse
    ? await prisma.nfseInvoice.findUniqueOrThrow({ where: { id: charge.nfse.id } })
    : await prisma.nfseInvoice.create({
      data: { chargeId: charge.id, provider: 'ASAAS', focusRef: existing ? `asaas:${existing.id}` : ref, status: 'PROCESSANDO' },
    }).catch(async () => {
      const raced = await prisma.nfseInvoice.findUnique({ where: { chargeId: charge.id } })
      if (raced) return raced
      throw new Error('Não foi possível registrar a NFS-e.')
    })

  if (existing) {
    await prisma.nfseInvoice.update({ where: { id: invoice.id }, data: { provider: 'ASAAS', focusRef: `asaas:${existing.id}` } })
    await applyAsaasInvoice(invoice.id, existing)
    const updated = await prisma.nfseInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
    return { invoiceId: updated.id, status: updated.status }
  }

  try {
    const payload = buildAsaasInvoicePayload({
      chargeId: charge.id,
      paymentId: charge.asaasId,
      value: Number(charge.value),
      competencia: `${String(charge.month).padStart(2, '0')}/${charge.year}`,
      description: charge.client.fiscalDescription || cfg.descricaoPadrao || '',
      items: charge.items,
      aliquotaIss: aliquota,
      cfg,
    })
    const created = fixable
      ? await asaas.updateInvoice(fixable.id, { serviceDescription: payload.serviceDescription, value: payload.value, deductions: payload.deductions, effectiveDate: payload.effectiveDate, municipalServiceCode: payload.municipalServiceCode, taxes: payload.taxes })
      : await asaas.createInvoice(payload)
    await prisma.nfseInvoice.update({
      where: { id: invoice.id },
      data: { provider: 'ASAAS', focusRef: `asaas:${created.id}`, status: 'PROCESSANDO', raw: created as object },
    })
    // Agendada para hoje → autoriza na hora; o resultado final vem pelo webhook
    const authorized = await asaas.authorizeInvoice(created.id).catch(() => created)
    await applyAsaasInvoice(invoice.id, authorized)
    const updated = await prisma.nfseInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
    return { invoiceId: updated.id, status: updated.status }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg !== 'TIMEOUT') {
      await prisma.nfseInvoice.update({
        where: { id: invoice.id },
        data: { status: 'ERRO_AUTORIZACAO', lastError: msg.slice(0, 500) },
      })
    }
    throw err
  }
}

/** Aplica um payload da Focus (webhook ou consulta) na nota. */
export async function applyFocusPayload(invoiceId: string, body: Record<string, unknown>) {
  const status = mapFocusStatus(body.status as string | undefined)
  const { baseUrl } = await focus.getFocusConfig()
  const abs = (u: unknown) =>
    typeof u === 'string' && u ? (u.startsWith('http') ? u : `${baseUrl}${u}`) : undefined

  await prisma.nfseInvoice.update({
    where: { id: invoiceId },
    data: {
      status,
      numero: (body.numero as string | undefined) ?? undefined,
      codigoVerificacao: (body.codigo_verificacao as string | undefined) ?? undefined,
      pdfUrl: abs(body.url ?? body.url_danfse ?? body.caminho_danfse),
      xmlUrl: abs(body.caminho_xml_nota_fiscal ?? body.url_xml),
      municipalMessage:
        ((body.erros as Array<{ mensagem?: string }> | undefined)?.[0]?.mensagem ??
          (body.mensagem as string | undefined))?.slice(0, 500) ?? undefined,
      lastError: status === 'ERRO_AUTORIZACAO'
        ? JSON.stringify(body.erros ?? body.mensagem ?? '').slice(0, 500)
        : null,
      issuedAt: status === 'AUTORIZADO' ? new Date() : undefined,
      raw: body as object,
    },
  })

  // Nota autorizada → PDF/XML para o cliente (idempotente por nota)
  if (status === 'AUTORIZADO') {
    const { notifyNfseIssued } = await import('./email-notify')
    await notifyNfseIssued(invoiceId).catch(() => {})
  }
}

/**
 * Gatilho pós-pagamento: emite quando a regra do cliente (ou o padrão da
 * configuração fiscal) casa com o evento — sem nunca emitir em duplicidade.
 */
export async function maybeEmitForCharge(chargeId: string, trigger: 'ON_CONFIRMED' | 'ON_RECEIVED') {
  const charge = await prisma.asaasCharge.findUnique({
    where: { id: chargeId },
    include: { client: true, nfse: true },
  })
  if (!charge || charge.nfse) return
  if (!charge.client.nfseEnabled) return

  // Certificado digital pendente (Focus): bloqueio silencioso — sem tentativa,
  // sem log repetido pelo cron/webhook. Pelo Asaas o certificado vive lá.
  if ((await getNfseProvider()) === 'focus') {
    const { certStatus } = await import('./focus-nfe').then((m) => m.getFocusConfig())
    if (certStatus !== 'OK') return
  }

  const cfg = await getFiscalConfig()
  if (!cfg.autoEmit) return
  const rule = charge.client.nfseRule || cfg.emitRule || 'ON_CONFIRMED'
  if (rule === 'MANUAL' || rule === 'ON_COMPETENCE') return
  // ON_CONFIRMED emite já na confirmação; ON_RECEIVED só com saldo disponível
  if (rule === 'ON_RECEIVED' && trigger !== 'ON_RECEIVED') return

  await emitForCharge(chargeId)
}
