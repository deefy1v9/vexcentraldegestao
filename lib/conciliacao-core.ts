/**
 * Conciliação bancária: ler o extrato (PDF do Santander ou do Nubank, ou OFX)
 * e casar cada linha com o caixa da Central. Só regras puras — a leitura do
 * PDF em itens posicionados fica em lib/conciliacao-pdf.ts e o banco em
 * app/api/financeiro/conciliacao. Testado em scripts/tests/conciliacao-core.test.ts.
 *
 * Valores em CENTAVOS (o do banco vem com sinal: entrada positiva, saída
 * negativa) e datas como dia civil AAAA-MM-DD.
 */

/** Pedaço de texto do PDF com a posição na página (y cresce para cima). */
export interface ItemPdf {
  pagina: number
  x: number
  y: number
  s: string
}

export interface LinhaExtrato {
  data: string
  descricao: string
  documento: string | null
  valorCents: number
  /** Saldo depois da linha, quando o banco informa. */
  saldoCents: number | null
  /** CPF/CNPJ (só dígitos) ou o nome normalizado de quem pagou ou recebeu. */
  contraparte: string | null
}

export interface ExtratoLido {
  banco: 'Santander' | 'Nubank' | 'OFX'
  /** Rótulo da conta, como aparece na Central ("Santander 12345678"). */
  conta: string
  /** Saldo final informado pelo banco (inclui aplicação automática). */
  saldoFinalCents: number | null
  linhas: LinhaExtrato[]
}

/* ------------------------------- números ------------------------------- */

const DINHEIRO = /^[+-]?\s?\d{1,3}(\.\d{3})*,\d{2}$/

/** "-1.800,00", "+ 3.150,00", "0,60" → centavos. null quando não é valor. */
export function centavosBr(s: string): number | null {
  const t = s.replace(/R\$/g, '').trim()
  if (!DINHEIRO.test(t)) return null
  const neg = t.startsWith('-')
  const n = Number(t.replace(/[+\-\s.]/g, '').replace(',', '.'))
  return Math.round(n * 100) * (neg ? -1 : 1)
}

const MESES: Record<string, string> = { JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06', JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12' }

