import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MENSAGEM_GENERICA, decidirAviso, dentroDaJanela, ehGrupoWhatsapp, enfileirarAviso, limparTextoCliente, mensagemCliente,
  planejarEnvio, processarFila, proximoHorarioValido, quandoSai, resultadoEnvio,
  type AvisoVencido, type DemandaParaAviso, type DepsEnfileirar, type DepsProcessar, type EntradaDecisao,
} from '../../lib/aviso-cliente-core'

/** Horário de Brasília (UTC−3) para Date. 22/10/2026 é quinta-feira. */
const sp = (s: string) => new Date(`${s}:00-03:00`)
const GRUPO = '120363425931925125@g.us'
const GRUPO2 = '120363427826414793@g.us'

/* ------------------------------ janela de horário ------------------------------ */

test('janela: seg a sex, das 8h às 20h de Brasília', () => {
  assert.equal(dentroDaJanela(sp('2026-10-22T07:59')), false)
  assert.equal(dentroDaJanela(sp('2026-10-22T08:00')), true)
  assert.equal(dentroDaJanela(sp('2026-10-22T14:00')), true)
  assert.equal(dentroDaJanela(sp('2026-10-22T19:59')), true)
  assert.equal(dentroDaJanela(sp('2026-10-22T20:00')), false)
  assert.equal(dentroDaJanela(sp('2026-10-24T10:00')), false) // sábado
  assert.equal(dentroDaJanela(sp('2026-10-25T10:00')), false) // domingo
  assert.equal(dentroDaJanela(sp('2026-10-26T08:00')), true) // segunda
})

test('próximo horário: dentro da janela é o próprio instante; fora, a próxima abertura', () => {
  assert.deepEqual(proximoHorarioValido(sp('2026-10-22T14:00')), sp('2026-10-22T14:00'))
  assert.deepEqual(proximoHorarioValido(sp('2026-10-22T06:30')), sp('2026-10-22T08:00')) // antes das 8h: hoje
  assert.deepEqual(proximoHorarioValido(sp('2026-10-22T20:00')), sp('2026-10-23T08:00')) // fechou: amanhã
  assert.deepEqual(proximoHorarioValido(sp('2026-10-22T23:30')), sp('2026-10-23T08:00')) // já é sexta em UTC
  assert.deepEqual(proximoHorarioValido(sp('2026-10-23T20:00')), sp('2026-10-26T08:00')) // sexta à noite: segunda
  assert.deepEqual(proximoHorarioValido(sp('2026-10-24T10:00')), sp('2026-10-26T08:00')) // sábado
  assert.deepEqual(proximoHorarioValido(sp('2026-10-25T23:59')), sp('2026-10-26T08:00')) // domingo
})

test('quando sai: texto para o responsável', () => {
  const agora = sp('2026-10-22T14:00')
  assert.equal(quandoSai(sp('2026-10-22T14:10'), agora), 'hoje às 14:10')
  assert.equal(quandoSai(sp('2026-10-23T08:00'), agora), 'amanhã às 08:00')
  assert.equal(quandoSai(sp('2026-10-26T08:00'), sp('2026-10-23T21:00')), 'segunda às 08:00')
})

/* ------------------------------ agrupamento ------------------------------ */

test('agrupar: sem pendentes, o lote abre agora e sai em 10 minutos', () => {
  assert.deepEqual(planejarEnvio(sp('2026-10-22T14:00'), []), sp('2026-10-22T14:10'))
})

test('agrupar: concluída até 10 minutos depois entra no mesmo lote', () => {
  const pendente = sp('2026-10-22T14:00')
  assert.deepEqual(planejarEnvio(sp('2026-10-22T14:07'), [pendente]), sp('2026-10-22T14:10'))
  assert.deepEqual(planejarEnvio(sp('2026-10-22T14:10'), [pendente]), sp('2026-10-22T14:10'))
})

test('agrupar: depois de 10 minutos abre lote novo', () => {
  assert.deepEqual(planejarEnvio(sp('2026-10-22T14:11'), [sp('2026-10-22T14:00')]), sp('2026-10-22T14:21'))
})

test('agrupar: lote que passaria das 20h vai para a abertura seguinte', () => {
  assert.deepEqual(planejarEnvio(sp('2026-10-22T19:55'), []), sp('2026-10-23T08:00'))
  assert.deepEqual(planejarEnvio(sp('2026-10-23T19:55'), []), sp('2026-10-26T08:00'))
  assert.deepEqual(planejarEnvio(sp('2026-10-24T11:00'), []), sp('2026-10-26T08:00'))
})

