/**
 * Contratos para assinar por link, no mesmo desenho da assinatura do VEX Sales,
 * com um ou mais assinantes (o representante da VEX e o do cliente):
 *
 *   1. Quem prepara o contrato na Central marca que revisou; o nome dele, a
 *      data e a hora ficam no relatório como "preparado por".
 *   2. O PDF é congelado: fica gravado com o resumo SHA-256.
 *   3. Cada assinante recebe no PRÓPRIO WhatsApp o PDF e o PRÓPRIO link (só
 *      quando alguém da VEX clica em "Enviar": nada sai sozinho).
 *   4. Na página, a pessoa lê, informa nome completo e CPF e recebe um código
 *      de 6 dígitos no mesmo WhatsApp (10 min, 5 tentativas, 5 códigos por
 *      hora; só o HMAC dele é guardado).
 *   5. Com o código (e, se quiser, a rubrica), assina. Quando o último assina,
 *      sai o PDF final: o original intacto mais o relatório com todos
 *      (lib/assinatura-pdf), que vai para o WhatsApp de cada assinante.
 *
 * Os contratos antigos, de um assinante só (os campos signer* do
 * ContractSignature), continuam abrindo pelo link deles. Regras puras em
 * lib/assinatura-core.ts.
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

export type Papel = 'CONTRATADA' | 'CONTRATANTE'
export const ROTULO_DO_PAPEL: Record<Papel, string> = { CONTRATADA: 'Contratada · VEX Growth', CONTRATANTE: 'Contratante' }

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
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? n

/* --------------------------------- criar --------------------------------- */

export interface NovoAssinante { papel: Papel; nome: string; telefone: string }

