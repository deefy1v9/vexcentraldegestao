import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  casar, centavosBr, conciliadoAte, contraparteDe, diaUtilAnterior, impressoes, lerExtratoPdf, lerNubank, lerOfx,
  lerSantander, precisaLembrar, type ItemPdf,
} from '../../lib/conciliacao-core'

const it = (pagina: number, y: number, x: number, s: string): ItemPdf => ({ pagina, x, y, s })

test('valores em reais viram centavos com sinal; texto não é valor', () => {
  assert.equal(centavosBr('-1.800,00'), -180000)
  assert.equal(centavosBr('+ 3.150,00'), 315000)
  assert.equal(centavosBr('0,60'), 60)
  assert.equal(centavosBr('R$ 0,60'), 60)
  assert.equal(centavosBr('11112222'), null)
  assert.equal(centavosBr('27/10/2026'), null)
})

test('contraparte: CNPJ formatado, documento solto ou o nome normalizado', () => {
  assert.equal(contraparteDe('LOJA EXEMPLO LTDA - 11.222.333/0001-81 - BANCO'), '11222333000181')
  assert.equal(contraparteDe('Pix Recebido 44555666000177'), '44555666000177')
  assert.equal(contraparteDe('Pix Recebido 12345678909'), '12345678909')
  assert.equal(contraparteDe('Pix Enviado Ciclana Souza Dos Sant'), 'CICLANA SOUZA DOS SANT')
  assert.equal(contraparteDe('Transferência enviada pelo Pix Fulano de Tal - •••.438.288-•• - NU'), 'FULANO DE TAL')
})

test('Santander: histórico quebrado em duas linhas, documento, valor e saldo', () => {
  const itens = [
    it(1, 783, 358, 'Aplicativo Santander Empresas'),
    it(1, 736, 34, 'VEX GROWTH LTDA'), it(1, 736, 484, 'Conta:'), it(1, 736, 516, '99990000'),
    it(1, 678, 415, 'Saldo dispon'), it(1, 678, 472, 'í'), it(1, 678, 475, 'vel para uso:'), it(1, 678, 534, 'R$ 0,60'),
    it(1, 662, 49, 'Data'), it(1, 662, 95, 'Hist'), it(1, 662, 112, 'ó'), it(1, 662, 117, 'rico'), it(1, 662, 306, 'Documento'),
    it(1, 601, 33, '27/10/2026'), it(1, 601, 92, 'Pix Enviado Fulano de Tal'), it(1, 601, 433, '-765,00'), it(1, 601, 545, '0,59'),
    it(1, 575, 92, 'Pix Enviado BELTRANO DA SILVA SAN'),
    it(1, 569, 33, '27/10/2026'), it(1, 569, 306, '11112222'), it(1, 569, 425, '-1.800,00'), it(1, 569, 534, '765,59'),
    it(1, 562, 92, 'TOS'),
    it(1, 537, 33, '27/10/2026'), it(1, 537, 92, 'Pix Recebido 12345678909'), it(1, 537, 436, '900,00'), it(1, 537, 525, '2.565,59'),
    it(2, 300, 33, '13/10/2026'), it(2, 300, 92, 'Abertura'), it(2, 300, 440, '0,00'), it(2, 300, 540, '0,00'),
  ]
  const e = lerSantander(itens)
  assert.equal(e.conta, 'Santander 99990000')
  assert.equal(e.saldoFinalCents, 60)
  assert.equal(e.linhas.length, 3) // "Abertura" de R$ 0,00 fica de fora
  const davi = e.linhas.find((l) => l.valorCents === -180000)!
  assert.equal(davi.descricao, 'Pix Enviado BELTRANO DA SILVA SAN TOS')
  assert.equal(davi.documento, '11112222')
  assert.equal(davi.saldoCents, 76559)
  assert.equal(e.linhas.find((l) => l.valorCents === 90000)?.contraparte, '12345678909')
  assert.equal(e.linhas.find((l) => l.valorCents === -76500)?.descricao, 'Pix Enviado Fulano de Tal') // sem o cabeçalho
  assert.equal(lerExtratoPdf(itens).banco, 'Santander')
})

test('Nubank: sinal pelo bloco do dia, nome continuando na linha de baixo e na página seguinte', () => {
  const itens = [
    it(1, 775, 452, 'VEX GROWTH LTDA'), it(1, 762, 322, 'CNPJ'), it(1, 762, 352, '68.652.648/0001-86'), it(1, 762, 509, 'Conta'), it(1, 750, 484, '1234567-8'),
    it(1, 699, 469, 'VALORES EM R$'),
    it(1, 590, 317, 'Saldo final do período'), it(1, 590, 516, '0,00'),
    it(1, 561, 57, 'Movimentações'),
    it(1, 539, 58, '01 SET 2026'), it(1, 539, 120, 'Total de entradas'), it(1, 539, 497, '+ 560,00'),
    it(1, 518, 120, 'Transferência recebida pelo Pix'), it(1, 518, 262, 'CLIENTE TESTE LTDA - 22.333.444/0001-55 -'), it(1, 518, 505, '560,00'),
    it(1, 498, 262, 'BANCO EXEMPLO IP (0001) Agência: 1 Conta:'),
    it(1, 444, 120, 'Saldo do dia'), it(1, 444, 503, '560,00'),
    it(1, 317, 120, 'Total de saídas'), it(1, 317, 500, '- 607,60'),
    it(1, 296, 120, 'Transferência enviada pelo Pix'), it(1, 296, 262, 'FORNECEDOR NUVEM SERVICOS E'), it(1, 296, 506, '607,60'),
    it(1, 111, 57, 'Tem alguma dúvida? Mande uma mensagem'),
    it(2, 674, 262, 'DADOS LTDA. - 33.444.555/0001-66'),
    it(2, 620, 120, 'Saldo do dia'), it(2, 620, 506, '0,00'),
  ]
  const e = lerNubank(itens)
  assert.equal(e.conta, 'Nubank 1234567-8')
  assert.equal(e.linhas.length, 2)
  assert.deepEqual(e.linhas.map((l) => [l.data, l.valorCents]), [['2026-09-01', 56000], ['2026-09-01', -60760]])
  assert.equal(e.linhas[0].contraparte, '22333444000155')
  assert.equal(e.linhas[1].contraparte, '33444555000166') // CNPJ veio da página 2
  assert.equal(e.saldoFinalCents, 0)
})