/* ------------------------------ mensagem ao cliente ------------------------------ */

test('mensagem: sem texto, sai a genérica', () => {
  assert.equal(mensagemCliente([null]), '✅ Concluímos mais uma entrega para vocês. Qualquer dúvida, é só chamar.')
  assert.equal(mensagemCliente(['   ']), MENSAGEM_GENERICA)
  assert.equal(mensagemCliente([]), MENSAGEM_GENERICA)
})

test('mensagem: com texto, usa o texto para o cliente', () => {
  assert.equal(mensagemCliente(['O post de Outubro Rosa já está no ar.']), '✅ Entrega concluída: O post de Outubro Rosa já está no ar.\n\nQualquer dúvida, é só chamar.')
})

test('mensagem: várias entregas saem em lista', () => {
  assert.equal(
    mensagemCliente(['Post de Outubro Rosa', null, 'Site no ar', '  ']),
    '✅ Concluímos 4 entregas para vocês:\n• Post de Outubro Rosa\n• Site no ar\n• mais 2 entregas\n\nQualquer dúvida, é só chamar.',
  )
  assert.equal(mensagemCliente(['Post A', null]), '✅ Concluímos 2 entregas para vocês:\n• Post A\n• mais 1 entrega\n\nQualquer dúvida, é só chamar.')
  assert.equal(mensagemCliente([null, null, null]), '✅ Concluímos 3 entregas para vocês. Qualquer dúvida, é só chamar.')
})

test('texto do cliente: uma linha, sem ponto final, até 300 caracteres', () => {
  assert.equal(limparTextoCliente('  Site\n  no ar!  '), 'Site no ar')
  assert.equal(limparTextoCliente('x'.repeat(400))?.length, 300)
  assert.equal(limparTextoCliente(''), null)
  assert.equal(limparTextoCliente(null), null)
})

/* ------------------------------ grupo e resposta ------------------------------ */

test('grupo: aceita só id de grupo do WhatsApp', () => {
  assert.ok(ehGrupoWhatsapp(GRUPO))
  assert.ok(ehGrupoWhatsapp('5511999998888-1600000000@g.us'))
  for (const ruim of ['', null, undefined, '5511999998888', '5511999998888@s.whatsapp.net', '1203@g.us.evil', 'abc@g.us']) {
    assert.equal(ehGrupoWhatsapp(ruim), false, String(ruim))
  }
})

test('resposta do WhatsApp: só 2xx sem erro conta como enviado', () => {
  assert.deepEqual(resultadoEnvio(200, { messageid: 'x' }), { ok: true })
  assert.deepEqual(resultadoEnvio(401, { code: 401, message: 'Invalid token.' }), { ok: false, erro: 'HTTP 401: Invalid token.' })
  assert.deepEqual(resultadoEnvio(200, { error: 'number not on whatsapp' }), { ok: false, erro: 'HTTP 200: number not on whatsapp' })
  assert.deepEqual(resultadoEnvio(500, 'gateway'), { ok: false, erro: 'HTTP 500' })
})

/* ------------------------------ decisão de entrar na fila ------------------------------ */

const ok: EntradaDecisao = { antes: 'APROVADO', depois: 'CONCLUIDO', geralLigado: true, cliente: { avisoConclusaoAtivo: true, whatsappGroupId: GRUPO } }
const com = (p: Partial<EntradaDecisao>): EntradaDecisao => ({ ...ok, ...p })

test('decisão: só a conclusão entra, e cada trava bloqueia sozinha', () => {
  assert.deepEqual(decidirAviso(ok), { entra: true })
  for (const depois of ['APROVADO', 'EM_REVISAO', 'TODO']) assert.deepEqual(decidirAviso(com({ depois })), { entra: false, motivo: 'nao-concluiu' })
  assert.deepEqual(decidirAviso(com({ antes: 'CONCLUIDO' })), { entra: false, motivo: 'nao-concluiu' })
  assert.deepEqual(decidirAviso(com({ geralLigado: false })), { entra: false, motivo: 'desligado-geral' })
  assert.deepEqual(decidirAviso(com({ cliente: null })), { entra: false, motivo: 'sem-cliente' })
  assert.deepEqual(decidirAviso(com({ cliente: { avisoConclusaoAtivo: false, whatsappGroupId: GRUPO } })), { entra: false, motivo: 'cliente-desligado' })
  assert.deepEqual(decidirAviso(com({ cliente: { avisoConclusaoAtivo: true, whatsappGroupId: null } })), { entra: false, motivo: 'sem-grupo' })
  assert.deepEqual(decidirAviso(com({ cliente: { avisoConclusaoAtivo: true, whatsappGroupId: '5511999998888' } })), { entra: false, motivo: 'grupo-invalido' })
})

