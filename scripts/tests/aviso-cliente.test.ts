import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MENSAGEM_GENERICA, dataHora, decidirAviso, dentroDaJanela, ehGrupoWhatsapp, enfileirarAviso, limparTextoCliente, linhaDaEtapa, prazoDaEtapa,
  mensagemCliente, planejarEnvio, processarFila, proximoHorarioValido, quandoSai, resultadoEnvio,
  type AvisoVencido, type DemandaParaAviso, type DepsEnfileirar, type DepsProcessar, type EntradaDecisao, type EtapaParaAviso,
} from '../../lib/aviso-cliente-core'
import { FRASES_CLIENTE_PADRAO } from '../../lib/processos'

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

/* ------------------------------ frase e mensagem ao cliente ------------------------------ */

test('frase da etapa: troca {entrega} pelo nome da entrega na demanda', () => {
  assert.equal(linhaDaEtapa('Agendamos {entrega|mais uma publicação}', { entrega: 'o post de Outubro Rosa' }), 'Agendamos o post de Outubro Rosa')
  assert.equal(linhaDaEtapa('Finalizamos {entrega}', { entrega: '  o site  ' }), 'Finalizamos o site')
})

test('frase da etapa: sem nome na demanda, usa o reserva da frase (ou "mais uma entrega")', () => {
  assert.equal(linhaDaEtapa('Agendamos {entrega|mais uma publicação}', {}), 'Agendamos mais uma publicação')
  assert.equal(linhaDaEtapa('Finalizamos {entrega}', { entrega: '' }), 'Finalizamos mais uma entrega')
  assert.equal(linhaDaEtapa('Finalizamos o briefing do seu site', { entrega: 'ignorado' }), 'Finalizamos o briefing do seu site')
})

test('frase da etapa: data agendada, próxima etapa e prazos', () => {
  const dados = { entrega: 'o post de Outubro Rosa', data: sp('2026-10-12T09:00'), proxima: 'Desenvolvimento', prazo: sp('2026-10-15T12:00'), prazoFinal: sp('2026-10-30T12:00') }
  assert.equal(linhaDaEtapa('Agendamos {entrega}[ para {data}]', dados), 'Agendamos o post de Outubro Rosa para 12/10 às 9h')
  assert.equal(linhaDaEtapa('Finalizamos o briefing do seu site[. Próxima etapa: {proxima}, até {prazo}]', dados), 'Finalizamos o briefing do seu site. Próxima etapa: Desenvolvimento, até 15/10')
  assert.equal(linhaDaEtapa('Finalizamos o desenvolvimento[. Previsão de publicação: {prazo_final}]', dados), 'Finalizamos o desenvolvimento. Previsão de publicação: 30/10')
  assert.equal(dataHora(sp('2026-10-12T09:30')), '12/10 às 9h30')
  assert.equal(dataHora(sp('2026-10-12T00:00')), '12/10 às 0h')
})

test('frase da etapa: trecho entre colchetes some se faltar dado, sem deixar a frase quebrada', () => {
  assert.equal(linhaDaEtapa('Agendamos {entrega}[ para {data}]', { entrega: 'o post' }), 'Agendamos o post')
  assert.equal(linhaDaEtapa('Finalizamos o briefing[. Próxima etapa: {proxima}, até {prazo}]', { proxima: 'Layout' }), 'Finalizamos o briefing')
  assert.equal(linhaDaEtapa('Finalizamos o briefing[. Próxima etapa: {proxima}, até {prazo}]', {}), 'Finalizamos o briefing')
})

test('frase da etapa: limpa, começa com maiúscula, sem frase não há linha', () => {
  assert.equal(linhaDaEtapa('  seu site está no ar.  ', {}), 'Seu site está no ar')
  assert.equal(linhaDaEtapa('', { entrega: 'x' }), null)
  assert.equal(linhaDaEtapa(null, { entrega: 'x' }), null)
})

test('prazo da próxima etapa: dias depois de entrar ou dias antes da entrega', () => {
  const entrou = sp('2026-10-22T14:00')
  assert.deepEqual(prazoDaEtapa({ dueMode: 'DIAS_APOS_ENTRADA', dueDays: 5, kind: 'EXECUCAO' }, { dueDate: null, stageEnteredAt: entrou }), sp('2026-10-27T14:00'))
  assert.deepEqual(prazoDaEtapa({ dueMode: 'ANTES_DA_ENTREGA', dueDays: 2, kind: 'EXECUCAO' }, { dueDate: sp('2026-10-30T12:00'), stageEnteredAt: entrou }), sp('2026-10-28T12:00'))
  assert.equal(prazoDaEtapa({ dueMode: 'DIAS_APOS_ENTRADA', dueDays: 0, kind: 'FINAL' }, { dueDate: null, stageEnteredAt: entrou }), null)
})

