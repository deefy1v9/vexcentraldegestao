/**
 * As páginas do relatório de assinatura, anexadas ao fim do PDF original (as
 * páginas de antes não mudam de conteúdo). O resumo SHA-256 impresso é o do
 * arquivo original, como cada assinante recebeu pelo WhatsApp e leu no link:
 * quem tem esse arquivo confere o resumo; mudar uma vírgula muda o resumo.
 *
 * pdf-lib é JS puro (sem arquivos de fonte em disco), então não precisa do
 * estágio docdeps do Dockerfile como o pdfkit.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { aparelhoDe, quando } from './assinatura-core'

export interface AssinanteNoRelatorio {
  /** "Contratada · VEX Growth" ou "Contratante". */
  papel: string
  nome: string
  cpf: string
  destino: string
  enviadoEm: Date
  confirmadoEm: Date
  ip: string | null
  aparelho: string | null
  desenho?: Uint8Array | null
}

export interface RelatorioDeAssinatura {
  titulo: string
  sha256Original: string
  empresa: { nome: string; cnpj: string }
  preparadoPor: { quem: string; em: Date }
  assinantes: AssinanteNoRelatorio[]
  link?: string | null
}

const TINTA = rgb(0.11, 0.11, 0.125)
const APAGADO = rgb(0.42, 0.42, 0.46)
const FIO = rgb(0.88, 0.88, 0.9)
const FUNDO = rgb(0.965, 0.965, 0.972)
// O azul-marinho da marca (#030A8C), o mesmo da seleção na Central
const MARCA = rgb(0.012, 0.039, 0.549)

const A4: [number, number] = [595.28, 841.89]
const MARGEM = 48
const LARGURA = A4[0] - MARGEM * 2

/** Tira o que a fonte padrão (WinAnsi) não desenha, em vez de quebrar o PDF. */
function seguro(fonte: PDFFont, texto: string): string {
  let r = ''
  for (const c of texto.replace(/[   ]/g, ' ').replace(/[\r\t]/g, ' ')) {
    try { fonte.encodeText(c); r += c } catch { /* fora do WinAnsi: some */ }
  }
  return r
}

function linhas(fonte: PDFFont, texto: string, tamanho: number, largura: number): string[] {
  const saida: string[] = []
  let atual = ''
  for (const palavra of seguro(fonte, texto).split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) { atual = tentativa; continue }
    if (atual) saida.push(atual)
    atual = palavra
  }
  saida.push(atual)
  return saida
}