test('OFX: lançamentos, saldo e conta', () => {
  const ofx = `<OFX><BANKACCTFROM><BANKID>033<ACCTID>99990000</BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261027120000[-3:BRT]<TRNAMT>900.00<FITID>abc<MEMO>Pix Recebido 12345678909</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261027<TRNAMT>-765.00<FITID>def<NAME>Fulano de Tal</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>0.60</LEDGERBAL></OFX>`
  const e = lerOfx(ofx)
  assert.equal(e.linhas.length, 2)
  assert.equal(e.linhas[0].valorCents, 90000)
  assert.equal(e.linhas[1].valorCents, -76500)
  assert.equal(e.saldoFinalCents, 60)
  assert.ok(e.conta.endsWith('99990000'))
})

test('impressão digital: mesma linha repetida no dia ganha contador, reimportar não duplica', () => {
  const l = { data: '2026-10-13', descricao: 'Pix Recebido X', documento: null, valorCents: 100, saldoCents: null, contraparte: null }
  const a = impressoes('Santander 1', [l, l])
  assert.notEqual(a[0], a[1])
  assert.deepEqual(impressoes('Santander 1', [l, l]), a)
})

test('casar: exato, uma linha para vários movimentos, várias linhas para um, e centavos', () => {
  const linhas = [
    { id: 'a', data: '2026-10-15', valorCents: 600000 },
    { id: 'b1', data: '2026-10-15', valorCents: 250000 },
    { id: 'b2', data: '2026-10-15', valorCents: 25684 },
    { id: 'socio1', data: '2026-10-16', valorCents: -294200 },
    { id: 'socio2', data: '2026-10-15', valorCents: -138000 },
    { id: 'sobra', data: '2026-10-16', valorCents: 35000 },
  ]
  const movs = [
    { id: 'm-a', dia: '2026-10-16', kind: 'ENTRADA', amountCents: 600000 },
    { id: 'm-b', dia: '2026-10-16', kind: 'ENTRADA', amountCents: 275684 },
    { id: 'm-s1a', dia: '2026-10-16', kind: 'RETIRADA', amountCents: 39250 },
    { id: 'm-s1b', dia: '2026-10-20', kind: 'RETIRADA', amountCents: 255000 },
    { id: 'm-s2', dia: '2026-10-16', kind: 'RETIRADA', amountCents: 137825 },
    { id: 'm-longe', dia: '2026-10-08', kind: 'ENTRADA', amountCents: 35000 },
  ]
  const r = casar(linhas, movs)
  const de = (id: string) => r.find((c) => c.linhas.includes(id))
  assert.deepEqual(de('a')?.movimentos, ['m-a'])
  assert.deepEqual(de('b1')?.linhas.sort(), ['b1', 'b2'])
  assert.deepEqual(de('socio1')?.movimentos.sort(), ['m-s1a', 'm-s1b'])
  assert.equal(de('socio1')?.diferencaCents, 50) // banco −2.942,00 × Central −2.942,50 (duas retiradas)
  assert.equal(de('socio2')?.diferencaCents, -175)
  assert.equal(de('sobra'), undefined) // fora da janela de 5 dias
})

test('casar: saque do Asaas = recebimento menos a taxa', () => {
  const r = casar(
    [{ id: 'asaas', data: '2026-10-01', valorCents: 49000 }],
    [{ id: 'm-rec', dia: '2026-10-02', kind: 'ENTRADA', amountCents: 49700 }, { id: 'm-taxa', dia: '2026-10-02', kind: 'SAIDA', amountCents: 700 }],
  )
  assert.deepEqual(r[0]?.movimentos.sort(), ['m-rec', 'm-taxa'])
  assert.equal(r[0]?.diferencaCents, 0)
})

test('conciliado até: para no dia antes da primeira pendência', () => {
  const ls = [{ data: '2026-10-15', status: 'CONCILIADO' }, { data: '2026-10-20', status: 'PENDENTE' }, { data: '2026-10-27', status: 'CONCILIADO' }]
  assert.equal(conciliadoAte(ls, '2026-10-30'), '2026-10-19')
  assert.equal(conciliadoAte(ls.map((l) => ({ ...l, status: 'CONCILIADO' })), '2026-10-30'), '2026-10-30')
  assert.equal(conciliadoAte([], null), null)
})

test('lembrete: só em dia útil e só quando o dia útil anterior não está conciliado', () => {
  assert.equal(diaUtilAnterior('2026-11-02'), '2026-10-30') // segunda olha a sexta
  assert.equal(precisaLembrar('2026-11-02', '2026-10-30'), false)
  assert.equal(precisaLembrar('2026-11-02', '2026-10-27'), true)
  assert.equal(precisaLembrar('2026-10-31', null), false) // sábado
  assert.equal(precisaLembrar('2026-11-03', null), true)
})