function dataBr(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function dataNubank(s: string): string | null {
  const m = s.trim().match(/^(\d{2}) ([A-Z]{3}) (\d{4})$/)
  return m && MESES[m[2]] ? `${m[3]}-${MESES[m[2]]}-${m[1]}` : null
}

/**
 * Quem está do outro lado: CPF/CNPJ completo quando aparece, senão o nome
 * (sem acento, maiúsculo, sem o "Pix Enviado/Recebido"). É a chave que a
 * Central usa para lembrar o que fazer com aquela pessoa da próxima vez.
 */
export function contraparteDe(descricao: string): string | null {
  // O Nubank às vezes quebra o CNPJ na barra ("54.371.827 /0001-30")
  const cnpj = descricao.match(/\d{2}\.\d{3}\.\d{3}\s?\/\s?\d{4}-\d{2}/)
  if (cnpj) return cnpj[0].replace(/\D/g, '')
  const doc = descricao.match(/(?:^|\s)(\d{11}|\d{14})(?:\s|$)/)
  if (doc) return doc[1]
  const nome = descricao
    .replace(/^(pix (enviado|recebido)|transfer[eê]ncia (enviada|recebida)( pelo pix)?|reembolso recebido pelo pix|pagamento (de boleto efetuado|recebido))\s*/i, '')
    .split(' - ')[0]
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
  return nome ? nome.slice(0, 40) : null
}

/* ------------------------------- leitura ------------------------------- */

/** Agrupa os itens em linhas visuais (mesma página, y parecido), de cima para baixo. */
function emLinhas(itens: ItemPdf[], tolerancia = 2): Array<{ pagina: number; y: number; itens: ItemPdf[] }> {
  const linhas: Array<{ pagina: number; y: number; itens: ItemPdf[] }> = []
  for (const it of itens.filter((i) => i.s.trim())) {
    const l = linhas.find((x) => x.pagina === it.pagina && Math.abs(x.y - it.y) <= tolerancia)
    if (l) l.itens.push(it)
    else linhas.push({ pagina: it.pagina, y: it.y, itens: [it] })
  }
  for (const l of linhas) l.itens.sort((a, b) => a.x - b.x)
  return linhas.sort((a, b) => a.pagina - b.pagina || b.y - a.y)
}

const juntar = (its: ItemPdf[]) => its.map((i) => i.s.trim()).join(' ').replace(/\s+/g, ' ').trim()

/**
 * Santander Empresas (PDF do app). Cada lançamento tem a data na margem
 * esquerda; o histórico pode quebrar em linhas acima e abaixo da data, então
 * o lançamento vai do meio do caminho até a data anterior até o meio do
 * caminho até a próxima. Valor e saldo são os dois números à direita.
 */
export function lerSantander(itens: ItemPdf[]): ExtratoLido {
  const texto = juntar(itens)
  const conta = texto.match(/Conta:\s*(\d{6,})/)?.[1] ?? ''
  const saldoTopo = texto.match(/Saldo dispon\s*í?\s*vel para uso:\s*R\$\s*([\d.,-]+)/)
  const ancoras = itens
    .filter((i) => i.x < 70 && dataBr(i.s.trim()))
    .sort((a, b) => a.pagina - b.pagina || b.y - a.y)

  const linhas: LinhaExtrato[] = []
  ancoras.forEach((a, idx) => {
    const ant = ancoras[idx - 1]
    const prox = ancoras[idx + 1]
    // Primeira data da página: o histórico quebrado sobe no máximo uma linha;
    // acima disso é o cabeçalho da tabela ("Data Histórico Documento…")
    const topo = ant && ant.pagina === a.pagina ? (ant.y + a.y) / 2 : a.y + 14
    const base = prox && prox.pagina === a.pagina ? (prox.y + a.y) / 2 : a.y - 14
    const doLanc = itens.filter((i) => i.pagina === a.pagina && i.y < topo && i.y > base && i !== a && i.s.trim())
    const valores = doLanc.filter((i) => i.x > 380 && centavosBr(i.s) !== null).sort((x, y) => x.x - y.x)
    if (valores.length === 0) return
    const valorCents = centavosBr(valores[0].s)!
    if (valorCents === 0) return // "Abertura"
    const documento = doLanc.find((i) => i.x >= 280 && i.x < 380 && /^\d{4,}$/.test(i.s.trim()))?.s.trim() ?? null
    const desc = doLanc
      .filter((i) => i.x >= 80 && i.x < 280)
      .sort((x, y) => y.y - x.y || x.x - y.x)
    const descricao = juntar(desc)
    linhas.push({
      data: dataBr(a.s.trim())!,
      descricao,
      documento,
      valorCents,
      saldoCents: valores.length > 1 ? centavosBr(valores[valores.length - 1].s) : null,
      contraparte: contraparteDe(descricao),
    })
  })
  return {
    banco: 'Santander',
    conta: `Santander ${conta}`.trim(),
    saldoFinalCents: saldoTopo ? centavosBr(saldoTopo[1]) : null,
    linhas: linhas.sort((x, y) => x.data.localeCompare(y.data)),
  }
}

/**
 * Nubank PJ (PDF do app). O extrato vem por dia: "DD MMM AAAA", depois
 * blocos "Total de entradas" e "Total de saídas"; cada transação começa com
 * o tipo à esquerda e o valor à direita, e o nome do outro lado continua nas
 * linhas de baixo. O sinal vem do bloco, não do número.
 */
export function lerNubank(itens: ItemPdf[]): ExtratoLido {
  const texto = juntar(itens)
  const conta = texto.match(/Conta\s+([\d-]{6,})/)?.[1] ?? ''
  const nome = texto.match(/^\s*(.+?)\s+CNPJ/)?.[1]?.trim() ?? ''
  // O resumo do topo tem "Saldo final do período" duas vezes; vale a linha com o número ao lado
  const linhaSaldo = emLinhas(itens).find((l) => /Saldo final do per[ií]odo/.test(juntar(l.itens)) && l.itens.some((i) => i.x >= 450 && centavosBr(i.s) !== null))
  const saldoFinalCents = linhaSaldo ? centavosBr(linhaSaldo.itens.filter((i) => i.x >= 450).map((i) => i.s).join('')) : null

  const linhas: LinhaExtrato[] = []
  let dia: string | null = null
  let sinal = 1
  let atual: { tipo: string; partes: string[]; valor: number } | null = null
  const fecha = () => {
    if (atual && dia) {
      const descricao = `${atual.tipo} ${atual.partes.join(' ')}`.replace(/\s+/g, ' ').trim()
      linhas.push({ data: dia, descricao, documento: null, valorCents: sinal * Math.abs(atual.valor), saldoCents: null, contraparte: contraparteDe(atual.partes.join(' ')) })
    }
    atual = null
  }

  // Só o miolo de cada página: o cabeçalho (até "VALORES EM R$") e o rodapé
  // ("Tem alguma dúvida…") se repetem e não podem grudar no nome da transação
  const limites = new Map<number, { topo: number; base: number }>()
  for (const i of itens) {
    const lim = limites.get(i.pagina) ?? { topo: Infinity, base: -Infinity }
    if (/VALORES EM R\$/.test(i.s)) lim.topo = Math.min(lim.topo, i.y)
    if (/^Tem alguma d[uú]vida/.test(i.s.trim())) lim.base = Math.max(lim.base, i.y)
    limites.set(i.pagina, lim)
  }
  const miolo = itens.filter((i) => {
    const lim = limites.get(i.pagina)!
    return i.y < lim.topo && i.y > lim.base
  })

  for (const l of emLinhas(miolo)) {
    const esq = l.itens.filter((i) => i.x < 100)
    const tipo = l.itens.filter((i) => i.x >= 100 && i.x < 240)
    const meio = l.itens.filter((i) => i.x >= 240 && i.x < 450)
    const dir = l.itens.filter((i) => i.x >= 450)
    const d = esq.length ? dataNubank(juntar(esq)) : null
    const tipoTxt = juntar(tipo)
    if (d) { fecha(); dia = d }
    if (/^Total de entradas/i.test(tipoTxt)) { fecha(); sinal = 1; continue }
    if (/^Total de sa[ií]das/i.test(tipoTxt)) { fecha(); sinal = -1; continue }
    if (/^Saldo do dia/i.test(tipoTxt)) { fecha(); continue }
    const valor = dir.length ? centavosBr(juntar(dir)) : null
    if (tipoTxt && valor !== null) {
      fecha()
      atual = { tipo: tipoTxt, partes: meio.length ? [juntar(meio)] : [], valor }
      continue
    }
    // Continuação do nome (linha só com o miolo), inclusive na página seguinte
    if (atual && !tipoTxt && meio.length && !esq.length) atual.partes.push(juntar(meio))
    else if (esq.length && !d) fecha() // resumo do período ("Saldo final", "Movimentações")
  }
  fecha()

  // Conta de outro titular (a antiga, em nome de sócio) leva o nome junto, para não confundir
  const rotulo = nome && !/VEX GROWTH/i.test(nome) ? `Nubank ${conta} (${nome})` : `Nubank ${conta}`
  return { banco: 'Nubank', conta: rotulo, saldoFinalCents, linhas }
}

/** OFX (SGML ou XML): um lançamento por <STMTTRN>. */
export function lerOfx(texto: string): ExtratoLido {
  const tag = (bloco: string, nome: string) => bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? ''
  const conta = tag(texto, 'ACCTID')
  const banco = tag(texto, 'ORG') || tag(texto, 'BANKID')
  const linhas: LinhaExtrato[] = []
  for (const m of texto.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi)) {
    const b = m[1]
    const dt = tag(b, 'DTPOSTED')
    const valor = Number(tag(b, 'TRNAMT').replace(',', '.'))
    if (!/^\d{8}/.test(dt) || !Number.isFinite(valor) || valor === 0) continue
    const descricao = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' · ')
    linhas.push({
      data: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`,
      descricao,
      documento: tag(b, 'FITID') || tag(b, 'CHECKNUM') || null,
      valorCents: Math.round(valor * 100),
      saldoCents: null,
      contraparte: contraparteDe(descricao),
    })
  }
  const saldo = texto.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]+)/i)?.[1]
  return {
    banco: 'OFX',
    conta: `${banco || 'Banco'} ${conta}`.trim(),
    saldoFinalCents: saldo ? Math.round(Number(saldo.replace(',', '.')) * 100) : null,
    linhas: linhas.sort((x, y) => x.data.localeCompare(y.data)),
  }
}

/** Decide o leitor pelo conteúdo do PDF. */
export function lerExtratoPdf(itens: ItemPdf[]): ExtratoLido {
  const texto = juntar(itens.slice(0, 80))
  if (/Santander/i.test(texto)) return lerSantander(itens)
  if (/VALORES EM R\$|Movimenta[çc][õo]es|nubank/i.test(juntar(itens))) return lerNubank(itens)
  throw new Error('Não reconheci o banco deste PDF. Hoje a Central lê o extrato do Santander Empresas, do Nubank PJ e arquivos OFX.')
}

/**
 * Impressão digital de cada linha, para subir o mesmo extrato (ou um período
 * que se sobrepõe) sem duplicar. Duas linhas iguais no mesmo dia ganham um
 * contador, na ordem do extrato.
 */
export function impressoes(conta: string, linhas: LinhaExtrato[]): string[] {
  const vistos = new Map<string, number>()
  return linhas.map((l) => {
    const base = `${conta}|${l.data}|${l.valorCents}|${l.descricao.toUpperCase().replace(/\s+/g, ' ')}`
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)
    return `${base}|${n}`
  })
}

/* ------------------------------ conciliação ------------------------------ */

export interface LinhaParaCasar {
  id: string
  data: string
  valorCents: number
}

export interface MovimentoParaCasar {
  id: string
  dia: string
  kind: string
  amountCents: number
}

export interface Casamento {
  linhas: string[]
  movimentos: string[]
  /** Banco − Central, em centavos (0 quando bate exato). */
  diferencaCents: number
}

const ENTRA = new Set(['ENTRADA', 'APORTE'])

function diasEntre(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000))
}

/** Valor do movimento com o sinal que ele teria no extrato. */
const comSinal = (m: MovimentoParaCasar) => (ENTRA.has(m.kind) ? 1 : -1) * Math.abs(m.amountCents)

/** Combinações de até `max` elementos (a lista já vem curta: mesma janela e sinal). */
function combinacoes<T>(lista: T[], max: number): T[][] {
  const out: T[][] = []
  const rec = (ini: number, acc: T[]) => {
    if (acc.length >= 2) out.push(acc)
    if (acc.length === max) return
    for (let i = ini; i < lista.length; i++) rec(i + 1, [...acc, lista[i]])
  }
  rec(0, [])
  return out
}

/**
 * Casa as linhas do extrato com os movimentos do caixa, nesta ordem:
 * 1. um para um, valor exato, data mais próxima (até `janela` dias — 5 por
 *    padrão: a Central às vezes lança no dia da divisão, não no do Pix);
 * 2. uma linha = vários movimentos (ex.: um Pix ao sócio que a Central
 *    lançou como duas retiradas), soma exata;
 * 3. várias linhas = um movimento (ex.: dois Pix do mesmo cliente num lançamento);
 * 4. um para um com diferença de centavos (até `toleranciaCents`), marcada.
 * Cada linha e cada movimento entram em um casamento só.
 */
export function casar(
  linhas: LinhaParaCasar[],
  movimentos: MovimentoParaCasar[],
  opcoes: { janela?: number; toleranciaCents?: number } = {},
): Casamento[] {
  const janela = opcoes.janela ?? 5
  const tol = opcoes.toleranciaCents ?? 200
  const livresL = new Map(linhas.map((l) => [l.id, l]))
  const livresM = new Map(movimentos.map((m) => [m.id, m]))
  const out: Casamento[] = []
  const usar = (ls: LinhaParaCasar[], ms: MovimentoParaCasar[]) => {
    ls.forEach((l) => livresL.delete(l.id))
    ms.forEach((m) => livresM.delete(m.id))
    const banco = ls.reduce((s, l) => s + l.valorCents, 0)
    const central = ms.reduce((s, m) => s + comSinal(m), 0)
    out.push({ linhas: ls.map((l) => l.id), movimentos: ms.map((m) => m.id), diferencaCents: banco - central })
  }
  const ordem = (a: LinhaParaCasar, b: LinhaParaCasar) => a.data.localeCompare(b.data) || Math.abs(b.valorCents) - Math.abs(a.valorCents)

  // 1. exato um para um
  for (const l of [...livresL.values()].sort(ordem)) {
    const cands = [...livresM.values()]
      .filter((m) => comSinal(m) === l.valorCents && diasEntre(m.dia, l.data) <= janela)
      .sort((a, b) => diasEntre(a.dia, l.data) - diasEntre(b.dia, l.data))
    if (cands[0]) usar([l], [cands[0]])
  }

  // 2. uma linha = vários movimentos. Aceita sinal misturado quando a soma
  //    é exata: o saque do Asaas de R$ 490 é a entrada de R$ 497 menos a taxa de R$ 7
  for (const l of [...livresL.values()].sort(ordem)) {
    const perto = [...livresM.values()].filter((m) => diasEntre(m.dia, l.data) <= janela).slice(0, 12)
    const achou = combinacoes(perto, 4).find((c) => c.reduce((s, m) => s + comSinal(m), 0) === l.valorCents && c.some((m) => Math.sign(comSinal(m)) === Math.sign(l.valorCents)))
    if (achou) usar([l], achou)
  }

  // 3. várias linhas = um movimento
  for (const m of [...livresM.values()]) {
    const perto = [...livresL.values()].filter((l) => Math.sign(l.valorCents) === Math.sign(comSinal(m)) && diasEntre(m.dia, l.data) <= janela).slice(0, 12)
    const achou = combinacoes(perto, 4).find((c) => c.reduce((s, l) => s + l.valorCents, 0) === comSinal(m))
    if (achou) usar(achou, [m])
  }

  // 4. diferença de centavos: um para um, e uma linha = vários movimentos
  for (const l of [...livresL.values()].sort(ordem)) {
    const cands = [...livresM.values()]
      .filter((m) => Math.sign(comSinal(m)) === Math.sign(l.valorCents) && Math.abs(comSinal(m) - l.valorCents) <= tol && diasEntre(m.dia, l.data) <= janela)
      .sort((a, b) => Math.abs(comSinal(a) - l.valorCents) - Math.abs(comSinal(b) - l.valorCents) || diasEntre(a.dia, l.data) - diasEntre(b.dia, l.data))
    if (cands[0]) { usar([l], [cands[0]]); continue }
    const perto = [...livresM.values()].filter((m) => Math.sign(comSinal(m)) === Math.sign(l.valorCents) && diasEntre(m.dia, l.data) <= janela).slice(0, 12)
    const achou = combinacoes(perto, 4).find((c) => Math.abs(c.reduce((s, m) => s + comSinal(m), 0) - l.valorCents) <= tol)
    if (achou) usar([l], achou)
  }
  return out
}

/**
 * Até que dia a conta está conciliada: o último dia coberto por extrato em
 * que não sobra nenhuma linha pendente nele nem antes dele.
 */
export function conciliadoAte(linhas: Array<{ data: string; status: string }>, cobertoAte: string | null): string | null {
  if (!cobertoAte) return null
  const pendente = linhas.filter((l) => l.status === 'PENDENTE').map((l) => l.data).sort()[0]
  if (!pendente) return cobertoAte
  const d = new Date(`${pendente}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  const anterior = d.toISOString().slice(0, 10)
  return anterior < cobertoAte ? anterior : cobertoAte
}

/** Último dia útil antes de `hoje` (o extrato de ontem; segunda olha a sexta). */
export function diaUtilAnterior(hoje: string): string {
  const d = new Date(`${hoje}T12:00:00Z`)
  do d.setUTCDate(d.getUTCDate() - 1)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
  return d.toISOString().slice(0, 10)
}

/**
 * A rotina das 23h (todo dia) cobra o extrato quando a conta ainda não está
 * conciliada até hoje — às 23h o extrato do dia já está fechado no banco.
 */
export function precisaLembrar(hoje: string, ate: string | null): boolean {
  return !ate || ate < hoje
}