export async function anexarRelatorioDeAssinatura(original: Uint8Array, r: RelatorioDeAssinatura): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original)
  doc.setModificationDate(new Date())
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)
  const direita = MARGEM + LARGURA
  let pagina: PDFPage = doc.addPage(A4)
  let y = A4[1] - MARGEM

  const rodape = () => pagina.drawText(seguro(normal, `Relatório de assinatura · ${r.titulo}`), { x: MARGEM, y: MARGEM - 14, size: 7.5, font: normal, color: APAGADO })
  /** Abre outra página quando o que vem não cabe nesta. */
  const garantir = (altura: number) => {
    if (y - altura >= MARGEM + 10) return
    rodape()
    pagina = doc.addPage(A4)
    y = A4[1] - MARGEM
  }
  const texto = (t: string, x: number, yy: number, o: { tamanho?: number; fonte?: PDFFont; cor?: ReturnType<typeof rgb> } = {}) => {
    const fonte = o.fonte ?? normal
    pagina.drawText(seguro(fonte, t), { x, y: yy, size: o.tamanho ?? 10, font: fonte, color: o.cor ?? TINTA })
  }

  texto('ASSINATURA ELETRÔNICA', MARGEM, y - 10, { tamanho: 9, fonte: negrito, cor: MARCA })
  texto('Relatório de assinatura', MARGEM, y - 32, { tamanho: 20, fonte: negrito })
  const titulo = linhas(normal, r.titulo, 10, LARGURA)
  titulo.forEach((l, i) => texto(l, MARGEM, y - 50 - i * 13, { tamanho: 10, cor: APAGADO }))
  y -= 62 + titulo.length * 13
  pagina.drawLine({ start: { x: MARGEM, y }, end: { x: direita, y }, thickness: 0.8, color: FIO })
  y -= 22

  const secao = (titulo: string, itens: [string, string][]) => {
    const alturas = itens.map(([, v]) => linhas(normal, v, 10, LARGURA - 130).length * 13 + 5)
    garantir(16 + alturas.reduce((a, b) => a + b, 0))
    texto(titulo.toUpperCase(), MARGEM, y, { tamanho: 8, fonte: negrito, cor: APAGADO })
    y -= 16
    for (const [rotulo, valor] of itens) {
      texto(rotulo, MARGEM, y, { tamanho: 9.5, cor: APAGADO })
      const partes = linhas(normal, valor, 10, LARGURA - 130)
      partes.forEach((p, i) => texto(p, MARGEM + 130, y - i * 13, { tamanho: 10 }))
      y -= partes.length * 13 + 5
    }
    y -= 10
  }

  secao('Documento', [
    ['Empresa', `${r.empresa.nome} · CNPJ ${r.empresa.cnpj}`],
    ['Preparado por', `${r.preparadoPor.quem}, em ${quando(r.preparadoPor.em)}`],
    ['Assinantes', String(r.assinantes.length)],
  ])

  for (const a of r.assinantes) {
    secao(`Assinatura · ${a.papel}`, [
      ['Nome', a.nome],
      ['CPF', a.cpf],
      ['Código de uso único', `Enviado por WhatsApp para ${a.destino}`],
      ['Código enviado em', quando(a.enviadoEm)],
      ['Assinado em', quando(a.confirmadoEm)],
      ['Endereço IP', a.ip || 'Não informado'],
      ['Aparelho', aparelhoDe(a.aparelho)],
    ])
    if (a.desenho?.length) {
      try {
        const img = await doc.embedPng(a.desenho)
        const escala = Math.min(220 / img.width, 70 / img.height, 1)
        const w = img.width * escala
        const h = img.height * escala
        garantir(h + 40)
        texto('Rubrica', MARGEM, y, { tamanho: 9.5, cor: APAGADO })
        pagina.drawImage(img, { x: MARGEM + 130, y: y - h + 8, width: w, height: h })
        y -= h + 2
        pagina.drawLine({ start: { x: MARGEM + 130, y }, end: { x: MARGEM + 350, y }, thickness: 0.6, color: APAGADO })
        y -= 22
      } catch {
        // Desenho que não abre: o relatório sai sem ele, e as outras provas valem.
      }
    }
  }

  garantir(140)
  texto('INTEGRIDADE DO DOCUMENTO', MARGEM, y, { tamanho: 8, fonte: negrito, cor: APAGADO })
  y -= 16
  texto('Resumo SHA-256 do PDF original, como foi enviado e lido pelos assinantes:', MARGEM, y, { tamanho: 9.5, cor: APAGADO })
  y -= 26
  pagina.drawRectangle({ x: MARGEM, y: y - 22, width: LARGURA, height: 38, color: FUNDO })
  texto(r.sha256Original.slice(0, 32), MARGEM + 12, y, { tamanho: 10.5, fonte: mono })
  texto(r.sha256Original.slice(32), MARGEM + 12, y - 15, { tamanho: 10.5, fonte: mono })
  y -= 46

  const legal =
    'Documento assinado eletronicamente com assinatura eletrônica simples, que as partes admitem como válida para comprovar a autoria e a integridade ' +
    '(Medida Provisória 2.200-2/2001, art. 10, § 2º, e Lei 14.063/2020). A autoria de cada assinante foi confirmada pelo nome, pelo CPF e pelo código de uso ' +
    'único enviado ao WhatsApp dele; a integridade pode ser conferida pelo resumo SHA-256 do PDF original.' +
    (r.link ? ` Conferência: ${r.link}` : '')
  const legais = linhas(normal, legal, 8.5, LARGURA)
  garantir(legais.length * 11.5)
  for (const l of legais) {
    texto(l, MARGEM, y, { tamanho: 8.5, cor: APAGADO })
    y -= 11.5
  }

  rodape()
  return doc.save()
}
