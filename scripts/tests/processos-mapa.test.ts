import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PROCESSES, EXIGENCIAS_REMOVIDAS, FRASES_CLIENTE_PADRAO, inferProcessSlug, missingToAdvance, semExigenciasRemovidas,
} from '../../lib/processos'

const seed = (slug: string) => DEFAULT_PROCESSES.find((p) => p.slug === slug)!
const etapa = (slug: string, nome: string) => seed(slug).stages.find((s) => s.name === nome)!

test('mapa: cada serviço do catálogo cai no processo combinado', () => {
  const casos: [string, string][] = [
    ['Apresentação institucional em PPTX editável', 'design'],
    ['Diagramação de e-book', 'design'],
    ['Projeto adicional', 'design'],
    ['Captação e edição · 10 vídeos', 'video'],
    ['Edição de vídeo avulsa', 'video'],
    ['Consultoria comercial', 'consultoria'],
    ['Consultoria de CRM', 'consultoria'],
    ['Consultoria estratégica + Design + SEO/GEO/AEO + Automações e IA', 'consultoria'],
    ['Implementação de CRM', 'crm'],
    ['Pacote CRM + Perfil no Google + Manutenção de sistema', 'crm'],
    ['VEX Sales · plano Essencial', 'crm'],
    ['E-mail marketing e automação', 'email-marketing'],
    ['Gestão de blog', 'artigo-seo'],
    ['SEO Essencial', 'artigo-seo'],
    ['SEO + IA (GEO/AEO)', 'artigo-seo'],
    ['Relatório mensal de SEO', 'seo-relatorio'],
    ['Identidade visual e rebranding', 'logo'],
    ['Landing page', 'landing-page'],
    ['Link da bio (domínio próprio)', 'landing-page'],
    ['Manutenção de Site', 'manutencao-site'],
    ['Manutenção de site WordPress', 'manutencao-site'],
    ['Revitalização da loja Nuvemshop', 'site-apresentacao'],
    ['Site One Page', 'site'],
    ['Site multipage', 'site'],
    ['Web design · criação e manutenção sob demanda', 'site'],
    ['Perfil da Empresa no Google', 'perfil-google'],
    ['Gestão de Tráfego Pago', 'trafego-pago'],
    ['Pacote Meta Ads · gestão de tráfego + 30 criativos', 'trafego-pago'],
    ['Tráfego pago · 2 plataformas', 'trafego-pago'],
  ]
  for (const [nome, slug] of casos) assert.equal(inferProcessSlug(nome), slug, nome)
})

test('mapa: peça de redes continua no processo de conteúdo', () => {
  for (const t of ['post', 'carrossel', 'reels', 'story', 'vídeo', 'pacote mensal', null,
    'Social media · 20 conteúdos', 'Social Media 15 postagens + SEO + Acompanhamento mensal',
    'LinkedIn · 12 posts', 'Thumbnails para YouTube · 2 por mês', 'Criação de artes para mídias sociais · 6 por semana']) {
    assert.equal(inferProcessSlug(t), 'conteudo-redes', String(t))
  }
})

