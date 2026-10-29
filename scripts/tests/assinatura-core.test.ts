import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import {
  CODIGOS_POR_HORA, aparelhoDe, codigoConfere, formatarCpf, freioDosCodigos, gerarCodigo, gerarToken, hmacDoCodigo,
  mascararCpf, mascararTelefone, nomeCompletoValido, nomeDoAssinado, normalizarTelefone, pareceUmPdf, pareceUmPng, sha256,
} from '../../lib/assinatura-core'
import { anexarRelatorioDeAssinatura } from '../../lib/assinatura-pdf'

test('código: 6 dígitos, HMAC preso ao contrato e conferência em tempo constante', () => {
  for (let i = 0; i < 50; i++) assert.match(gerarCodigo(), /^\d{6}$/)
  const h = hmacDoCodigo('segredo', 'c1', '123456')
  assert.notEqual(h, '123456')
  assert.ok(codigoConfere('segredo', 'c1', '123456', h))
  assert.ok(codigoConfere('segredo', 'c1', '123-456', h), 'ignora o que não é dígito')
  assert.ok(!codigoConfere('segredo', 'c1', '123457', h))
  assert.ok(!codigoConfere('segredo', 'c2', '123456', h), 'o código de um contrato não vale em outro')
  assert.ok(!codigoConfere('outro', 'c1', '123456', h))
})

test('token do link: 32 caracteres base64url, sem repetir', () => {
  const a = gerarToken()
  assert.match(a, /^[A-Za-z0-9_-]{32}$/)
  assert.notEqual(a, gerarToken())
})

test('nome completo: pede nome e sobrenome', () => {
  assert.ok(nomeCompletoValido('Ana Paula Siqueira Peu'))
  assert.ok(nomeCompletoValido("  João  D'Ávila "))
  assert.ok(!nomeCompletoValido('Ana'))
  assert.ok(!nomeCompletoValido('Ana P'))
  assert.ok(!nomeCompletoValido('Ana 123'))
})

test('CPF e telefone: formato e máscara', () => {
  assert.equal(formatarCpf('52998224725'), '529.982.247-25')
  assert.equal(mascararCpf('529.982.247-25'), '***.982.247-**')
  assert.equal(normalizarTelefone('(11) 94009-8523'), '5511940098523')
  assert.equal(normalizarTelefone('5511940098523'), '5511940098523')
  assert.equal(normalizarTelefone('1234'), null)
  assert.equal(mascararTelefone('5511940098523'), '(11) •••••-8523')
})

test('freio: 5 códigos por hora, e libera quando a primeira marca passa da hora', () => {
  const agora = new Date('2026-10-29T15:00:00Z')
  const minutos = (m: number) => new Date(agora.getTime() - m * 60_000)
  const quatro = [minutos(50), minutos(40), minutos(30), minutos(10)]
  const ok = freioDosCodigos(quatro, agora)
  assert.ok(ok.ok)
  if (ok.ok) assert.equal(ok.marcas.length, CODIGOS_POR_HORA)
  const cheio = freioDosCodigos([...quatro, minutos(5)], agora)
  assert.deepEqual(cheio, { ok: false, esperarMin: 10 })
  const velho = freioDosCodigos([minutos(70), minutos(65), ...quatro], agora)
  assert.ok(velho.ok, 'marcas com mais de 1 hora não contam')
})

test('arquivos: PDF e PNG pela assinatura dos bytes, não pela extensão', () => {
  assert.ok(pareceUmPdf(Buffer.from('%PDF-1.7\n...')))
  assert.ok(!pareceUmPdf(Buffer.from('<html>oi</html>')))
  assert.ok(pareceUmPng(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])))
  assert.ok(!pareceUmPng(Buffer.from('GIF89a......')))
})

test('aparelho e nome do assinado', () => {
  assert.equal(aparelhoDe('Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/120 Mobile Safari/537.36'), 'Chrome no Android')
  assert.equal(aparelhoDe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17 Mobile Safari/604.1'), 'Safari no iPhone')
  assert.equal(aparelhoDe(null), 'Não informado')
  assert.equal(nomeDoAssinado('CONTRATO MOOP.pdf'), 'CONTRATO MOOP - assinado.pdf')
})

test('relatório: o PDF assinado tem as páginas do original e uma a mais', async () => {
  const doc = await PDFDocument.create()
  doc.addPage().drawText('Contrato de teste')
  doc.addPage().drawText('Página 2')
  const original = await doc.save()
  const final = await anexarRelatorioDeAssinatura(original, {
    titulo: 'Contrato MOOP · SEO Essencial 3 meses',
    sha256Original: sha256(original),
    contratada: { empresa: 'VEX GROWTH LTDA', cnpj: '68.652.648/0001-86', quem: 'Antonio Gomes', em: new Date(), ip: '200.1.2.3' },
    contratante: { nome: 'Ana Paula Siqueira Peu', cpf: '529.982.247-25' },
    verificacao: { destino: '(11) •••••-8523', enviadoEm: new Date(), confirmadoEm: new Date() },
    aceite: { em: new Date(), ip: '200.4.5.6', aparelho: 'Mozilla/5.0 (iPhone)' },
    link: 'https://central.vexgrowth.com.br/assinar/abc',
  })
  const lido = await PDFDocument.load(final)
  assert.equal(lido.getPageCount(), 3)
  const antes = await PDFDocument.load(original)
  assert.deepEqual(lido.getPages().slice(0, 2).map((p) => p.getSize()), antes.getPages().map((p) => p.getSize()))
})