/** Guarda o contrato com os assinantes. Quem prepara marca que revisou. */
export async function criarContrato(d: {
  user: { id: string; name: string }
  ip: string | null
  titulo: string
  clientId: string | null
  fileName: string
  bytes: Uint8Array
  revisei: boolean
  assinantes: NovoAssinante[]
}) {
  if (!d.revisei) throw new AssinaturaErro(400, 'Marque que revisou o contrato antes de gerar os links.')
  const titulo = d.titulo.replace(/\s+/g, ' ').trim()
  if (titulo.length < 3 || titulo.length > 160) throw new AssinaturaErro(400, 'Dê um título ao contrato (de 3 a 160 letras).')
  if (!d.bytes.length || d.bytes.length > PDF_MAX_BYTES) throw new AssinaturaErro(400, 'Envie um PDF de até 15 MB.')
  if (!pareceUmPdf(d.bytes)) throw new AssinaturaErro(400, 'O arquivo não é um PDF.')

  const assinantes = d.assinantes.map((a, i) => {
    const nome = a.nome.replace(/\s+/g, ' ').trim()
    const telefone = normalizarTelefone(a.telefone)
    if (nome.length < 3) throw new AssinaturaErro(400, `Escreva o nome de quem assina (${ROTULO_DO_PAPEL[a.papel] ?? 'assinante'}).`)
    if (!telefone) throw new AssinaturaErro(400, `Confira o WhatsApp de ${nome}: DDD e número.`)
    if (a.papel !== 'CONTRATADA' && a.papel !== 'CONTRATANTE') throw new AssinaturaErro(400, 'Papel de assinante inválido.')
    return { papel: a.papel, nome, telefone, ordem: i }
  })
  if (!assinantes.some((a) => a.papel === 'CONTRATANTE')) throw new AssinaturaErro(400, 'Falta quem assina pelo cliente.')
  if (new Set(assinantes.map((a) => a.telefone)).size !== assinantes.length) {
    throw new AssinaturaErro(400, 'Cada assinante precisa de um WhatsApp diferente: o código vai para o celular de cada um.')
  }
  if (d.clientId && !(await prisma.client.findUnique({ where: { id: d.clientId }, select: { id: true } }))) {
    throw new AssinaturaErro(400, 'Cliente não encontrado.')
  }
  const fileName = (d.fileName || 'contrato.pdf').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 140)
  const contratante = assinantes.find((a) => a.papel === 'CONTRATANTE')!
  return prisma.contractSignature.create({
    data: {
      token: gerarToken(),
      title: titulo,
      clientId: d.clientId,
      fileName: /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`,
      pdf: Buffer.from(d.bytes),
      sha256: sha256(d.bytes),
      signerPhone: contratante.telefone,
      companySignerId: d.user.id,
      companySignerName: d.user.name,
      companySignedAt: new Date(),
      companySignerIp: (d.ip ?? '').slice(0, 64) || null,
      signers: {
        create: assinantes.map((a) => ({ role: a.papel, ordem: a.ordem, token: gerarToken(), name: a.nome, phone: a.telefone })),
      },
    },
    select: { id: true, signers: { select: { id: true, token: true, name: true } } },
  })
}

/* --------------------------------- enviar -------------------------------- */

/**
 * Manda o PDF e o link de cada um para o WhatsApp de cada assinante que ainda
 * não assinou (ou só para `assinanteId`). Só por clique de alguém da VEX.
 */
export async function enviarParaOsAssinantes(id: string, base: string, assinanteId?: string) {
  const c = await prisma.contractSignature.findUnique({ where: { id }, include: { signers: { orderBy: { ordem: 'asc' } } } })
  if (!c) throw new AssinaturaErro(404, 'Contrato não encontrado.')
  if (c.status !== 'AGUARDANDO') throw new AssinaturaErro(409, 'Este contrato já foi assinado ou cancelado.')
  const alvos = c.signers.filter((s) => s.status === 'AGUARDANDO' && (!assinanteId || s.id === assinanteId))
  if (alvos.length === 0) throw new AssinaturaErro(409, 'Não há assinante esperando por este envio.')

  const resultado: Array<{ nome: string; ok: boolean; erro?: string }> = []
  for (const s of alvos) {
    const link = linkDoContrato(base, s.token)
    const texto = s.role === 'CONTRATADA'
      ? `${primeiroNome(s.name)}, o contrato "${c.title}" está pronto para você assinar pela VEX Growth.\n\n` +
        `Abra o link, confira o contrato, informe o nome completo e o CPF e digite o código de 6 dígitos que vai chegar aqui neste WhatsApp.\n\n${link}`
      : `Olá, ${primeiroNome(s.name)}! Segue o contrato "${c.title}" da VEX Growth para você ler e assinar.\n\n` +
        `Para assinar: abra o link, confira o contrato, informe o nome completo e o CPF e digite o código de 6 dígitos que vai chegar aqui neste WhatsApp.\n\n${link}`
    const doc = await uazSendDocumentChecked(s.phone, { bytes: c.pdf, mime: 'application/pdf', fileName: c.fileName })
    if (!doc.ok) { resultado.push({ nome: s.name, ok: false, erro: `o PDF não saiu (${doc.erro ?? 'erro desconhecido'})` }); continue }
    const msg = await uazSendTextChecked(s.phone, texto)
    if (!msg.ok) { resultado.push({ nome: s.name, ok: false, erro: `o PDF saiu, mas o link não (${msg.erro ?? 'erro desconhecido'})` }); continue }
    await prisma.contractSigner.update({ where: { id: s.id }, data: { sentAt: new Date() } })
    resultado.push({ nome: s.name, ok: true })
  }
  if (!c.sentAt && resultado.some((r) => r.ok)) await prisma.contractSignature.update({ where: { id }, data: { sentAt: new Date() } })
  return resultado
}

/* ------------------------------ página pública ---------------------------- */

export interface ContratoNaPagina {
  titulo: string
  status: string
  arquivo: string
  sha256: string
  preparadoPor: { quem: string; em: string }
  eu: { papel: Papel; nome: string; destino: string; status: string; assinado: { nome: string; cpf: string; em: string } | null; codigoPendente: boolean }
  outros: Array<{ papel: Papel; nome: string; status: string; em: string | null }>
}

const tokenValido = (t: string) => /^[A-Za-z0-9_-]{20,64}$/.test(t)

/**
 * Robôs de prévia de link (o WhatsApp abre o link para montar a prévia no
 * instante do envio): não contam como "abriu".
 */
const ROBO_DE_PREVIA = /WhatsApp|facebookexternalhit|Facebot|TelegramBot|Twitterbot|Slackbot|Discordbot|LinkedInBot|SkypeUriPreview|Googlebot|bingbot|bot\b|crawler|spider|preview/i

/** O que a página pública mostra para quem abriu o link. Nunca o CPF inteiro nem o código. */
export async function contratoPeloToken(token: string, aparelho?: string | null): Promise<ContratoNaPagina | null> {
  if (!tokenValido(token)) return null
  const s = await prisma.contractSigner.findUnique({
    where: { token },
    include: {
      contract: {
        select: {
          title: true, status: true, fileName: true, sha256: true, companySignerName: true, companySignedAt: true,
          signers: { select: { id: true, role: true, name: true, status: true, signedAt: true }, orderBy: { ordem: 'asc' } },
        },
      },
    },
  })
  if (s) {
    const pessoa = !!aparelho && !ROBO_DE_PREVIA.test(aparelho)
    if (pessoa && !s.openedAt && s.status === 'AGUARDANDO') await prisma.contractSigner.update({ where: { id: s.id }, data: { openedAt: new Date() } })
    const c = s.contract
    return {
      titulo: c.title,
      status: c.status,
      arquivo: c.fileName,
      sha256: c.sha256,
      preparadoPor: { quem: c.companySignerName, em: c.companySignedAt.toISOString() },
      eu: {
        papel: s.role as Papel,
        nome: s.name,
        destino: mascararTelefone(s.phone),
        status: s.status,
        assinado: s.signedAt ? { nome: s.signerName ?? s.name, cpf: s.signerCpfMasked ?? '', em: s.signedAt.toISOString() } : null,
        codigoPendente: !!s.codeHash && !!s.codeExpiresAt && s.codeExpiresAt > new Date(),
      },
      outros: c.signers.filter((o) => o.id !== s.id).map((o) => ({ papel: o.role as Papel, nome: o.name, status: o.status, em: o.signedAt?.toISOString() ?? null })),
    }
  }

  // Contrato antigo, de um assinante só
  const c = await prisma.contractSignature.findUnique({ where: { token } })
  if (!c) return null
  return {
    titulo: c.title,
    status: c.status,
    arquivo: c.fileName,
    sha256: c.sha256,
    preparadoPor: { quem: c.companySignerName, em: c.companySignedAt.toISOString() },
    eu: {
      papel: 'CONTRATANTE',
      nome: c.signerName ?? 'Contratante',
      destino: mascararTelefone(c.signerPhone),
      status: c.status === 'ASSINADO' ? 'ASSINADO' : 'AGUARDANDO',
      assinado: c.signedAt ? { nome: c.signerName ?? '', cpf: c.signerCpfMasked ?? '', em: c.signedAt.toISOString() } : null,
      codigoPendente: false,
    },
    outros: [{ papel: 'CONTRATADA', nome: c.companySignerName, status: 'ASSINADO', em: c.companySignedAt.toISOString() }],
  }
}

/** O assinante do link, com o contrato. Contrato antigo (só pelo link do contrato) não aceita mais assinatura. */
async function assinanteAberto(token: string) {
  if (!tokenValido(token)) throw new AssinaturaErro(404, 'Este contrato não existe.')
  const s = await prisma.contractSigner.findUnique({ where: { token }, include: { contract: { select: { id: true, title: true, status: true } } } })
  if (!s) {
    const antigo = await prisma.contractSignature.findUnique({ where: { token }, select: { status: true } })
    if (antigo?.status === 'ASSINADO') throw new AssinaturaErro(409, 'Este contrato já foi assinado.')
    throw new AssinaturaErro(404, 'Este contrato não existe.')
  }
  if (s.contract.status === 'CANCELADO') throw new AssinaturaErro(409, 'Este contrato foi cancelado. Fale com a VEX.')
  return s
}

/* ---------------------------------- código --------------------------------- */

/** Grava nome e CPF (cifrado) e manda o código pelo WhatsApp de quem assina. Trocar o nome pede código novo. */
export async function pedirCodigo(token: string, d: { nome: string; cpf: string }) {
  const s = await assinanteAberto(token)
  if (s.status === 'ASSINADO') throw new AssinaturaErro(409, 'Você já assinou este contrato.')
  const nome = d.nome.replace(/\s+/g, ' ').trim()
  if (!nomeCompletoValido(nome)) throw new AssinaturaErro(400, 'Escreva o nome completo, como no documento.')
  if (!cpfValido(d.cpf)) throw new AssinaturaErro(400, 'Confira o CPF: os números não batem.')
  const cpf = onlyDigits(d.cpf)

  const freio = freioDosCodigos(s.codeRequests)
  if (!freio.ok) throw new AssinaturaErro(429, `Você já pediu vários códigos nesta hora. Tente de novo em ${freio.esperarMin} minutos.`)

  const codigo = gerarCodigo()
  // Guarda antes de mandar: o código tem que valer quando chegar.
  await prisma.contractSigner.update({
    where: { id: s.id },
    data: {
      signerName: nome,
      signerCpf: encryptSecret(cpf),
      signerCpfMasked: mascararCpf(cpf),
      codeHash: hmacDoCodigo(segredo(), s.id, codigo),
      codeSentAt: new Date(),
      codeExpiresAt: new Date(Date.now() + VALIDADE_DO_CODIGO_MIN * 60_000),
      codeAttempts: 0,
      codeRequests: freio.marcas,
    },
  })
  const r = await uazSendTextChecked(s.phone, textoDoCodigo(codigo, s.contract.title))
  if (!r.ok) {
    await prisma.contractSigner.update({ where: { id: s.id }, data: { codeHash: null } })
    throw new AssinaturaErro(502, 'Não conseguimos mandar o código pelo WhatsApp agora. Tente de novo em instantes.')
  }
  return { destino: mascararTelefone(s.phone) }
}

/* --------------------------------- assinar -------------------------------- */

/**
 * Confere o código e assina por esta pessoa. Uma vez só. Código errado conta
 * tentativa; na quinta, só com código novo. Quando o último assina, sai o PDF
 * final com o relatório de todos.
 */
export async function assinar(token: string, r: { codigo: string; desenho?: Uint8Array | null; ip: string | null; aparelho: string | null; base: string }) {
  const s = await assinanteAberto(token)
  if (s.status === 'ASSINADO') return { jaAssinado: true, completo: s.contract.status === 'ASSINADO' }
  if (!s.codeHash || !s.signerCpf || !s.signerName || !s.codeSentAt) throw new AssinaturaErro(400, 'Peça o código primeiro.')
  if (!s.codeExpiresAt || s.codeExpiresAt <= new Date()) throw new AssinaturaErro(400, 'O código venceu. Peça um novo.')
  if (s.codeAttempts >= TENTATIVAS_MAX) throw new AssinaturaErro(400, `Você errou o código ${TENTATIVAS_MAX} vezes. Peça um novo.`)

  if (!codigoConfere(segredo(), s.id, r.codigo, s.codeHash)) {
    const t = await prisma.contractSigner.update({ where: { id: s.id }, data: { codeAttempts: { increment: 1 } }, select: { codeAttempts: true } })
    const restam = TENTATIVAS_MAX - t.codeAttempts
    throw new AssinaturaErro(400, restam > 0 ? `Código errado. ${restam === 1 ? 'Resta 1 tentativa' : `Restam ${restam} tentativas`}.` : 'Código errado. Peça um novo.')
  }

  const desenho = r.desenho?.length ? r.desenho : null
  if (desenho && !pareceUmPng(desenho)) throw new AssinaturaErro(400, 'A rubrica desenhada não abriu. Desenhe de novo ou siga sem ela.')

  // A trava é o WHERE: o mesmo código, no mesmo assinante aberto, assina uma vez.
  const travou = await prisma.contractSigner.updateMany({
    where: { id: s.id, status: 'AGUARDANDO', codeHash: s.codeHash },
    data: {
      status: 'ASSINADO', signedAt: new Date(), codeHash: null,
      signerIp: (r.ip ?? '').slice(0, 64) || null, signerDevice: (r.aparelho ?? '').slice(0, 400) || null,
      drawing: desenho ? Buffer.from(desenho) : null,
    },
  })
  if (travou.count === 0) return { jaAssinado: true, completo: false }

  const completo = await fecharSeTodosAssinaram(s.contractId, r.base)
  return { jaAssinado: false, completo }
}

/**
 * Quando ninguém falta, o contrato vira ASSINADO (uma vez só: a trava é o
 * WHERE) e sai o PDF final, que vai para o WhatsApp de cada assinante.
 */
async function fecharSeTodosAssinaram(contractId: string, base: string): Promise<boolean> {
  const fechou = await prisma.contractSignature.updateMany({
    where: { id: contractId, status: 'AGUARDANDO', signers: { none: { status: { not: 'ASSINADO' } } } },
    data: { status: 'ASSINADO', signedAt: new Date() },
  })
  if (fechou.count === 0) return false

  const c = (await prisma.contractSignature.findUnique({ where: { id: contractId }, include: { signers: { orderBy: { ordem: 'asc' } } } }))!
  const final = await anexarRelatorioDeAssinatura(c.pdf, {
    titulo: c.title,
    sha256Original: c.sha256,
    empresa: EMPRESA,
    preparadoPor: { quem: c.companySignerName, em: c.companySignedAt },
    assinantes: c.signers.map((s) => ({
      papel: ROTULO_DO_PAPEL[s.role as Papel] ?? s.role,
      nome: s.signerName ?? s.name,
      cpf: formatarCpf(decryptSecret(s.signerCpf) ?? ''),
      destino: mascararTelefone(s.phone),
      enviadoEm: s.codeSentAt ?? s.signedAt!,
      confirmadoEm: s.signedAt!,
      ip: s.signerIp,
      aparelho: s.signerDevice,
      desenho: s.drawing,
    })),
    link: linkDoContrato(base, c.signers.find((s) => s.role === 'CONTRATANTE')?.token ?? c.token),
  })
  const bytes = Buffer.from(final)
  await prisma.contractSignature.update({ where: { id: c.id }, data: { signedPdf: bytes, signedSha256: sha256(bytes) } })

  // O PDF assinado vai para cada assinante. Não derruba a assinatura se não sair: todos também baixam pela página.
  for (const s of c.signers) {
    const envio = await uazSendDocumentChecked(s.phone, {
      bytes,
      mime: 'application/pdf',
      fileName: nomeDoAssinado(c.fileName),
      caption: `Contrato "${c.title}" assinado por todos. Este PDF tem o relatório de assinatura no final: guarde para a sua segurança.`,
    }).catch((e) => ({ ok: false, erro: e instanceof Error ? e.message : String(e) }))
    if (!envio.ok) console.warn(`[assinatura] o PDF assinado de ${c.id} não saiu para ${s.id}: ${envio.erro}`)
  }
  return true
}

/* ----------------------------------- PDF ---------------------------------- */

/** O PDF para baixar: o assinado quando existe, senão o original. Pelo id (admin) ou pelo link de um assinante. */
export async function pdfDoContrato(where: { id: string } | { token: string }, tipo: 'original' | 'assinado' | 'atual' = 'atual') {
  let id: string | null = null
  if ('id' in where) id = where.id
  else if (tokenValido(where.token)) {
    const s = await prisma.contractSigner.findUnique({ where: { token: where.token }, select: { contractId: true } })
    id = s?.contractId ?? (await prisma.contractSignature.findUnique({ where: { token: where.token }, select: { id: true } }))?.id ?? null
  }
  if (!id) return null
  const c = await prisma.contractSignature.findUnique({ where: { id }, select: { pdf: true, signedPdf: true, fileName: true } })
  if (!c) return null
  const usarAssinado = tipo === 'assinado' || (tipo === 'atual' && !!c.signedPdf)
  if (usarAssinado && !c.signedPdf) return null
  return { bytes: usarAssinado ? c.signedPdf! : c.pdf, fileName: usarAssinado ? nomeDoAssinado(c.fileName) : c.fileName }
}

export async function cancelarContrato(id: string) {
  const r = await prisma.contractSignature.updateMany({ where: { id, status: 'AGUARDANDO' }, data: { status: 'CANCELADO', codeHash: null } })
  if (r.count === 0) throw new AssinaturaErro(409, 'Só dá para cancelar contrato que ainda não foi assinado.')
  await prisma.contractSigner.updateMany({ where: { contractId: id }, data: { codeHash: null } })
}