test('mensagem: uma linha só sai direto, com o fecho', () => {
  assert.equal(mensagemCliente(['Finalizamos o briefing do seu site']), '✅ Finalizamos o briefing do seu site. Qualquer dúvida, é só chamar.')
})

test('mensagem: várias saem em lista do que avançou', () => {
  assert.equal(
    mensagemCliente(['Finalizamos o briefing do seu site', 'Agendamos o post de Outubro Rosa']),
    '✅ Atualização do seu projeto:\n• Finalizamos o briefing do seu site\n• Agendamos o post de Outubro Rosa\n\nQualquer dúvida, é só chamar.',
  )
})

test('mensagem: linhas iguais viram uma com a contagem', () => {
  assert.equal(
    mensagemCliente(['Agendamos mais uma publicação', 'Agendamos mais uma publicação', 'Seu site está no ar']),
    '✅ Atualização do seu projeto:\n• Agendamos mais uma publicação (2x)\n• Seu site está no ar\n\nQualquer dúvida, é só chamar.',
  )
  assert.equal(mensagemCliente(['Agendamos mais uma publicação', 'Agendamos mais uma publicação']), '✅ Atualização do seu projeto:\n• Agendamos mais uma publicação (2x)\n\nQualquer dúvida, é só chamar.')
})

test('mensagem: sem linha válida, cai na genérica', () => {
  assert.equal(mensagemCliente([]), '✅ Concluímos mais uma entrega para vocês. Qualquer dúvida, é só chamar.')
  assert.equal(mensagemCliente(['  ', null]), MENSAGEM_GENERICA)
})

test('texto do cliente: uma linha, sem ponto final, até 300 caracteres', () => {
  assert.equal(limparTextoCliente('  Site\n  no ar!  '), 'Site no ar')
  assert.equal(limparTextoCliente('x'.repeat(400))?.length, 300)
  assert.equal(limparTextoCliente(''), null)
})

