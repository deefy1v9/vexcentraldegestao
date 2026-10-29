/**
 * Contratos para assinar por link, no mesmo desenho da assinatura do VEX Sales:
 *
 *   1. A VEX assina primeiro: quem gera o contrato marca que revisou, e o
 *      nome, a data, a hora e o IP dela ficam como assinatura da contratada.
 *   2. O PDF é congelado: fica gravado com o resumo SHA-256.
 *   3. O cliente recebe pelo WhatsApp o PDF e o link próprio do contrato
 *      (só quando alguém da VEX clica em "Enviar": nada sai sozinho).
 *   4. Na página, o cliente lê, informa nome completo e CPF e recebe um
 *      código de 6 dígitos no mesmo WhatsApp (10 min, 5 tentativas, 5
 *      códigos por hora; só o HMAC dele é guardado).
 *   5. Com o código (e, se quiser, a rubrica desenhada), assina. O PDF final
 *      é o original intacto mais a página do relatório (lib/assinatura-pdf)
 *      e volta para o cliente pelo WhatsApp.
 *
 * Regras puras em lib/assinatura-core.ts.
 */
import { prisma } from './prisma'
import { decryptSecret, encryptSecret } from './crypto'
import { uazSendDocumentChecked, uazSendTextChecked } from './uazapi'
import { VEX } from './proposal-template'
import { anexarRelatorioDeAssinatura } from './assinatura-pdf'
import {
  PDF_MAX_BYTES, TENTATIVAS_MAX, VALIDADE_DO_CODIGO_MIN,
  codigoConfere, cpfValido, formatarCpf, freioDosCodigos, gerarCodigo, gerarToken, hmacDoCodigo,
  mascararCpf, mascararTelefone, nomeCompletoValido, nomeDoAssinado, normalizarTelefone, pareceUmPdf, pareceUmPng,
  sha256, textoDoCodigo,
} from './assinatura-core'
import { onlyDigits } from './proposal-core'

export const EMPRESA = { nome: 'VEX GROWTH LTDA', cnpj: VEX.cnpj }

export class AssinaturaErro extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function segredo(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.CREDENTIALS_SECRET
  if (!s) throw new Error('AUTH_SECRET precisa estar definido para a assinatura de contratos')
  return s
}

export const linkDoContrato = (base: string, token: string) => `${base.replace(/\/$/, '')}/assinar/${token}`

