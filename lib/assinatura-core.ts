/**
 * Regras puras da assinatura de contratos por link — sem Prisma, sem I/O,
 * testáveis (scripts/tests/assinatura-core.test.ts).
 *
 * Assinatura eletrônica simples, aceita entre as partes (MP 2.200-2/2001,
 * art. 10, § 2º; Lei 14.063/2020): o cliente se identifica com nome e CPF e
 * prova que tem o celular com o código de 6 dígitos que chega no WhatsApp.
 */
import crypto from 'crypto'
import { isValidCPF, onlyDigits } from './proposal-core'

export const VALIDADE_DO_CODIGO_MIN = 10
export const TENTATIVAS_MAX = 5
/** Códigos por contrato por hora: o bastante para quem errou, pouco para encher o WhatsApp de alguém. */
export const CODIGOS_POR_HORA = 5
export const DESENHO_MAX_BYTES = 400 * 1024
export const PDF_MAX_BYTES = 15 * 1024 * 1024

export type StatusDaAssinatura = 'AGUARDANDO' | 'ASSINADO' | 'CANCELADO'

export const ROTULO_DO_STATUS: Record<StatusDaAssinatura, string> = {
  AGUARDANDO: 'Aguardando o cliente',
  ASSINADO: 'Assinado',
  CANCELADO: 'Cancelado',
}

export const sha256 = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex')

/** O segredo do link: 24 bytes aleatórios, 32 caracteres em base64url. */
export const gerarToken = () => crypto.randomBytes(24).toString('base64url')

/** Os 6 dígitos do código de uso único. */
export const gerarCodigo = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

/** O código nunca é guardado: só o HMAC dele, preso ao contrato. */
export function hmacDoCodigo(segredo: string, contratoId: string, codigo: string): string {
  return crypto.createHmac('sha256', segredo).update(`assinatura:${contratoId}:${onlyDigits(codigo).slice(0, 6)}`).digest('hex')
}

/** Compara o HMAC do código digitado com o guardado, em tempo constante. */
export function codigoConfere(segredo: string, contratoId: string, digitado: string, guardado: string): boolean {
  const veio = Buffer.from(hmacDoCodigo(segredo, contratoId, digitado), 'utf8')
  const esperado = Buffer.from(guardado, 'utf8')
  return veio.length === esperado.length && crypto.timingSafeEqual(veio, esperado)
}

/** Nome e sobrenome, só letras, espaços, hífen e apóstrofo. */
export function nomeCompletoValido(nome: string): boolean {
  const n = nome.replace(/\s+/g, ' ').trim()
  if (n.length < 5 || n.length > 120) return false
  if (!/^[\p{L}' .-]+$/u.test(n)) return false
  return n.split(' ').filter((p) => p.replace(/[.'-]/g, '').length >= 2).length >= 2
}

export const cpfValido = isValidCPF

export function formatarCpf(cpf: string): string {
  const d = onlyDigits(cpf)
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf
}

/** "***.456.789-**": o meio do CPF, como a LGPD pede para listas. */
export function mascararCpf(cpf: string): string {
  const d = onlyDigits(cpf)
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '***'
}

/** O número do WhatsApp só em dígitos e com o 55 na frente; null se não parece celular do Brasil. */
export function normalizarTelefone(v: string | null | undefined): string | null {
  let d = onlyDigits(v)
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return /^55\d{10,11}$/.test(d) ? d : null
}

/** "(11) •••••-8523": o suficiente para o cliente reconhecer o próprio número. */
export function mascararTelefone(v: string): string {
  const d = onlyDigits(v).replace(/^55(?=\d{10,11}$)/, '')
  if (d.length < 10) return '•••'
  return `(${d.slice(0, 2)}) •••••-${d.slice(-4)}`
}

/**
 * O freio dos códigos: devolve as marcas que continuam valendo (a última
 * hora) e, se estourou, quantos minutos faltam para pedir de novo.
 */
export function freioDosCodigos(marcas: Date[], agora: Date = new Date()): { ok: true; marcas: Date[] } | { ok: false; esperarMin: number } {
  const hora = 60 * 60_000
  const valendo = marcas.filter((m) => agora.getTime() - m.getTime() < hora).sort((a, b) => a.getTime() - b.getTime())
  if (valendo.length >= CODIGOS_POR_HORA) {
    return { ok: false, esperarMin: Math.max(1, Math.ceil((valendo[0].getTime() + hora - agora.getTime()) / 60_000)) }
  }
  return { ok: true, marcas: [...valendo, agora] }
}

/** PDF de verdade: começa com %PDF- (não confia na extensão nem no tipo que o navegador diz). */
export const pareceUmPdf = (b: Uint8Array) => b.length > 8 && Buffer.from(b.subarray(0, 5)).toString('latin1') === '%PDF-'

/** PNG de verdade, e do tamanho que uma rubrica tem. */
export const pareceUmPng = (b: Uint8Array) =>
  b.length > 8 && b.length <= DESENHO_MAX_BYTES && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47

/** "Chrome no Android", "Safari no iPhone": o aparelho em palavras, a partir do navegador. */
export function aparelhoDe(ua: string | null | undefined): string {
  if (!ua) return 'Não informado'
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null
  const navegador = /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Edg\//.test(ua) ? 'Edge'
      : /OPR\/|Opera/.test(ua) ? 'Opera'
        : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
            : /Safari\//.test(ua) ? 'Safari' : null
  if (navegador && sistema) return `${navegador} no ${sistema}`
  return navegador ?? sistema ?? 'Navegador não identificado'
}

const HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
})
/** "29/10/2026 às 14:03:22 (horário de Brasília)". */
export const quando = (d: Date) => `${HORA.format(d).replace(', ', ' às ')} (horário de Brasília)`

/** O nome do arquivo assinado: o original com "-assinado". */
export function nomeDoAssinado(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, '')
  return `${base} - assinado.pdf`
}

/** A mensagem do código no WhatsApp. */
export function textoDoCodigo(codigo: string, titulo: string): string {
  return `${codigo} é o seu código para assinar o contrato "${titulo}" da VEX Growth. Ele vale por ${VALIDADE_DO_CODIGO_MIN} minutos. Não passe este código para ninguém.`
}
