/**
 * Regras puras do faturamento — sem Prisma, sem rede — para serem testáveis
 * isoladamente (scripts/tests). Timezone de referência: America/Sao_Paulo.
 */

export interface ServiceLike {
  monthlyValue: number | null
  status: string
  startDate?: Date | string | null
  endDate?: Date | string | null
}

export interface ClientLike {
  status: string
  contractEnd?: Date | string | null
}

/** Início e fim (exclusivo) da competência no calendário civil. */
export function competenceRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  }
}

/**
 * Valor da cobrança de uma competência: soma dos serviços ativos válidos no
 * período, respeitando início/término do serviço, fim do contrato e status
 * do cliente. Retorna em CENTAVOS (inteiro) para nunca somar float.
 */
export function computeCompetenceCents(
  client: ClientLike,
  services: ServiceLike[],
  year: number,
  month: number,
): number {
  if (client.status !== 'ATIVO') return 0
  const { start, end } = competenceRange(year, month)

  // Contrato encerrado antes da competência: nada a cobrar
  if (client.contractEnd && new Date(client.contractEnd) < start) return 0

  let cents = 0
  for (const s of services) {
    if (s.status !== 'ATIVO') continue
    if (s.monthlyValue == null || s.monthlyValue <= 0) continue
    if (s.startDate && new Date(s.startDate) >= end) continue // começa depois
    if (s.endDate && new Date(s.endDate) < start) continue // terminou antes
    cents += Math.round(s.monthlyValue * 100)
  }
  return cents
}

/**
 * Vencimento da competência: dia configurado, limitado ao último dia válido
 * do mês (dia 31 em abril vira 30; 30 em fevereiro vira 28/29).
 * Devolve string YYYY-MM-DD (formato aceito pelo Asaas).
 */
export function dueDateFor(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const d = Math.min(Math.max(day || 1, 1), lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Referência determinística da cobrança: billing:{clientId}:{YYYY-MM}. */
export function chargeExternalRef(clientId: string, year: number, month: number): string {
  return `billing:${clientId}:${year}-${String(month).padStart(2, '0')}`
}

/** Referência determinística da NFS-e: nfse:{internalChargeId}. */
export function nfseRef(chargeId: string): string {
  return `nfse:${chargeId}`
}

/** Header Basic da Focus: token como usuário, senha vazia. */
export function focusBasicAuth(token: string): string {
  return `Basic ${Buffer.from(`${token}:`).toString('base64')}`
}

/**
 * A geração da cobrança deve acontecer quando faltam até `leadDays` para o
 * vencimento — nunca retroativa (vencimento no passado é ignorado pelo job).
 */
export function shouldGenerateNow(todayISO: string, dueDateISO: string, leadDays: number): boolean {
  const today = new Date(`${todayISO}T00:00:00Z`).getTime()
  const due = new Date(`${dueDateISO}T00:00:00Z`).getTime()
  if (due < today) return false
  return due - today <= leadDays * 86_400_000
}

/** Chave idempotente para eventos de webhook sem id próprio. */
export function webhookEventKey(provider: string, parts: Array<string | number | null | undefined>): string {
  const norm = parts.map((p) => String(p ?? '')).join('|')
  let hash = 0
  for (let i = 0; i < norm.length; i++) {
    hash = (hash * 31 + norm.charCodeAt(i)) | 0
  }
  return `${provider}:${Math.abs(hash).toString(36)}:${norm.slice(0, 120)}`
}

/** Centavos → string decimal "1234.56" (payloads de API). */
export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * Origem pública do sistema atrás do proxy: prioriza os headers do Traefik
 * (x-forwarded-*), depois NEXTAUTH_URL e por último a URL da requisição —
 * evita expor 0.0.0.0:3000 nas URLs de webhook.
 */
export function publicOrigin(req: { headers: { get(name: string): string | null }; url: string }): string {
  const host = req.headers.get('x-forwarded-host')
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  if (host) return `${proto}://${host}`
  const env = process.env.NEXTAUTH_URL
  if (env) return env.replace(/\/$/, '')
  return new URL(req.url).origin
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Valida lista de e-mails (máx. 10) para reenvio de NFS-e. */
export function validateEmails(raw: string[]): { ok: string[]; invalid: string[] } {
  const ok: string[] = []
  const invalid: string[] = []
  for (const e of raw.map((x) => x.trim()).filter(Boolean)) {
    if (EMAIL_RE.test(e) && ok.length < 10) ok.push(e)
    else invalid.push(e)
  }
  return { ok, invalid }
}

/** Campos obrigatórios do cliente para cobrança e para NFS-e. */
export function missingBillingFields(c: {
  name?: string | null
  legalName?: string | null
  cnpj?: string | null
  billingEmail?: string | null
  email?: string | null
  paymentDay?: number | null
}): string[] {
  const missing: string[] = []
  if (!c.cnpj?.trim()) missing.push('CPF/CNPJ')
  if (!(c.billingEmail || c.email)?.trim()) missing.push('E-mail financeiro')
  if (!c.paymentDay) missing.push('Dia de vencimento')
  return missing
}

export function missingNfseFields(c: {
  legalName?: string | null
  name?: string | null
  cnpj?: string | null
  billingEmail?: string | null
  email?: string | null
  zipCode?: string | null
  street?: string | null
  addressNumber?: string | null
  district?: string | null
  city?: string | null
  state?: string | null
  ibgeCode?: string | null
}): string[] {
  const missing: string[] = []
  if (!(c.legalName || c.name)?.trim()) missing.push('Razão social/nome')
  if (!c.cnpj?.trim()) missing.push('CPF/CNPJ')
  if (!(c.billingEmail || c.email)?.trim()) missing.push('E-mail financeiro')
  if (!c.zipCode?.trim()) missing.push('CEP')
  if (!c.street?.trim()) missing.push('Logradouro')
  if (!c.addressNumber?.trim()) missing.push('Número')
  if (!c.district?.trim()) missing.push('Bairro')
  if (!c.city?.trim()) missing.push('Cidade')
  if (!c.state?.trim()) missing.push('UF')
  if (!c.ibgeCode?.trim()) missing.push('Código IBGE do município')
  return missing
}

export function missingFiscalConfigFields(f: {
  cnpj?: string | null
  razaoSocial?: string | null
  inscricaoMunicipal?: string | null
  codigoMunicipio?: string | null
  naturezaOperacao?: string | null
  itemListaServico?: string | null
  codigoServicoMunicipal?: string | null
  aliquotaIss?: unknown
  descricaoPadrao?: string | null
}): string[] {
  const missing: string[] = []
  if (!f.cnpj?.trim()) missing.push('CNPJ do prestador')
  if (!f.razaoSocial?.trim()) missing.push('Razão social')
  if (!f.inscricaoMunicipal?.trim()) missing.push('Inscrição municipal')
  if (!f.codigoMunicipio?.trim()) missing.push('Código IBGE do município')
  if (!f.naturezaOperacao?.trim()) missing.push('Natureza da operação')
  if (!f.itemListaServico?.trim()) missing.push('Item da lista de serviço')
  if (!f.codigoServicoMunicipal?.trim()) missing.push('Código municipal do serviço')
  if (f.aliquotaIss == null) missing.push('Alíquota do ISS')
  if (!f.descricaoPadrao?.trim()) missing.push('Descrição padrão do serviço')
  return missing
}