test('mapa: todo processo novo existe, é único e termina numa etapa final só', () => {
  const slugs = DEFAULT_PROCESSES.map((p) => p.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  for (const s of ['site-apresentacao', 'video', 'manutencao-site', 'seo-relatorio', 'perfil-google', 'crm', 'consultoria', 'email-marketing']) {
    assert.ok(slugs.includes(s), s)
    // o construtor exige alguém na primeira etapa; o processo novo já nasce sem pendência
    assert.ok(seed(s).stages[0].role, `${s}: primeira etapa sem responsável`)
  }
  for (const p of DEFAULT_PROCESSES) {
    assert.equal(p.stages.filter((s) => s.kind === 'FINAL').length, 1, p.slug)
    assert.equal(p.stages[p.stages.length - 1].kind, 'FINAL', p.slug)
  }
})

test('mapa: toda frase de aviso aponta para uma etapa que existe e não é a final', () => {
  for (const [slug, frases] of Object.entries(FRASES_CLIENTE_PADRAO)) {
    const p = seed(slug)
    assert.ok(p, `processo ${slug}`)
    for (const nome of Object.keys(frases)) {
      const st = p.stages.find((s) => s.name === nome)
      assert.ok(st, `${slug} › ${nome}`)
      assert.notEqual(st!.kind, 'FINAL', `${slug} › ${nome}`)
    }
  }
  // cada processo novo avisa o cliente em pelo menos uma etapa
  for (const s of ['video', 'manutencao-site', 'seo-relatorio', 'perfil-google', 'crm', 'consultoria', 'email-marketing']) {
    assert.ok(Object.keys(FRASES_CLIENTE_PADRAO[s] ?? {}).length > 0, s)
  }
})

test('mapa: validar o site não pede link (a #245 conclui)', () => {
  const dev = etapa('site-apresentacao', 'Desenvolvimento e ajustes')
  const stage = { id: 's', name: dev.name, kind: dev.kind, fields: dev.fields ?? [], checklist: dev.checklist ?? [], checklistRequired: !!dev.checklistRequired }
  const vazia = { driveLink: null, processData: null, checklistDone: [] }
  assert.deepEqual(missingToAdvance(stage as never, vazia as never), [])
  // como estava: pedia link e travava
  assert.deepEqual(missingToAdvance({ ...stage, fields: ['LINK'] } as never, vazia as never), ['link da entrega'])
})

test('mapa: link só onde existe entregável; as exigências removidas não voltam no padrão', () => {
  for (const r of EXIGENCIAS_REMOVIDAS) {
    const st = etapa(r.slug, r.etapa)
    assert.ok(st, `${r.slug} › ${r.etapa}`)
    for (const c of r.campos) assert.ok(!(st.fields ?? []).includes(c), `${r.slug} › ${r.etapa} ainda pede ${c}`)
  }
  // entregáveis de verdade continuam exigidos
  assert.deepEqual(etapa('conteudo-redes', 'Produção').fields, ['LINK_DRIVE'])
  assert.deepEqual(etapa('site', 'Publicação').fields, ['LINK_PUBLICACAO'])
  assert.deepEqual(etapa('video', 'Edição').fields, ['LINK_DRIVE'])
})

test('mapa: ajuste dos processos antigos só remove a exigência listada e mantém o resto', () => {
  assert.deepEqual(semExigenciasRemovidas('site-apresentacao', 'Desenvolvimento e ajustes', ['LINK']), [])
  assert.deepEqual(semExigenciasRemovidas('trafego-pago', 'Publicação', ['LINK', 'NOTA']), ['NOTA'])
  assert.deepEqual(semExigenciasRemovidas('design', 'Arquivos finais', ['LINK_DRIVE']), [])
  // etapa fora da lista fica intacta
  assert.deepEqual(semExigenciasRemovidas('design', 'Criação', ['LINK_DRIVE']), ['LINK_DRIVE'])
  assert.deepEqual(semExigenciasRemovidas('site', 'Publicação', ['LINK_PUBLICACAO']), ['LINK_PUBLICACAO'])
  assert.deepEqual(semExigenciasRemovidas('outro', 'Desenvolvimento e ajustes', ['LINK']), ['LINK'])
})

test('campos de link: obrigatórios, mas aceitam qualquer texto escrito', () => {
  const st = (fields: string[]) => ({ id: 's', name: 'Produção', kind: 'EXECUCAO', fields, checklist: [], checklistRequired: false }) as never
  const vazia = { driveLink: null, publicationLink: null, processData: null, checklistDone: [] } as never
  // vazio ou só espaço trava
  assert.deepEqual(missingToAdvance(st(['LINK_DRIVE', 'LINK', 'LINK_PUBLICACAO']), vazia, { driveLink: '  ', link: '', publicationLink: undefined }),
    ['link do Google Drive', 'link da entrega', 'link publicado'])
  // qualquer texto libera (não precisa ser https nem do Google Drive)
  assert.deepEqual(missingToAdvance(st(['LINK_DRIVE', 'LINK', 'LINK_PUBLICACAO']), vazia, { driveLink: 'SADA', link: 'pasta do cliente', publicationLink: 'instagram' }), [])
  // o que já está salvo na demanda vale, mesmo com o campo do painel vazio
  const salva = { driveLink: 'enviado no grupo', publicationLink: 'feito', processData: { s: { link: 'ok' } }, checklistDone: [] } as never
  assert.deepEqual(missingToAdvance(st(['LINK_DRIVE', 'LINK', 'LINK_PUBLICACAO']), salva, { driveLink: '', link: '', publicationLink: '' }), [])
})
