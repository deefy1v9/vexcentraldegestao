import test from 'node:test'
import assert from 'node:assert/strict'
import { nivelDoRisco, ordenarPorRisco, riscoDeChurn, type DadosDoCliente } from '../../lib/mcp/churn'

const AGORA = new Date('2026-10-23T15:00:00Z')
const dia = (s: string) => new Date(`${s}T12:00:00Z`)

const saudavel: DadosDoCliente = {
  id: 'c1', nome: 'Cliente Saudável', contractEnd: dia('2027-06-30'), servicosAtivos: 2,
  servicosEncerradosRecentes: [], parcelasAtrasadas: [], demandasAtrasadas: 0, ultimaEntrega: dia('2026-10-20'), rebaixado: false,
}

test('churn: cliente em dia, com entrega recente e contrato longe, é risco baixo e sem motivos', () => {
  const r = riscoDeChurn(saudavel, AGORA)
  assert.deepEqual(r, { id: 'c1', nome: 'Cliente Saudável', pontos: 0, nivel: 'baixo', motivos: [] })
})

test('churn: pagamento atrasado soma 30, +20 passado de 15 dias, +10 com 2 ou mais', () => {
  const um = riscoDeChurn({ ...saudavel, parcelasAtrasadas: [{ valor: 900, vencimento: dia('2026-10-20') }] }, AGORA)
  assert.equal(um.pontos, 30)
  assert.match(um.motivos[0], /1 pagamento\(s\) atrasado\(s\), R\$\s?900,00, o mais antigo há 3 dia\(s\)/)
  const velho = riscoDeChurn({ ...saudavel, parcelasAtrasadas: [{ valor: 900, vencimento: dia('2026-10-01') }] }, AGORA)
  assert.equal(velho.pontos, 50)
  assert.equal(velho.nivel, 'alto')
  const dois = riscoDeChurn({ ...saudavel, parcelasAtrasadas: [{ valor: 500, vencimento: dia('2026-10-20') }, { valor: 300, vencimento: dia('2026-10-21') }] }, AGORA)
  assert.equal(dois.pontos, 40)
  assert.match(dois.motivos[0], /R\$\s?800,00/)
})

test('churn: contrato acabando em 30 dias soma 25; vencido sem renovação soma 15', () => {
  assert.equal(riscoDeChurn({ ...saudavel, contractEnd: dia('2026-11-10') }, AGORA).pontos, 25)
  assert.equal(riscoDeChurn({ ...saudavel, contractEnd: dia('2026-11-23') }, AGORA).pontos, 25)
  assert.equal(riscoDeChurn({ ...saudavel, contractEnd: dia('2026-12-31') }, AGORA).pontos, 0)
  const vencido = riscoDeChurn({ ...saudavel, contractEnd: dia('2026-09-30') }, AGORA)
  assert.equal(vencido.pontos, 15)
  assert.match(vencido.motivos[0], /venceu em 30\/09/)
})

test('churn: serviço encerrado nos últimos 60 dias soma 20; mais antigo não conta', () => {
  const r = riscoDeChurn({ ...saudavel, servicosEncerradosRecentes: [{ nome: 'SEO', endedAt: dia('2026-10-10') }] }, AGORA)
  assert.equal(r.pontos, 20)
  assert.match(r.motivos[0], /encerrou SEO \(10\/10\)/)
  assert.equal(riscoDeChurn({ ...saudavel, servicosEncerradosRecentes: [{ nome: 'SEO', endedAt: dia('2026-07-01') }] }, AGORA).pontos, 0)
})

test('churn: demandas atrasadas somam 10 (1 ou 2) ou 20 (3 ou mais)', () => {
  assert.equal(riscoDeChurn({ ...saudavel, demandasAtrasadas: 2 }, AGORA).pontos, 10)
  assert.equal(riscoDeChurn({ ...saudavel, demandasAtrasadas: 3 }, AGORA).pontos, 20)
})

test('churn: grupo rebaixado soma 15; sem serviço ativo soma 25', () => {
  assert.equal(riscoDeChurn({ ...saudavel, rebaixado: true }, AGORA).pontos, 15)
  const sem = riscoDeChurn({ ...saudavel, servicosAtivos: 0, ultimaEntrega: null }, AGORA)
  assert.equal(sem.pontos, 25)
  assert.deepEqual(sem.motivos, ['nenhum serviço ativo'])
})

test('churn: sem entrega há mais de 30 dias (com serviço ativo) soma 10', () => {
  const r = riscoDeChurn({ ...saudavel, ultimaEntrega: dia('2026-09-01') }, AGORA)
  assert.equal(r.pontos, 10)
  assert.match(r.motivos[0], /nenhuma entrega há 52 dias/)
  assert.equal(riscoDeChurn({ ...saudavel, ultimaEntrega: null }, AGORA).motivos[0], 'nenhuma entrega registrada')
  assert.equal(riscoDeChurn({ ...saudavel, ultimaEntrega: dia('2026-09-24') }, AGORA).pontos, 0)
})

test('churn: níveis e ordem do maior risco para o menor', () => {
  assert.equal(nivelDoRisco(49), 'medio')
  assert.equal(nivelDoRisco(50), 'alto')
  assert.equal(nivelDoRisco(24), 'baixo')
  assert.equal(nivelDoRisco(25), 'medio')
  const lista = ordenarPorRisco([
    { id: 'a', nome: 'Beta', pontos: 30, nivel: 'medio', motivos: [] },
    { id: 'b', nome: 'Alfa', pontos: 30, nivel: 'medio', motivos: [] },
    { id: 'c', nome: 'Gama', pontos: 70, nivel: 'alto', motivos: [] },
  ])
  assert.deepEqual(lista.map((x) => x.nome), ['Gama', 'Alfa', 'Beta'])
})