/* ------------------------------ entrar na fila ------------------------------ */

const demanda = (p: Partial<DemandaParaAviso> = {}): DemandaParaAviso => ({
  id: 't1', number: 199, title: 'Promo Prime · POST 1 · A ruptura nasce antes da loja', assigneeId: 'u-antonio',
  client: { id: 'c1', name: 'Promo Prime', avisoConclusaoAtivo: true, whatsappGroupId: GRUPO },
  ...p,
})

function fakesFila(over: Partial<DepsEnfileirar> = {}, t: DemandaParaAviso | null = demanda(), agora = sp('2026-10-22T14:00')) {
  const c = { carregar: 0, criados: [] as Array<{ sendAfter: Date }>, eventos: [] as string[], responsavel: [] as Array<[string, string]> }
  const deps: DepsEnfileirar = {
    agora: () => agora,
    carregar: async () => { c.carregar++; return t },
    geralLigado: async () => true,
    pendentesDoCliente: async () => [],
    criarAviso: async (a) => { c.criados.push(a); return 'criado' },
    registrarEvento: async (_id, txt) => { c.eventos.push(txt) },
    avisarResponsavel: async (u, txt) => { c.responsavel.push([u, txt]) },
    ...over,
  }
  return { deps, c }
}
const concluir = { taskId: 't1', antes: 'APROVADO', depois: 'CONCLUIDO' }

test('fila: conclusão no horário entra na fila para daqui a 10 min e o responsável é avisado na hora', async () => {
  const { deps, c } = fakesFila()
  const r = await enfileirarAviso(concluir, deps)
  assert.deepEqual(r, { situacao: 'na-fila', sendAfter: sp('2026-10-22T14:10') })
  assert.equal(c.criados.length, 1)
  assert.deepEqual(c.eventos, ['Aviso ao cliente na fila: sai no grupo hoje às 14:10.'])
  assert.deepEqual(c.responsavel, [['u-antonio', '✅ Promo Prime · POST 1 · A ruptura nasce antes da loja (#199) concluída. O cliente será avisado no grupo hoje às 14:10.']])
})

test('fila: fora do horário espera a abertura, mas o responsável é avisado já', async () => {
  const { deps, c } = fakesFila({}, demanda(), sp('2026-10-23T21:00'))
  const r = await enfileirarAviso(concluir, deps)
  assert.deepEqual(r, { situacao: 'na-fila', sendAfter: sp('2026-10-26T08:00') })
  assert.match(c.responsavel[0][1], /será avisado no grupo segunda às 08:00/)
})

test('fila: concluída junto de outra do mesmo cliente entra no mesmo lote', async () => {
  const { deps } = fakesFila({ pendentesDoCliente: async () => [sp('2026-10-22T13:58')] })
  const r = await enfileirarAviso(concluir, deps)
  assert.deepEqual(r, { situacao: 'na-fila', sendAfter: sp('2026-10-22T14:08') })
})

test('fila: demanda que já teve aviso não entra de novo nem avisa o responsável', async () => {
  const { deps, c } = fakesFila({ criarAviso: async () => 'ja-existe' })
  assert.deepEqual(await enfileirarAviso(concluir, deps), { situacao: 'ignorado', motivo: 'ja-enviado' })
  assert.equal(c.responsavel.length, 0)
  assert.equal(c.eventos.length, 0)
})

test('fila: sem conclusão nem consulta o banco', async () => {
  const { deps, c } = fakesFila()
  assert.deepEqual(await enfileirarAviso({ taskId: 't1', antes: 'EM_REVISAO', depois: 'APROVADO' }, deps), { situacao: 'ignorado', motivo: 'nao-concluiu' })
  assert.equal(c.carregar, 0)
})