/** A VEX gera o contrato e assina do lado dela. */
export async function criarContrato(d: {
  user: { id: string; name: string }
  ip: string | null
  titulo: string
  clientId: string | null
  telefone: string
  fileName: string
  bytes: Uint8Array
  revisei: boolean
}) {
  if (!d.revisei) throw new AssinaturaErro(400, 'Marque que revisou o contrato: é isso que vale como a assinatura da VEX.')
  const titulo = d.titulo.replace(/\s+/g, ' ').trim()
  if (titulo.length < 3 || titulo.length > 160) throw new AssinaturaErro(400, 'Dê um título ao contrato (de 3 a 160 letras).')
  const telefone = normalizarTelefone(d.telefone)
  if (!telefone) throw new AssinaturaErro(400, 'Confira o WhatsApp de quem assina: DDD e número.')
  if (!d.bytes.length || d.bytes.length > PDF_MAX_BYTES) throw new AssinaturaErro(400, 'Envie um PDF de até 15 MB.')
  if (!pareceUmPdf(d.bytes)) throw new AssinaturaErro(400, 'O arquivo não é um PDF.')
  if (d.clientId && !(await prisma.client.findUnique({ where: { id: d.clientId }, select: { id: true } }))) {
    throw new AssinaturaErro(400, 'Cliente não encontrado.')
  }
  const fileName = (d.fileName || 'contrato.pdf').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 140)
  return prisma.contractSignature.create({
    data: {
      token: gerarToken(),
      title: titulo,
      clientId: d.clientId,
      fileName: /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`,
      pdf: Buffer.from(d.bytes),
      sha256: sha256(d.bytes),
      signerPhone: telefone,
      companySignerId: d.user.id,
      companySignerName: d.user.name,
      companySignedAt: new Date(),
      companySignerIp: (d.ip ?? '').slice(0, 64) || null,
    },
    select: { id: true, token: true },
  })
}

/** Manda o PDF e o link para o WhatsApp de quem assina. Só por clique de alguém da VEX. */
export async function enviarParaOCliente(id: string, base: string) {
  const c = await prisma.contractSignature.findUnique({ where: { id } })
  if (!c) throw new AssinaturaErro(404, 'Contrato não encontrado.')
  if (c.status !== 'AGUARDANDO') throw new AssinaturaErro(409, 'Este contrato já foi assinado ou cancelado.')
  const link = linkDoContrato(base, c.token)
  const texto =
    `Olá! Segue o contrato "${c.title}" da VEX Growth para você ler e assinar. Do nosso lado já está assinado.\n\n` +
    `Para assinar: abra o link, confira o contrato, informe o nome completo e o CPF e digite o código de 6 dígitos que vai chegar aqui neste WhatsApp.\n\n${link}`
  const doc = await uazSendDocumentChecked(c.signerPhone, { bytes: c.pdf, mime: 'application/pdf', fileName: c.fileName })
  if (!doc.ok) throw new AssinaturaErro(502, `O PDF não saiu pelo WhatsApp: ${doc.erro ?? 'erro desconhecido'}.`)
  const msg = await uazSendTextChecked(c.signerPhone, texto)
  if (!msg.ok) throw new AssinaturaErro(502, `O PDF saiu, mas o link não: ${msg.erro ?? 'erro desconhecido'}. Copie o link e mande à mão.`)
  await prisma.contractSignature.update({ where: { id }, data: { sentAt: new Date() } })
  return { link }
}

/** O que a página pública mostra. Nunca o CPF nem o código. */
export async function contratoPeloToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const c = await prisma.contractSignature.findUnique({
    where: { token },
    select: {
      id: true, title: true, status: true, fileName: true, sha256: true, signerPhone: true, openedAt: true,
      companySignerName: true, companySignedAt: true, signerName: true, signedAt: true, signerCpfMasked: true,
      codeExpiresAt: true, codeHash: true,
    },
  })
  if (!c) return null
  if (!c.openedAt && c.status === 'AGUARDANDO') await prisma.contractSignature.update({ where: { id: c.id }, data: { openedAt: new Date() } })
  return {
    id: c.id,
    titulo: c.title,
    status: c.status,
    arquivo: c.fileName,
    sha256: c.sha256,
    destino: mascararTelefone(c.signerPhone),
    vex: { quem: c.companySignerName, em: c.companySignedAt.toISOString() },
    assinado: c.signedAt ? { nome: c.signerName ?? '', em: c.signedAt.toISOString(), cpf: c.signerCpfMasked ?? '' } : null,
    codigoPendente: !!c.codeHash && !!c.codeExpiresAt && c.codeExpiresAt > new Date(),
  }
}

/** Grava nome e CPF (cifrado) e manda o código pelo WhatsApp. Trocar o nome pede código novo. */
export async function pedirCodigo(token: string, d: { nome: string; cpf: string }) {
  const c = await prisma.contractSignature.findUnique({ where: { token } })
  if (!c) throw new AssinaturaErro(404, 'Este contrato não existe.')
  if (c.status === 'ASSINADO') throw new AssinaturaErro(409, 'Este contrato já foi assinado.')
  if (c.status !== 'AGUARDANDO') throw new AssinaturaErro(409, 'Este contrato foi cancelado. Fale com a VEX.')
  const nome = d.nome.replace(/\s+/g, ' ').trim()
  if (!nomeCompletoValido(nome)) throw new AssinaturaErro(400, 'Escreva o nome completo, como no documento.')
  if (!cpfValido(d.cpf)) throw new AssinaturaErro(400, 'Confira o CPF: os números não batem.')
  const cpf = onlyDigits(d.cpf)

  const freio = freioDosCodigos(c.codeRequests)
  if (!freio.ok) throw new AssinaturaErro(429, `Você já pediu vários códigos nesta hora. Tente de novo em ${freio.esperarMin} minutos.`)

  const codigo = gerarCodigo()
  // Guarda antes de mandar: o código tem que valer quando chegar.
  await prisma.contractSignature.update({
    where: { id: c.id },
    data: {
      signerName: nome,
      signerCpf: encryptSecret(cpf),
      signerCpfMasked: mascararCpf(cpf),
      codeHash: hmacDoCodigo(segredo(), c.id, codigo),
      codeSentAt: new Date(),
      codeExpiresAt: new Date(Date.now() + VALIDADE_DO_CODIGO_MIN * 60_000),
      codeAttempts: 0,
      codeRequests: freio.marcas,
    },
  })
  const r = await uazSendTextChecked(c.signerPhone, textoDoCodigo(codigo, c.title))
  if (!r.ok) {
    await prisma.contractSignature.update({ where: { id: c.id }, data: { codeHash: null } })
    throw new AssinaturaErro(502, 'Não conseguimos mandar o código pelo WhatsApp agora. Tente de novo em instantes.')
  }
  return { destino: mascararTelefone(c.signerPhone) }
}

/**
 * Confere o código e assina. Uma vez só: o contrato já assinado não muda.
 * Código errado conta tentativa; na quinta, só com código novo.
 */
export async function assinar(token: string, r: { codigo: string; desenho?: Uint8Array | null; ip: string | null; aparelho: string | null; base: string }) {
  const c = await prisma.contractSignature.findUnique({ where: { token } })
  if (!c) throw new AssinaturaErro(404, 'Este contrato não existe.')
  if (c.status === 'ASSINADO') return { jaAssinado: true }
  if (c.status !== 'AGUARDANDO') throw new AssinaturaErro(409, 'Este contrato foi cancelado. Fale com a VEX.')
  if (!c.codeHash || !c.signerCpf || !c.signerName || !c.codeSentAt) throw new AssinaturaErro(400, 'Peça o código primeiro.')
  if (!c.codeExpiresAt || c.codeExpiresAt <= new Date()) throw new AssinaturaErro(400, 'O código venceu. Peça um novo.')
  if (c.codeAttempts >= TENTATIVAS_MAX) throw new AssinaturaErro(400, `Você errou o código ${TENTATIVAS_MAX} vezes. Peça um novo.`)

  if (!codigoConfere(segredo(), c.id, r.codigo, c.codeHash)) {
    const t = await prisma.contractSignature.update({ where: { id: c.id }, data: { codeAttempts: { increment: 1 } }, select: { codeAttempts: true } })
    const restam = TENTATIVAS_MAX - t.codeAttempts
    throw new AssinaturaErro(400, restam > 0 ? `Código errado. ${restam === 1 ? 'Resta 1 tentativa' : `Restam ${restam} tentativas`}.` : 'Código errado. Peça um novo.')
  }

  const desenho = r.desenho?.length ? r.desenho : null
  if (desenho && !pareceUmPng(desenho)) throw new AssinaturaErro(400, 'A rubrica desenhada não abriu. Desenhe de novo ou siga sem ela.')

  const agora = new Date()
  const ip = (r.ip ?? '').slice(0, 64) || null
  const aparelho = (r.aparelho ?? '').slice(0, 400) || null
  // A trava é o WHERE: o mesmo código, no mesmo contrato aberto, assina uma vez.
  const travou = await prisma.contractSignature.updateMany({
    where: { id: c.id, status: 'AGUARDANDO', codeHash: c.codeHash },
    data: { status: 'ASSINADO', signedAt: agora, codeHash: null, signerIp: ip, signerDevice: aparelho, drawing: desenho ? Buffer.from(desenho) : null },
  })
  if (travou.count === 0) return { jaAssinado: true }

  const cpf = formatarCpf(decryptSecret(c.signerCpf) ?? '')
  const final = await anexarRelatorioDeAssinatura(c.pdf, {
    titulo: c.title,
    sha256Original: c.sha256,
    contratada: { empresa: EMPRESA.nome, cnpj: EMPRESA.cnpj, quem: c.companySignerName, em: c.companySignedAt, ip: c.companySignerIp },
    contratante: { nome: c.signerName, cpf },
    verificacao: { destino: mascararTelefone(c.signerPhone), enviadoEm: c.codeSentAt, confirmadoEm: agora },
    aceite: { em: agora, ip, aparelho },
    desenho,
    link: linkDoContrato(r.base, c.token),
  })
  const bytes = Buffer.from(final)
  await prisma.contractSignature.update({ where: { id: c.id }, data: { signedPdf: bytes, signedSha256: sha256(bytes) } })

  // O PDF assinado volta para o cliente. Não derruba a assinatura se não sair: ele também baixa pela página.
  const envio = await uazSendDocumentChecked(c.signerPhone, {
    bytes,
    mime: 'application/pdf',
    fileName: nomeDoAssinado(c.fileName),
    caption: `Contrato "${c.title}" assinado. Este PDF tem a página do relatório de assinatura: guarde para a sua segurança.`,
  }).catch((e) => ({ ok: false, erro: e instanceof Error ? e.message : String(e) }))
  if (!envio.ok) console.warn(`[assinatura] o PDF assinado de ${c.id} não saiu pelo WhatsApp: ${envio.erro}`)
  return { jaAssinado: false }
}

/** O PDF para baixar: o assinado quando existe, senão o original. */
export async function pdfDoContrato(where: { id: string } | { token: string }, tipo: 'original' | 'assinado' | 'atual' = 'atual') {
  const c = await prisma.contractSignature.findUnique({ where, select: { pdf: true, signedPdf: true, fileName: true, status: true } })
  if (!c) return null
  const usarAssinado = tipo === 'assinado' || (tipo === 'atual' && !!c.signedPdf)
  if (usarAssinado && !c.signedPdf) return null
  return { bytes: usarAssinado ? c.signedPdf! : c.pdf, fileName: usarAssinado ? nomeDoAssinado(c.fileName) : c.fileName }
}

export async function cancelarContrato(id: string) {
  const r = await prisma.contractSignature.updateMany({ where: { id, status: 'AGUARDANDO' }, data: { status: 'CANCELADO', codeHash: null } })
  if (r.count === 0) throw new AssinaturaErro(409, 'Só dá para cancelar contrato que ainda não foi assinado.')
}
