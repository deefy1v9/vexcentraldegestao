import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MODELOS_PADRAO, OUTRO_PREFIXO, alertasDe, ehSensivel, identificacao, parsePerguntas, progresso, respostasEmTexto, slugDe, validarRespostas,
  type Pergunta,
} from '../../lib/briefing-core'

const P: Pergunta[] = [
  { id: 's1', tipo: 'secao', titulo: 'Empresa' },
  { id: 'emp', tipo: 'texto', titulo: 'Nome da empresa', obrigatoria: true, papel: 'empresa' },
  { id: 'mail', tipo: 'email', titulo: 'E-mail', papel: 'email' },
  { id: 'cpf', tipo: 'texto', titulo: 'CPF', sensivel: true },
  { id: 'pw', tipo: 'senha', titulo: 'Senha do Facebook' },
  { id: 'obj', tipo: 'multipla', titulo: 'Objetivo', obrigatoria: true, opcoes: ['Vendas', 'Leads', 'Blog'], outro: true, alerta: { opcoes: ['Blog'], texto: 'Marcou Blog' } },
  { id: 'gen', tipo: 'escolha', titulo: 'Gênero', opcoes: ['Homem', 'Mulher', 'Ambos'] },
  { id: 'dia', tipo: 'data', titulo: 'Data' },
]

test('modelos padrão: tráfego, site e site + blog, todos válidos', () => {
  assert.deepEqual(MODELOS_PADRAO.map((m) => m.slug), ['trafego', 'site', 'site-blog'])
  for (const m of MODELOS_PADRAO) {
    const r = parsePerguntas(m.perguntas)
    assert.ok('perguntas' in r, `${m.slug}: ${'error' in r ? r.error : ''}`)
    assert.equal(new Set(m.perguntas.map((p) => p.id)).size, m.perguntas.length, `${m.slug}: ids únicos`)
  }
  // site sem blog avisa quando marcam Blog; site com blog não, e tem a seção do blog
  const site = MODELOS_PADRAO[1].perguntas, blog = MODELOS_PADRAO[2].perguntas
  assert.ok(site.some((p) => p.alerta?.opcoes.includes('Blog')))
  assert.ok(!blog.some((p) => p.alerta))
  assert.ok(blog.some((p) => p.tipo === 'secao' && p.titulo === 'Blog'))
  // tráfego: senhas são cifradas e o CPF também
  const t = MODELOS_PADRAO[0].perguntas
  assert.equal(t.filter((p) => p.tipo === 'senha').length, 4)
  assert.ok(ehSensivel(t.find((p) => p.titulo.startsWith('CPF'))!))
})

test('parsePerguntas: recusa lista vazia, tipo errado, id repetido, escolha sem opção', () => {
  assert.ok('error' in parsePerguntas([]))
  assert.ok('error' in parsePerguntas([{ id: 'a1', tipo: 'xpto', titulo: 'x' }]))
  assert.ok('error' in parsePerguntas([{ id: 'a1', tipo: 'texto', titulo: 'x' }, { id: 'a1', tipo: 'texto', titulo: 'y' }]))
  assert.ok('error' in parsePerguntas([{ id: 'a1', tipo: 'escolha', titulo: 'x', opcoes: ['', '  '] }]))
  assert.ok('error' in parsePerguntas([{ id: 'a1', tipo: 'texto', titulo: '   ' }]))
  assert.ok('error' in parsePerguntas([{ id: 's1', tipo: 'secao', titulo: 'Só título' }]))
})