test('fila: cada trava impede a entrada', async () => {
  const casos: Array<[string, Partial<DepsEnfileirar>, DemandaParaAviso]> = [
    ['desligado-geral', { geralLigado: async () => false }, demanda()],
    ['cliente-desligado', {}, demanda({ client: { id: 'c1', name: 'C', avisoConclusaoAtivo: false, whatsappGroupId: GRUPO } })],
    ['sem-grupo', {}, demanda({ client: { id: 'c1', name: 'C', avisoConclusaoAtivo: true, whatsappGroupId: null } })],
    ['grupo-invalido', {}, demanda({ client: { id: 'c1', name: 'C', avisoConclusaoAtivo: true, whatsappGroupId: '5511999998888' } })],
    ['sem-cliente', {}, demanda({ client: null })],
  ]
  for (const [motivo, over, t] of casos) {
    const { deps, c } = fakesFila(over, t)
    assert.deepEqual(await enfileirarAviso(concluir, deps), { situacao: 'ignorado', motivo }, motivo)
    assert.equal(c.criados.length, 0, motivo)
    assert.equal(c.responsavel.length, 0, motivo)
  }
})

test('fila: banco fora do ar não lança', async () => {
  const { deps } = fakesFila({ carregar: async () => { throw new Error('banco caiu') } })
  assert.deepEqual(await enfileirarAviso(concluir, deps), { situacao: 'falhou', erro: 'banco caiu' })
})

/* ------------------------------ processar a fila ------------------------------ */

const aviso = (id: string, clientId: string, p: { clientText?: string | null; title?: string; attempts?: number; grupo?: string | null; ligado?: boolean } = {}): AvisoVencido => ({
  id, taskId: `task-${id}`, clientId, attempts: p.attempts ?? 0,
  task: { number: Number(id.replace(/\D/g, '')) || 1, title: p.title ?? `Interno ${id} · título que o cliente não pode ver`, clientText: p.clientText ?? null, assigneeId: 'u-antonio' },
  client: { name: clientId, avisoConclusaoAtivo: p.ligado ?? true, whatsappGroupId: p.grupo === undefined ? GRUPO : p.grupo },
})

function fakesProc(vencidos: AvisoVencido[], over: Partial<DepsProcessar> = {}, agora = sp('2026-10-22T14:10')) {
  const c = {
    consultou: 0, envios: [] as Array<[string, string]>, enviados: [] as string[], reagendados: [] as Array<{ ids: string[]; sendAfter: Date; attempts: number }>,
    falhas: [] as Array<{ ids: string[]; attempts: number }>, cancelados: [] as string[], responsavel: [] as string[], eventos: [] as string[],
  }
  const deps: DepsProcessar = {
    agora: () => agora,
    vencidos: async () => { c.consultou++; return vencidos },
    geralLigado: async () => true,
    whatsappConfigurado: async () => true,
    reservar: async (ids) => ids,
    enviarGrupo: async (g, t) => { c.envios.push([g, t]); return { ok: true } },
    marcarEnviados: async (ids) => { c.enviados.push(...ids) },
    reagendar: async (ids, sendAfter, attempts) => { c.reagendados.push({ ids, sendAfter, attempts }) },
    marcarFalha: async (ids, attempts) => { c.falhas.push({ ids, attempts }) },
    cancelar: async (ids) => { c.cancelados.push(...ids) },
    registrarEnvio: async () => {},
    registrarEvento: async (_t, txt) => { c.eventos.push(txt) },
    avisarResponsavel: async (_u, txt) => { c.responsavel.push(txt) },
    ...over,
  }
  return { deps, c }
}

test('processar: fora da janela não envia nada nem consulta a fila', async () => {
  for (const agora of [sp('2026-10-22T20:00'), sp('2026-10-22T07:59'), sp('2026-10-24T10:00')]) {
    const { deps, c } = fakesProc([aviso('n1', 'c1')], {}, agora)
    await processarFila(deps)
    assert.equal(c.consultou, 0)
    assert.equal(c.envios.length, 0)
  }
})

test('processar: junta por cliente numa mensagem só, em lista, sem título interno', async () => {
  const fila = [
    aviso('n1', 'promo', { clientText: 'Post de Outubro Rosa' }),
    aviso('n2', 'promo'),
    aviso('n3', 'bruna', { grupo: GRUPO2 }),
  ]
  const { deps, c } = fakesProc(fila)
  const rel = await processarFila(deps)
  assert.deepEqual(rel, { enviados: 3, mensagens: 2, falhas: 0, cancelados: 0, adiados: 0 })
  assert.deepEqual(c.envios, [
    [GRUPO, '✅ Concluímos 2 entregas para vocês:\n• Post de Outubro Rosa\n• mais 1 entrega\n\nQualquer dúvida, é só chamar.'],
    [GRUPO2, MENSAGEM_GENERICA],
  ])
  for (const [, txt] of c.envios) for (const a of fila) assert.ok(!txt.includes(a.task.title), 'título interno vazou')
  assert.deepEqual(c.enviados.sort(), ['n1', 'n2', 'n3'])
})

