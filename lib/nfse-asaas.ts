import { prisma } from './prisma'
import * as asaas from './asaas'
import { applyCompetenceToDescription } from './billing-core'

/**
 * Emissão de NFS-e pelo próprio Asaas (Portal Nacional).
 *
 * - Uma nota por cobrança (unique chargeId), referência determinística
 *   `asaas:nfse:{chargeId}` — o Asaas guarda em externalReference.
 * - A nota nasce agendada para hoje e é autorizada na hora; o status final
 *   chega pelo webhook (INVOICE_AUTHORIZED / INVOICE_ERROR) ou por consulta.
 * - Dados do tomador vêm do cadastro do cliente no Asaas (CPF/CNPJ + nome);
 *   aqui só entram valor, descrição e tributos.
 */

export function asaasNfseRef(chargeId: string): string {
  return `asaas:nfse:${chargeId}`
}

/** Traduz o status do Asaas para o interno (mesmo vocabulário da Focus). */
export function mapAsaasInvoiceStatus(s: string | undefined): string {
  const map: Record<string, string> = {
    SCHEDULED: 'PROCESSANDO',
    SYNCHRONIZED: 'PROCESSANDO',
    AUTHORIZED: 'AUTORIZADO',
    PROCESSING_CANCELLATION: 'AUTORIZADO',
    CANCELED: 'CANCELADO',
    CANCELLATION_DENIED: 'ERRO_CANCELAMENTO',
    ERROR: 'ERRO_AUTORIZACAO',
  }
  return map[s ?? ''] ?? 'PROCESSANDO'
}