test('parsePerguntas: limpa opções (vazias, repetidas) e alerta de opção que não existe', () => {
  const r = parsePerguntas([{ id: 'a1', tipo: 'multipla', titulo: ' Páginas ', opcoes: ['Home', '', 'Home', 'Blog'], alerta: { opcoes: ['Blog', 'Loja'], texto: 'Blog muda o valor' }, sensivel: true }])
  assert.ok('perguntas' in r)
  const p = r.perguntas[0]
  assert.equal(p.titulo, 'Páginas')
  assert.deepEqual(p.opcoes, ['Home', 'Blog'])
  assert.deepEqual(p.alerta, { opcoes: ['Blog'], texto: 'Blog muda o valor' })
  // alerta sem texto ou sem opção válida some
  const r2 = parsePerguntas([{ id: 'a1', tipo: 'escolha', titulo: 'x', opcoes: ['A'], alerta: { opcoes: ['Z'], texto: 'aviso' } }])
  assert.ok('perguntas' in r2 && !r2.perguntas[0].alerta)
  // seção não carrega obrigatória
  const r3 = parsePerguntas([{ id: 's1', tipo: 'secao', titulo: 'T', obrigatoria: true }, { id: 'a1', tipo: 'texto', titulo: 'x' }])
  assert.ok('perguntas' in r3 && !r3.perguntas[0].obrigatoria)
})

test('validarRespostas: obrigatórias, e-mail, opção inválida, "Outro" e data', () => {
  const faltando = validarRespostas(P, {})
  assert.ok('erros' in faltando)
  assert.deepEqual(Object.keys(faltando.erros).sort(), ['emp', 'obj'])

  const ruim = validarRespostas(P, { emp: 'X', obj: ['Vendas', 'Inventada'], mail: 'sem-arroba', dia: '25/10/2026' })
  assert.ok('erros' in ruim)
  assert.equal(ruim.erros.obj, 'Opção inválida.')
  assert.equal(ruim.erros.mail, 'E-mail inválido.')
  assert.equal(ruim.erros.dia, 'Data inválida.')

  const ok = validarRespostas(P, { emp: '  Fada  ', obj: ['Leads', `${OUTRO_PREFIXO}Agendamentos`, 'Leads'], gen: 'Mulher', dia: '2026-10-27', extra: 'ignorado', s1: 'x' })
  assert.ok('respostas' in ok)
  assert.deepEqual(ok.respostas, { emp: 'Fada', obj: ['Leads', 'Outro: Agendamentos'], gen: 'Mulher', dia: '2026-10-27' })
  // "Outro" sem texto, ou em pergunta que não aceita, é inválido
  assert.ok('erros' in validarRespostas(P, { emp: 'X', obj: [OUTRO_PREFIXO] }))
  assert.ok('erros' in validarRespostas(P, { emp: 'X', obj: ['Vendas'], gen: 'Outro: Não binário' }))
})

test('alertas e identificação', () => {
  assert.deepEqual(alertasDe(P, { obj: ['Vendas', 'Blog'] }), ['Marcou Blog'])
  assert.deepEqual(alertasDe(P, { obj: ['Vendas'] }), [])
  assert.deepEqual(identificacao(P, { emp: 'Fada dos Pés', mail: 'fabi@x.com' }), { empresa: 'Fada dos Pés', email: 'fabi@x.com' })
  // "E-mail e WhatsApp" numa resposta só: tira o e-mail de dentro
  const q: Pergunta[] = [{ id: 'c', tipo: 'texto', titulo: 'E-mail e WhatsApp', papel: 'email' }]
  assert.equal(identificacao(q, { c: 'fabi@x.com.br / 11 94583-3694' }).email, 'fabi@x.com.br')
  assert.equal(identificacao(q, { c: '11 94583-3694' }).email, undefined)
})

test('texto das respostas mascara senha e CPF; progresso conta só perguntas', () => {
  const txt = respostasEmTexto(P, { emp: 'Fada', cpf: 'enc:v1:abc', pw: 'enc:v1:def', obj: ['Leads'] })
  assert.match(txt, /## Empresa/)
  assert.match(txt, /- Nome da empresa: Fada/)
  assert.match(txt, /- CPF: •+ \(guardado cifrado\)/)
  assert.ok(!txt.includes('enc:v1'))
  assert.ok(!txt.includes('Gênero'), 'pergunta sem resposta não aparece')
  assert.deepEqual(progresso(P, { emp: 'Fada', obj: [], gen: 'Ambos' }), { respondidas: 2, total: 7 })
})

test('slug do nome', () => {
  assert.equal(slugDe('Onboarding · Site + Blog'), 'onboarding-site-blog')
  assert.equal(slugDe('Gestão de Tráfego'), 'gestao-de-trafego')
  assert.equal(slugDe('***'), 'briefing')
})