test('processar: aviso desligado no geral cancela a fila sem enviar', async () => {
  const { deps, c } = fakesProc([aviso('n1', 'c1'), aviso('n2', 'c2')], { geralLigado: async () => false })
  await processarFila(deps)
  assert.equal(c.envios.length, 0)
  assert.deepEqual(c.cancelados, ['n1', 'n2'])
})

test('processar: WhatsApp fora do ar segura a fila para a próxima rodada', async () => {
  const { deps, c } = fakesProc([aviso('n1', 'c1')], { whatsappConfigurado: async () => false })
  const rel = await processarFila(deps)
  assert.equal(c.envios.length, 0)
  assert.equal(c.cancelados.length, 0)
  assert.equal(rel.adiados, 1)
})

test('processar: cliente desligado depois de concluir cancela só o dele', async () => {
  const { deps, c } = fakesProc([aviso('n1', 'off', { ligado: false }), aviso('n2', 'on')])
  await processarFila(deps)
  assert.deepEqual(c.cancelados, ['n1'])
  assert.equal(c.envios.length, 1)
})

test('processar: só envia o que conseguiu reservar (outra rodada pegou o resto)', async () => {
  const { deps, c } = fakesProc([aviso('n1', 'c1', { clientText: 'A' }), aviso('n2', 'c1', { clientText: 'B' })], { reservar: async () => ['n1'] })
  await processarFila(deps)
  assert.deepEqual(c.envios, [[GRUPO, '✅ Entrega concluída: A.\n\nQualquer dúvida, é só chamar.']])
})

test('processar: falha no envio tenta de novo em 5 min, sem incomodar o responsável', async () => {
  const { deps, c } = fakesProc([aviso('n1', 'c1')], { enviarGrupo: async () => ({ ok: false, erro: 'HTTP 401: Invalid token.' }) })
  const rel = await processarFila(deps)
  assert.deepEqual(c.reagendados, [{ ids: ['n1'], sendAfter: sp('2026-10-22T14:15'), attempts: 1 }])
  assert.equal(c.falhas.length, 0)
  assert.equal(c.responsavel.length, 0)
  assert.equal(rel.adiados, 1)
})

test('processar: nova tentativa que cairia fora do horário vai para a abertura', async () => {
  const { deps, c } = fakesProc([aviso('n1', 'c1')], { enviarGrupo: async () => ({ ok: false, erro: 'x' }) }, sp('2026-10-23T19:58'))
  await processarFila(deps)
  assert.deepEqual(c.reagendados[0].sendAfter, sp('2026-10-26T08:00'))
})

test('processar: na terceira falha desiste, registra e avisa o responsável', async () => {
  const { deps, c } = fakesProc([aviso('n1', 'c1', { attempts: 2 })], { enviarGrupo: async () => { throw new Error('ECONNRESET') } })
  const rel = await processarFila(deps)
  assert.deepEqual(c.falhas, [{ ids: ['n1'], attempts: 3 }])
  assert.equal(c.reagendados.length, 0)
  assert.equal(rel.falhas, 1)
  assert.match(c.responsavel[0], /não saiu \(ECONNRESET\)/)
  assert.match(c.eventos[0], /não saiu: ECONNRESET/)
})

test('processar: problema num cliente não trava os outros, e nada lança', async () => {
  const { deps, c } = fakesProc([aviso('n1', 'quebra'), aviso('n2', 'ok', { grupo: GRUPO2 })], {
    marcarEnviados: async (ids) => { if (ids.includes('n1')) throw new Error('banco caiu'); c.enviados.push(...ids) },
  })
  await processarFila(deps)
  assert.deepEqual(c.enviados, ['n2'])
  const { deps: d2 } = fakesProc([], { vencidos: async () => { throw new Error('fila fora') } })
  assert.deepEqual(await processarFila(d2), { enviados: 0, mensagens: 0, falhas: 0, cancelados: 0, adiados: 0 })
})