function isoDateSP(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Código de tributação nacional (Lista de Serviços Nacional da NFS-e): três
 * níveis, 6 dígitos — item 17.06 é "17.06.01" → "170601". O código explícito
 * da configuração prevalece; sem ele, o item da LC 116 ganha o desdobro 01
 * (o mais comum; se a prefeitura recusar, cadastrar o código exato).
 */
export function nationalServiceCode(cfg: { codigoTributacao?: string | null; itemListaServico?: string | null }): string | undefined {
  const explicit = (cfg.codigoTributacao ?? '').replace(/\D/g, '')
  if (explicit.length === 6) return explicit
  const item = (cfg.itemListaServico ?? '').replace(/\D/g, '')
  if (!item) return undefined
  return item.length >= 6 ? item.slice(0, 6) : `${item.padStart(4, '0')}01`
}

/** Nome oficial dos itens da LC 116 usados pela VEX (o Asaas exige o nome no fluxo municipal). */
const LC116_NAMES: Record<string, string> = {
  '17.06': 'Propaganda e publicidade, inclusive promoção de vendas, planejamento de campanhas ou sistemas de publicidade, elaboração de desenhos, textos e demais materiais publicitários',
  '10.08': 'Agenciamento de publicidade e propaganda, inclusive o agenciamento de veiculação por quaisquer meios',
}

/** Item da LC 116 no formato da prefeitura: "1706" ou "17.06" → "17.06". */
export function serviceListItem(cfg: { itemListaServico?: string | null }): string | undefined {
  const d = (cfg.itemListaServico ?? '').replace(/\D/g, '')
  if (d.length < 3) return undefined
  const item = d.slice(0, 4)
  return `${item.slice(0, -2)}.${item.slice(-2)}`
}

/**
 * Serviço da nota conforme o caminho de emissão da conta Asaas:
 * - web service da prefeitura (wsKeyConfigured): item da LC 116 + nome, como
 *   Osasco aceita ("17.06" + descrição oficial);
 * - Portal Nacional: código de tributação nacional de 6 dígitos.
 */
export function asaasServiceFields(cfg: { codigoTributacao?: string | null; itemListaServico?: string | null; wsKeyConfigured?: boolean | null }): { municipalServiceCode?: string; municipalServiceName?: string } {
  if (cfg.wsKeyConfigured) {
    const item = serviceListItem(cfg)
    if (!item) return {}
    return { municipalServiceCode: item, municipalServiceName: LC116_NAMES[item] ?? `Serviço ${item} da Lista de Serviços (LC 116/2003)` }
  }
  const code = nationalServiceCode(cfg)
  return code ? { municipalServiceCode: code } : {}
}

/** Monta o payload da nota para uma cobrança (valor e descrição vêm dela). */
export function buildAsaasInvoicePayload(params: {
  chargeId: string
  paymentId: string
  value: number
  competencia: string
  description: string
  items: Array<{ description: string; cents: number }>
  aliquotaIss: number
  cfg: { codigoTributacao?: string | null; itemListaServico?: string | null; wsKeyConfigured?: boolean | null; issRetido?: boolean | null; descricaoPadrao?: string | null }
}) {
  const { chargeId, paymentId, value, competencia, description, items, aliquotaIss, cfg } = params
  const itemsLine = items.length > 0
    ? ` Itens: ${items.map((i) => `${i.description} — ${(i.cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`).join('; ')}`
    : ''
  const serviceDescription = `${applyCompetenceToDescription(description || cfg.descricaoPadrao || 'Prestação de serviços', competencia)}${itemsLine}`.slice(0, 2000)
  return {
    payment: paymentId,
    serviceDescription,
    value,
    deductions: 0,
    effectiveDate: isoDateSP(new Date()),
    externalReference: asaasNfseRef(chargeId),
    ...asaasServiceFields(cfg),
    taxes: {
      retainIss: !!cfg.issRetido,
      iss: aliquotaIss,
      cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0,
    },
  }
}

/** Aplica um retorno do Asaas (webhook ou consulta) na nota. */
export async function applyAsaasInvoice(invoiceId: string, body: asaas.AsaasInvoice) {
  const status = mapAsaasInvoiceStatus(body.status)
  await prisma.nfseInvoice.update({
    where: { id: invoiceId },
    data: {
      status,
      numero: body.number ?? undefined,
      codigoVerificacao: body.validationCode ?? undefined,
      pdfUrl: body.pdfUrl ?? undefined,
      xmlUrl: body.xmlUrl ?? undefined,
      municipalMessage: body.statusDescription?.slice(0, 500) ?? undefined,
      lastError: status === 'ERRO_AUTORIZACAO' ? (body.statusDescription ?? 'Erro na emissão').slice(0, 500) : null,
      issuedAt: status === 'AUTORIZADO' ? new Date() : undefined,
      raw: body as object,
    },
  })

  // Nota autorizada → PDF/XML para o cliente, no layout da marca (idempotente por nota)
  if (status === 'AUTORIZADO') {
    const { notifyNfseIssued } = await import('./email-notify')
    await notifyNfseIssued(invoiceId).catch(() => {})
  }
}

/** Consulta a nota no Asaas e sincroniza o estado local. */
export async function consultAsaasInvoice(nfseId: string) {
  const inv = await prisma.nfseInvoice.findUniqueOrThrow({ where: { id: nfseId } })
  const asaasId = inv.focusRef.startsWith('asaas:') ? inv.focusRef.slice('asaas:'.length) : null
  if (!asaasId) throw new Error('Esta nota não foi emitida pelo Asaas.')
  const body = await asaas.getInvoice(asaasId)
  await applyAsaasInvoice(nfseId, body)
  return body
}

/** Cancela a nota no Asaas (a prefeitura pode negar). */
export async function cancelAsaasInvoice(nfseId: string) {
  const inv = await prisma.nfseInvoice.findUniqueOrThrow({ where: { id: nfseId } })
  const asaasId = inv.focusRef.startsWith('asaas:') ? inv.focusRef.slice('asaas:'.length) : null
  if (!asaasId) throw new Error('Esta nota não foi emitida pelo Asaas.')
  const body = await asaas.cancelInvoice(asaasId)
  await applyAsaasInvoice(nfseId, body)
  return body
}