test('frases padrão: produção e revisão interna não avisam o cliente', () => {
  assert.equal(FRASES_CLIENTE_PADRAO['conteudo-redes'].Produção, undefined)
  assert.equal(FRASES_CLIENTE_PADRAO['conteudo-redes'].Revisão, undefined)
  assert.equal(FRASES_CLIENTE_PADRAO.site['Revisão interna'], undefined)
  assert.equal(linhaDaEtapa(FRASES_CLIENTE_PADRAO.site['Briefing e conteúdo'], {}), 'Finalizamos o briefing do seu site')
  assert.equal(
    linhaDaEtapa(FRASES_CLIENTE_PADRAO.site['Briefing e conteúdo'], { proxima: 'Layout', prazo: sp('2026-10-27T14:00') }),
    'Finalizamos o briefing do seu site. Próxima etapa: Layout, até 27/10',
  )
  assert.equal(linhaDaEtapa(FRASES_CLIENTE_PADRAO['conteudo-redes'].Agendamento, { data: sp('2026-10-12T09:00') }), 'Agendamos mais uma publicação para 12/10 às 9h')
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

const BRIEFING: EtapaParaAviso = { id: 's-brief', name: 'Briefing e conteúdo', position: 0, notifyClient: true, clientPhrase: 'Finalizamos o briefing do seu site' }
const LAYOUT: EtapaParaAviso = { id: 's-layout', name: 'Layout', position: 1, notifyClient: false, clientPhrase: null }
const REVISAO: EtapaParaAviso = { id: 's-rev', name: 'Revisão interna', position: 2, notifyClient: false, clientPhrase: null }
const ok: EntradaDecisao = { de: BRIEFING, para: { position: 1 }, geralLigado: true, cliente: { avisoConclusaoAtivo: true, whatsappGroupId: GRUPO } }
const com = (p: Partial<EntradaDecisao>): EntradaDecisao => ({ ...ok, ...p })

test('decisão: sair de etapa marcada para adiante entra na fila', () => {
  assert.deepEqual(decidirAviso(ok), { entra: true })
  assert.deepEqual(decidirAviso(com({ para: { position: 5 } })), { entra: true }) // pulou etapas (admin moveu)
})

test('decisão: devolver ou ficar na mesma etapa não avisa', () => {
  assert.deepEqual(decidirAviso(com({ de: { ...BRIEFING, position: 3 }, para: { position: 1 } })), { entra: false, motivo: 'nao-avancou' })
  assert.deepEqual(decidirAviso(com({ para: { position: 0 } })), { entra: false, motivo: 'nao-avancou' })
  assert.deepEqual(decidirAviso(com({ para: null })), { entra: false, motivo: 'nao-avancou' })
  assert.deepEqual(decidirAviso(com({ de: null })), { entra: false, motivo: 'sem-etapa' })
})

test('decisão: etapa sem aviso ou sem frase não avisa', () => {
  assert.deepEqual(decidirAviso(com({ de: LAYOUT, para: { position: 2 } })), { entra: false, motivo: 'etapa-sem-aviso' })
  assert.deepEqual(decidirAviso(com({ de: { ...BRIEFING, clientPhrase: '   ' } })), { entra: false, motivo: 'etapa-sem-aviso' })
  // frase escrita mas "avisar o cliente" desmarcado: não avisa
  assert.deepEqual(decidirAviso(com({ de: { ...BRIEFING, notifyClient: false } })), { entra: false, motivo: 'etapa-sem-aviso' })
})

test('decisão: cada trava do cliente bloqueia sozinha', () => {
  assert.deepEqual(decidirAviso(com({ geralLigado: false })), { entra: false, motivo: 'desligado-geral' })
  assert.deepEqual(decidirAviso(com({ cliente: null })), { entra: false, motivo: 'sem-cliente' })
  assert.deepEqual(decidirAviso(com({ cliente: { avisoConclusaoAtivo: false, whatsappGroupId: GRUPO } })), { entra: false, motivo: 'cliente-desligado' })
  assert.deepEqual(decidirAviso(com({ cliente: { avisoConclusaoAtivo: true, whatsappGroupId: null } })), { entra: false, motivo: 'sem-grupo' })
  assert.deepEqual(decidirAviso(com({ cliente: { avisoConclusaoAtivo: true, whatsappGroupId: '5511999998888' } })), { entra: false, motivo: 'grupo-invalido' })
})

/* ------------------------------ entrar na fila ------------------------------ */

const demanda = (p: Partial<DemandaParaAviso> = {}): DemandaParaAviso => ({
  id: 't1', number: 241, title: 'Espaço Fada dos Pés · Site One Page (interno)', assigneeId: 'u-antonio',
  stageId: LAYOUT.id, clientText: null, stages: [BRIEFING, LAYOUT, REVISAO],
  client: { id: 'c1', name: 'Fada', avisoConclusaoAtivo: true, whatsappGroupId: GRUPO },
  ...p,
})

function fakesFila(over: Partial<DepsEnfileirar> = {}, t: DemandaParaAviso | null = demanda(), agora = sp('2026-10-22T14:00')) {
  const c = { carregar: 0, criados: [] as Array<{ stageId: string; line: string; sendAfter: Date }>, eventos: [] as string[], responsavel: [] as Array<[string, string]> }
  const deps: DepsEnfileirar = {
    agora: () => agora,
    carregar: async () => { c.carregar++; return t },
    geralLigado: async () => true,
    pendentesDoCliente: async () => [],
    criarAviso: async (x) => { c.criados.push(x); return 'criado' },
    registrarEvento: async (_id, txt) => { c.eventos.push(txt) },
    avisarResponsavel: async (u, txt) => { c.responsavel.push([u, txt]) },
    ...over,
  }
  return { deps, c }
}
const saiuDoBriefing = { taskId: 't1', deStageId: BRIEFING.id }

test('fila: fim do briefing entra com a frase da etapa e avisa o responsável na hora', async () => {
  const { deps, c } = fakesFila()
  const r = await enfileirarAviso(saiuDoBriefing, deps)
  assert.deepEqual(r, { situacao: 'na-fila', sendAfter: sp('2026-10-22T14:10'), linha: 'Finalizamos o briefing do seu site' })
  assert.deepEqual(c.criados.map((x) => [x.stageId, x.line]), [['s-brief', 'Finalizamos o briefing do seu site']])
  assert.deepEqual(c.eventos, ['Aviso ao cliente na fila (etapa "Briefing e conteúdo"): sai no grupo hoje às 14:10.'])
  assert.equal(c.responsavel[0][1], '✅ Espaço Fada dos Pés · Site One Page (interno) (#241): etapa "Briefing e conteúdo" concluída. O cliente será avisado no grupo hoje às 14:10: "Finalizamos o briefing do seu site".')
})

test('fila: a linha leva a próxima etapa e o prazo dela, calculados na hora', async () => {
  const brief: EtapaParaAviso = { ...BRIEFING, clientPhrase: 'Finalizamos o briefing do seu site[. Próxima etapa: {proxima}, até {prazo}]' }
  const layout: EtapaParaAviso = { ...LAYOUT, kind: 'EXECUCAO', dueMode: 'DIAS_APOS_ENTRADA', dueDays: 5 }
  const t = demanda({ stages: [brief, layout, REVISAO], stageId: layout.id, stageEnteredAt: sp('2026-10-22T14:00') })
  const { deps, c } = fakesFila({}, t)
  await enfileirarAviso(saiuDoBriefing, deps)
  assert.equal(c.criados[0].line, 'Finalizamos o briefing do seu site. Próxima etapa: Layout, até 27/10')
})

test('fila: prazo marcado pelo admin para a próxima etapa vale no lugar da regra', async () => {
  const brief: EtapaParaAviso = { ...BRIEFING, clientPhrase: 'Finalizamos o briefing do seu site[. Próxima etapa: {proxima}, até {prazo}]' }
  const layout: EtapaParaAviso = { ...LAYOUT, kind: 'EXECUCAO', dueMode: 'DIAS_APOS_ENTRADA', dueDays: 5 }
  const t = demanda({
    stages: [brief, layout, REVISAO], stageId: layout.id, stageEnteredAt: sp('2026-10-22T14:00'),
    stageDeadlines: { [layout.id]: sp('2026-11-14T18:00').toISOString() },
  })
  const { deps, c } = fakesFila({}, t)
  await enfileirarAviso(saiuDoBriefing, deps)
  assert.equal(c.criados[0].line, 'Finalizamos o briefing do seu site. Próxima etapa: Layout, até 14/11')
})

test('fila: agendamento leva a data e a hora da publicação', async () => {
  const agendamento: EtapaParaAviso = { id: 's-ag', name: 'Agendamento', position: 2, notifyClient: true, clientPhrase: 'Agendamos {entrega|mais uma publicação}[ para {data}]' }
  const fim: EtapaParaAviso = { id: 's-fim', name: 'Concluído', position: 3, notifyClient: false, clientPhrase: null, kind: 'FINAL' }
  const t = demanda({ stageId: 's-fim', stages: [agendamento, fim], clientText: 'o post de Outubro Rosa', scheduledFor: sp('2026-10-12T09:00') })
  const { deps, c } = fakesFila({}, t)
  await enfileirarAviso({ taskId: 't1', deStageId: 's-ag' }, deps)
  assert.equal(c.criados[0].line, 'Agendamos o post de Outubro Rosa para 12/10 às 9h')
})

test('fila: a linha usa o nome da entrega da demanda, nunca o título interno', async () => {
  const agendamento: EtapaParaAviso = { id: 's-ag', name: 'Agendamento', position: 2, notifyClient: true, clientPhrase: 'Agendamos {entrega|mais uma publicação}' }
  const fim: EtapaParaAviso = { id: 's-fim', name: 'Concluído', position: 3, notifyClient: false, clientPhrase: null }
  const t = demanda({ title: 'Promo · POST 1 · interno', stageId: 's-fim', stages: [agendamento, fim], clientText: 'o post de Outubro Rosa' })
  const { deps, c } = fakesFila({}, t)
  await enfileirarAviso({ taskId: 't1', deStageId: 's-ag' }, deps)
  assert.equal(c.criados[0].line, 'Agendamos o post de Outubro Rosa')
  assert.ok(!c.criados[0].line.includes('interno'))
})

test('fila: fora do horário espera a abertura, mas o responsável é avisado já', async () => {
  const { deps, c } = fakesFila({}, demanda(), sp('2026-10-23T21:00'))
  const r = await enfileirarAviso(saiuDoBriefing, deps)
  assert.equal(r.situacao === 'na-fila' && r.sendAfter.getTime(), sp('2026-10-26T08:00').getTime())
  assert.match(c.responsavel[0][1], /será avisado no grupo segunda às 08:00/)
})

test('fila: avanço junto de outro do mesmo cliente entra no mesmo lote', async () => {
  const { deps } = fakesFila({ pendentesDoCliente: async () => [sp('2026-10-22T13:58')] })
  const r = await enfileirarAviso(saiuDoBriefing, deps)
  assert.equal(r.situacao === 'na-fila' && r.sendAfter.getTime(), sp('2026-10-22T14:08').getTime())
})

test('fila: etapa que já teve aviso não entra de novo nem avisa o responsável', async () => {
  const { deps, c } = fakesFila({ criarAviso: async () => 'ja-existe' })
  assert.deepEqual(await enfileirarAviso(saiuDoBriefing, deps), { situacao: 'ignorado', motivo: 'ja-enviado' })
  assert.equal(c.responsavel.length, 0)
  assert.equal(c.eventos.length, 0)
})

test('fila: sem etapa de origem nem consulta o banco', async () => {
  const { deps, c } = fakesFila()
  assert.deepEqual(await enfileirarAviso({ taskId: 't1', deStageId: null }, deps), { situacao: 'ignorado', motivo: 'sem-etapa' })
  assert.equal(c.carregar, 0)
})

test('fila: devolver para a etapa anterior não avisa', async () => {
  const { deps, c } = fakesFila({}, demanda({ stageId: BRIEFING.id }))
  assert.deepEqual(await enfileirarAviso({ taskId: 't1', deStageId: REVISAO.id }, deps), { situacao: 'ignorado', motivo: 'nao-avancou' })
  assert.equal(c.criados.length, 0)
})

test('fila: cada trava impede a entrada', async () => {
  const casos: Array<[string, Partial<DepsEnfileirar>, DemandaParaAviso, string]> = [
    ['etapa-sem-aviso', {}, demanda({ stageId: REVISAO.id }), LAYOUT.id],
    ['desligado-geral', { geralLigado: async () => false }, demanda(), BRIEFING.id],
    ['cliente-desligado', {}, demanda({ client: { id: 'c1', name: 'C', avisoConclusaoAtivo: false, whatsappGroupId: GRUPO } }), BRIEFING.id],
    ['sem-grupo', {}, demanda({ client: { id: 'c1', name: 'C', avisoConclusaoAtivo: true, whatsappGroupId: null } }), BRIEFING.id],
    ['grupo-invalido', {}, demanda({ client: { id: 'c1', name: 'C', avisoConclusaoAtivo: true, whatsappGroupId: '5511999998888' } }), BRIEFING.id],
    ['sem-cliente', {}, demanda({ client: null }), BRIEFING.id],
  ]
  for (const [motivo, over, t, de] of casos) {
    const { deps, c } = fakesFila(over, t)
    assert.deepEqual(await enfileirarAviso({ taskId: 't1', deStageId: de }, deps), { situacao: 'ignorado', motivo }, motivo)
    assert.equal(c.criados.length, 0, motivo)
    assert.equal(c.responsavel.length, 0, motivo)
  }
})

test('fila: banco fora do ar não lança', async () => {
  const { deps } = fakesFila({ carregar: async () => { throw new Error('banco caiu') } })
  assert.deepEqual(await enfileirarAviso(saiuDoBriefing, deps), { situacao: 'falhou', erro: 'banco caiu' })
})

/* ------------------------------ processar a fila ------------------------------ */

const aviso = (id: string, clientId: string, p: { line?: string; title?: string; attempts?: number; grupo?: string | null; ligado?: boolean } = {}): AvisoVencido => ({
  id, taskId: `task-${id}`, clientId, attempts: p.attempts ?? 0, line: p.line ?? 'Agendamos mais uma publicação',
  task: { number: Number(id.replace(/\D/g, '')) || 1, title: p.title ?? `Interno ${id} · título que o cliente não pode ver`, assigneeId: 'u-antonio' },
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
    aviso('n1', 'promo', { line: 'Finalizamos o briefing do seu site' }),
    aviso('n2', 'promo', { line: 'Agendamos o post de Outubro Rosa' }),
    aviso('n3', 'bruna', { grupo: GRUPO2, line: 'Seu site está no ar' }),
  ]
  const { deps, c } = fakesProc(fila)
  const rel = await processarFila(deps)
  assert.deepEqual(rel, { enviados: 3, mensagens: 2, falhas: 0, cancelados: 0, adiados: 0 })
  assert.deepEqual(c.envios, [
    [GRUPO, '✅ Atualização do seu projeto:\n• Finalizamos o briefing do seu site\n• Agendamos o post de Outubro Rosa\n\nQualquer dúvida, é só chamar.'],
    [GRUPO2, '✅ Seu site está no ar. Qualquer dúvida, é só chamar.'],
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
  const { deps, c } = fakesProc([aviso('n1', 'c1', { line: 'Linha A' }), aviso('n2', 'c1', { line: 'Linha B' })], { reservar: async () => ['n1'] })
  await processarFila(deps)
  assert.deepEqual(c.envios, [[GRUPO, '✅ Linha A. Qualquer dúvida, é só chamar.']])
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
