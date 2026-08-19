import { prisma } from './prisma'
import { nfseRef, missingFiscalConfigFields, missingNfseFields } from './billing-core'
import * as focus from './focus-nfe'

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

export async function fiscalReadiness() {
  const cfg = await getFiscalConfig()
  const missing = missingFiscalConfigFields({
    ...cfg,
    aliquotaIss: cfg.aliquotaIss,
  })
  return { cfg, missing, ready: missing.length === 0 }
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
}) {
  const { cfg, client, valueDecimal, competencia } = params
  const doc = (client.cnpj ?? '').replace(/\D/g, '')
  const discriminacao =
    `${client.fiscalDescription || cfg.descricaoPadrao || 'Prestação de serviços'} — competência ${competencia}`

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
      // E-mail financeiro no tomador → a Focus envia a nota após autorização
      email: client.billingEmail || client.email || undefined,
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
      aliquota: cfg.aliquotaIss != null ? Number(cfg.aliquotaIss) : undefined,
      discriminacao,
      iss_retido: cfg.issRetido,
      item_lista_servico: cfg.itemListaServico,
      ...(cfg.codigoTributacao ? { codigo_tributario_municipio: cfg.codigoTributacao } : {}),
      ...(cfg.codigoServicoMunicipal ? { codigo_municipal_de_tributacao: cfg.codigoServicoMunicipal } : {}),
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
    include: { client: true, nfse: true },
  })

  // Nota única por cobrança
  if (charge.nfse && charge.nfse.status !== 'ERRO_AUTORIZACAO') {
    return { invoiceId: charge.nfse.id, status: charge.nfse.status }
  }

  const { cfg, missing, ready } = await fiscalReadiness()
  if (!ready) throw new NfseBlockedError(`Configuração fiscal incompleta: ${missing.join(', ')}`)

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

  const payload = buildNfsePayload({
    cfg,
    client: charge.client,
    valueDecimal: String(charge.value),
    competencia: `${String(charge.month).padStart(2, '0')}/${charge.year}`,
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

  // Certificado digital pendente: bloqueio silencioso — sem tentativa, sem
  // log repetido pelo cron/webhook. Libera ao gravar FOCUS_CERT_STATUS=OK.
  const { certStatus } = await import('./focus-nfe').then((m) => m.getFocusConfig())
  if (certStatus !== 'OK') return

  const cfg = await getFiscalConfig()
  if (!cfg.autoEmit) return
  const rule = charge.client.nfseRule || cfg.emitRule || 'ON_CONFIRMED'
  if (rule === 'MANUAL' || rule === 'ON_COMPETENCE') return
  // ON_CONFIRMED emite já na confirmação; ON_RECEIVED só com saldo disponível
  if (rule === 'ON_RECEIVED' && trigger !== 'ON_RECEIVED') return

  await emitForCharge(chargeId)
}
