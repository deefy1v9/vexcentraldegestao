/**
 * Briefings: regras puras (sem banco). O admin monta as perguntas de cada
 * briefing; o cliente responde por um link público. Aqui ficam o formato das
 * perguntas, a validação do que o admin salva e do que o cliente envia, os
 * alertas (ex.: marcou Blog no briefing de site) e os modelos que a Central
 * cria na primeira vez. Testado em scripts/tests/briefing-core.test.ts.
 */

export const TIPOS_PERGUNTA = ['secao', 'texto', 'paragrafo', 'escolha', 'multipla', 'data', 'hora', 'email', 'telefone', 'senha'] as const
export type TipoPergunta = (typeof TIPOS_PERGUNTA)[number]

export const TIPO_LABEL: Record<TipoPergunta, string> = {
  secao: 'Título de seção',
  texto: 'Resposta curta',
  paragrafo: 'Parágrafo',
  escolha: 'Uma opção',
  multipla: 'Várias opções',
  data: 'Data',
  hora: 'Horário',
  email: 'E-mail',
  telefone: 'Telefone / WhatsApp',
  senha: 'Senha (guardada cifrada)',
}

/** Para que a Central use a resposta: achar o cliente e mostrar quem respondeu. */
export const PAPEIS = ['empresa', 'nome', 'email', 'cnpj', 'telefone'] as const
export type Papel = (typeof PAPEIS)[number]

export const PAPEL_LABEL: Record<Papel, string> = {
  empresa: 'Nome da empresa',
  nome: 'Nome do responsável',
  email: 'E-mail',
  cnpj: 'CNPJ',
  telefone: 'Telefone',
}

export interface Pergunta {
  id: string
  tipo: TipoPergunta
  titulo: string
  ajuda?: string
  obrigatoria?: boolean
  /** escolha / multipla */
  opcoes?: string[]
  /** escolha / multipla: aceita "Outro" com texto livre */
  outro?: boolean
  /** Cifrada no banco e escondida na tela até alguém pedir para ver (senha, CPF) */
  sensivel?: boolean
  papel?: Papel
  /** Quando a pessoa marca uma destas opções, a resposta chega com o aviso */
  alerta?: { opcoes: string[]; texto: string }
}

export type Valor = string | string[]
export type Respostas = Record<string, Valor>

const LIMITE_PERGUNTAS = 150
const LIMITE_OPCOES = 60
const LIMITE_RESPOSTA = 5000
export const OUTRO_PREFIXO = 'Outro: '

const limpa = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Sensível de verdade: senha sempre é, os outros tipos quando o admin marca. */
export const ehSensivel = (p: Pick<Pergunta, 'tipo' | 'sensivel'>) => p.tipo === 'senha' || !!p.sensivel

/** Valida e normaliza a lista de perguntas que o admin salvou. */
export function parsePerguntas(raw: unknown): { perguntas: Pergunta[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: 'Lista de perguntas inválida.' }
  if (raw.length === 0) return { error: 'O briefing precisa de pelo menos uma pergunta.' }
  if (raw.length > LIMITE_PERGUNTAS) return { error: `No máximo ${LIMITE_PERGUNTAS} perguntas por briefing.` }
  const ids = new Set<string>()
  const perguntas: Pergunta[] = []
  for (const [i, item] of raw.entries()) {
    const r = (item ?? {}) as Record<string, unknown>
    const n = i + 1
    const tipo = r.tipo as TipoPergunta
    if (!TIPOS_PERGUNTA.includes(tipo)) return { error: `Pergunta ${n}: tipo inválido.` }
    const id = limpa(r.id, 40)
    if (!/^[a-zA-Z0-9_-]{2,40}$/.test(id)) return { error: `Pergunta ${n}: identificador inválido.` }
    if (ids.has(id)) return { error: `Pergunta ${n}: identificador repetido.` }
    ids.add(id)
    const titulo = limpa(r.titulo, 300)
    if (!titulo) return { error: `Pergunta ${n}: escreva o texto da pergunta.` }
    const p: Pergunta = { id, tipo, titulo }
    const ajuda = limpa(r.ajuda, 600)
    if (ajuda) p.ajuda = ajuda
    if (tipo !== 'secao') {
      if (r.obrigatoria) p.obrigatoria = true
      if (r.sensivel && tipo !== 'senha') p.sensivel = true
      const papel = r.papel as Papel
      if (papel && PAPEIS.includes(papel)) p.papel = papel
    }
    if (tipo === 'escolha' || tipo === 'multipla') {
      const opcoes = Array.isArray(r.opcoes) ? r.opcoes.map((o) => limpa(o, 200)).filter(Boolean) : []
      const unicas = [...new Set(opcoes)]
      if (unicas.length === 0) return { error: `"${titulo}": coloque pelo menos uma opção.` }
      if (unicas.length > LIMITE_OPCOES) return { error: `"${titulo}": no máximo ${LIMITE_OPCOES} opções.` }
      p.opcoes = unicas
      if (r.outro) p.outro = true
      const al = (r.alerta ?? null) as { opcoes?: unknown; texto?: unknown } | null
      const texto = limpa(al?.texto, 300)
      const alvo = Array.isArray(al?.opcoes) ? al!.opcoes.map((o) => limpa(o, 200)).filter((o) => unicas.includes(o)) : []
      if (texto && alvo.length) p.alerta = { opcoes: [...new Set(alvo)], texto }
    }
    perguntas.push(p)
  }
  if (!perguntas.some((p) => p.tipo !== 'secao')) return { error: 'O briefing precisa de pelo menos uma pergunta (não só títulos).' }
  return { perguntas }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const DATA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^\d{2}:\d{2}$/

/** Opção marcada é válida: está na lista, ou é "Outro: texto" quando a pergunta aceita. */
function opcaoValida(p: Pergunta, v: string): boolean {
  if (p.opcoes?.includes(v)) return true
  return !!p.outro && v.startsWith(OUTRO_PREFIXO) && v.length > OUTRO_PREFIXO.length
}

/**
 * Confere o que o cliente enviou contra as perguntas. Devolve só as respostas
 * de perguntas que existem (o resto é ignorado), já limpas, ou os erros por
 * pergunta para a tela mostrar.
 */
export function validarRespostas(perguntas: Pergunta[], raw: unknown): { respostas: Respostas } | { erros: Record<string, string> } {
  const entrada = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const respostas: Respostas = {}
  const erros: Record<string, string> = {}
  for (const p of perguntas) {
    if (p.tipo === 'secao') continue
    const bruto = entrada[p.id]
    if (p.tipo === 'multipla') {
      const lista = Array.isArray(bruto) ? [...new Set(bruto.map((v) => limpa(v, 600)).filter(Boolean))] : []
      if (lista.some((v) => !opcaoValida(p, v))) { erros[p.id] = 'Opção inválida.'; continue }
      if (lista.length) respostas[p.id] = lista
      else if (p.obrigatoria) erros[p.id] = 'Marque pelo menos uma opção.'
      continue
    }
    const v = limpa(bruto, LIMITE_RESPOSTA)
    if (!v) { if (p.obrigatoria) erros[p.id] = 'Resposta obrigatória.'; continue }
    if (p.tipo === 'escolha' && !opcaoValida(p, v)) { erros[p.id] = 'Opção inválida.'; continue }
    if (p.tipo === 'email' && !EMAIL.test(v)) { erros[p.id] = 'E-mail inválido.'; continue }
    if (p.tipo === 'data' && !DATA.test(v)) { erros[p.id] = 'Data inválida.'; continue }
    if (p.tipo === 'hora' && !HORA.test(v)) { erros[p.id] = 'Horário inválido.'; continue }
    if (p.tipo === 'telefone' && v.replace(/\D/g, '').length < 8) { erros[p.id] = 'Telefone inválido.'; continue }
    respostas[p.id] = v
  }
  return Object.keys(erros).length ? { erros } : { respostas }
}

/** Avisos disparados pelas opções marcadas (ex.: "Marcou Blog: o valor muda"). */
export function alertasDe(perguntas: Pergunta[], respostas: Respostas): string[] {
  const avisos: string[] = []
  for (const p of perguntas) {
    if (!p.alerta) continue
    const v = respostas[p.id]
    const marcadas = Array.isArray(v) ? v : v ? [v] : []
    if (marcadas.some((m) => p.alerta!.opcoes.includes(m)) && !avisos.includes(p.alerta.texto)) avisos.push(p.alerta.texto)
  }
  return avisos
}

/** Empresa, nome, e-mail, CNPJ e telefone de quem respondeu, pelos papéis das perguntas. */
export function identificacao(perguntas: Pergunta[], respostas: Respostas): Partial<Record<Papel, string>> {
  const id: Partial<Record<Papel, string>> = {}
  for (const p of perguntas) {
    const v = respostas[p.id]
    if (p.papel && typeof v === 'string' && v && !id[p.papel]) id[p.papel] = v
  }
  // "E-mail e WhatsApp" numa pergunta só: tira o e-mail de dentro do texto
  if (id.email && !EMAIL.test(id.email)) {
    const achado = id.email.match(/[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}/)
    if (achado) id.email = achado[0]
    else delete id.email
  }
  return id
}

export const soDigitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '')

/** Uma linha por pergunta respondida. Sensível sai mascarado, a menos que `revelar`. */
export function respostasEmTexto(
  perguntas: Pergunta[],
  respostas: Record<string, unknown>,
  opcoes: { revelar?: (valorCifrado: string) => string } = {},
): string {
  const linhas: string[] = []
  for (const p of perguntas) {
    if (p.tipo === 'secao') { linhas.push(`\n## ${p.titulo}`); continue }
    const v = respostas[p.id]
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue
    let texto = Array.isArray(v) ? v.join(', ') : String(v)
    if (ehSensivel(p)) texto = opcoes.revelar ? opcoes.revelar(texto) : '•••••• (guardado cifrado)'
    linhas.push(`- ${p.titulo}: ${texto}`)
  }
  return linhas.join('\n').trim()
}

/** Quantas perguntas (não seções) foram respondidas. */
export function progresso(perguntas: Pergunta[], respostas: Record<string, unknown>): { respondidas: number; total: number } {
  const reais = perguntas.filter((p) => p.tipo !== 'secao')
  const respondidas = reais.filter((p) => {
    const v = respostas[p.id]
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ''
  }).length
  return { respondidas, total: reais.length }
}

/* ─────────────────────────── modelos iniciais ─────────────────────────── */

type Rascunho = Omit<Pergunta, 'id'> & { id?: string }

function comIds(prefixo: string, lista: Rascunho[]): Pergunta[] {
  return lista.map((p, i) => ({ ...p, id: p.id ?? `${prefixo}${String(i + 1).padStart(2, '0')}` }))
}

const sec = (titulo: string, ajuda?: string): Rascunho => ({ tipo: 'secao', titulo, ...(ajuda ? { ajuda } : {}) })

const TRAFEGO: Rascunho[] = [
  sec('Dados da empresa'),
  { tipo: 'texto', titulo: 'Razão Social (Nome da empresa)', obrigatoria: true, papel: 'empresa' },
  { tipo: 'email', titulo: 'E-mail de contato', obrigatoria: true, papel: 'email' },
  { tipo: 'texto', titulo: 'CNPJ', papel: 'cnpj' },
  { tipo: 'texto', titulo: 'Nome completo do responsável', obrigatoria: true, papel: 'nome' },
  { tipo: 'texto', titulo: 'CPF do responsável', obrigatoria: true, sensivel: true },
  { tipo: 'telefone', titulo: 'WhatsApp para contato', obrigatoria: true, papel: 'telefone' },
  { tipo: 'texto', titulo: 'CEP' },
  { tipo: 'texto', titulo: 'Endereço completo (Rua, bairro e complemento)' },
  { tipo: 'texto', titulo: 'Cidade' },
  sec('Campanhas'),
  { tipo: 'paragrafo', titulo: 'Quais cidades/regiões devemos ativar o tráfego?', obrigatoria: true },
  {
    tipo: 'escolha', titulo: 'Qual o valor mensal planejado para investimento em anúncios?', obrigatoria: true,
    opcoes: ['Até R$ 1.000', 'R$ 1.001 - R$ 3.000', 'R$ 3.001 - R$ 5.000', 'R$ 5.001 - R$ 10.000', 'Acima de R$ 10.000'],
  },
  {
    tipo: 'multipla', titulo: 'Intenções/Objetivo principal com o tráfego', obrigatoria: true,
    opcoes: ['Vendas diretas', 'Geração de Leads', 'Engajamento nas redes', 'Fortalecimento de marca', 'Aumento de seguidores', 'Mais visualizações'],
  },
  { tipo: 'texto', titulo: 'Idade média dos seus clientes. Ex: 35-65+', obrigatoria: true },
  { tipo: 'escolha', titulo: 'Gênero predominante do seu público-alvo', opcoes: ['Homem', 'Mulher', 'Ambos'] },
  { tipo: 'escolha', titulo: 'Forma de pagamento dos anúncios', opcoes: ['Cartão de Crédito', 'Boleto Bancário', 'PIX'] },
  sec('Configurações de acesso', 'Os acessos ficam guardados de forma cifrada e só a equipe da VEX vê.'),
  { tipo: 'texto', titulo: 'Configurações de Acesso (Login - Facebook)', obrigatoria: true },
  { tipo: 'senha', titulo: 'Configurações de Acesso (Senha - Facebook)', obrigatoria: true },
  { tipo: 'texto', titulo: 'Configurações de Acesso (Login - Instagram)', obrigatoria: true },
  { tipo: 'senha', titulo: 'Configurações de Acesso (Senha - Instagram)', obrigatoria: true },
  { tipo: 'texto', titulo: 'Configurações de Acesso (Login - Google)' },
  { tipo: 'senha', titulo: 'Configurações de Acesso (Senha - Google)' },
  { tipo: 'texto', titulo: 'Configurações de Acesso (Login - TikTok)' },
  { tipo: 'senha', titulo: 'Configurações de Acesso (Senha - TikTok)' },
]

const AVISO_BLOG = 'Marcou Blog: site com blog tem outro valor (usar o briefing "Site + Blog").'

function siteBase(comBlog: boolean): Rascunho[] {
  const paginas = ['Home', 'Sobre a Empresa', 'Serviços', 'Produtos', 'Página individual de serviço', 'Página individual de produto', 'Portfólio', 'Clientes e Cases', 'Blog', 'Depoimentos', 'FAQ', 'Trabalhe Conosco', 'Contato', 'Orçamento', 'Área do Cliente', 'Login', 'Loja Virtual']
  const funcionalidades = ['Formulário de contato', 'WhatsApp', 'Solicitação de orçamento', 'Blog', 'Portfólio', 'Depoimentos', 'Google Maps', 'Redes sociais', 'Área de login', 'Área do cliente', 'Agendamento', 'Loja virtual', 'Download de catálogos e PDFs']
  const alertaBlog = comBlog ? {} : { alerta: { opcoes: ['Blog'], texto: AVISO_BLOG } }
  return [
    sec('Sobre a empresa'),
    { tipo: 'texto', titulo: 'Nome da empresa', obrigatoria: true, papel: 'empresa' },
    { tipo: 'texto', titulo: 'Nome do responsável', obrigatoria: true, papel: 'nome' },
    { tipo: 'texto', titulo: 'E-mail e WhatsApp', obrigatoria: true, papel: 'email' },
    { tipo: 'escolha', titulo: 'A empresa já possui site? Se sim, informe o link.', opcoes: ['Sim', 'Não', 'Em desenvolvimento'], outro: true, ajuda: 'Se tiver site, escolha "Outro" e cole o link.' },
    { tipo: 'paragrafo', titulo: 'Conte brevemente a história da empresa' },
    { tipo: 'paragrafo', titulo: 'Quais são os principais diferenciais da empresa?' },
    { tipo: 'escolha', titulo: 'A empresa trabalha com', opcoes: ['Serviços', 'Produtos', 'Ambos'], outro: true },
    { tipo: 'paragrafo', titulo: 'Descreva os principais serviços ou produtos que devem aparecer no site' },
    { tipo: 'paragrafo', titulo: 'Existe algum serviço ou produto que deve receber maior destaque?' },
    { tipo: 'paragrafo', titulo: 'Como funciona a contratação ou compra? Exemplo: WhatsApp, orçamento, reunião, compra online' },
    { tipo: 'paragrafo', titulo: 'Descreva o público-alvo da empresa' },
    sec('Objetivo do site'),
    {
      tipo: 'multipla', titulo: 'Qual é o objetivo do site?', outro: true,
      opcoes: ['Apresentar a empresa', 'Gerar contatos', 'Gerar orçamentos', 'Vender', 'Apresentar serviços', 'Apresentar produtos', 'Aumentar autoridade', 'Melhorar presença no Google', 'Direcionar para WhatsApp'],
    },
    { tipo: 'escolha', titulo: 'Qual ação principal o visitante deve realizar?', outro: true, opcoes: ['WhatsApp', 'Solicitar orçamento', 'Preencher formulário', 'Comprar', 'Agendar reunião', 'Conhecer serviços'] },
    sec('Concorrentes e referências'),
    { tipo: 'paragrafo', titulo: 'Quais são os principais concorrentes? Informe nomes e links dos sites ou redes sociais' },
    { tipo: 'paragrafo', titulo: 'Existe algum concorrente cujo site seja uma boa referência? Informe o link e o que gosta nele' },
    { tipo: 'paragrafo', titulo: 'Existe algo nos sites dos concorrentes que você não gostaria de ter?' },
    sec('Páginas e conteúdo'),
    { tipo: 'multipla', titulo: 'Quais páginas você deseja?', outro: true, opcoes: paginas, ...alertaBlog },
    { tipo: 'texto', titulo: 'Existe alguma página específica não citada?' },
    {
      tipo: 'multipla', titulo: 'O que deseja apresentar em Sobre a Empresa?',
      opcoes: ['História', 'Missão', 'Visão', 'Valores', 'Equipe', 'Estrutura', 'Certificações', 'Anos de experiência', 'Clientes atendidos', 'Regiões atendidas', 'Diferenciais'],
    },
    { tipo: 'escolha', titulo: 'Como deseja apresentar serviços e produtos?', opcoes: ['Uma página com todos', 'Página principal mais páginas individuais', 'Apenas os principais', 'Quero recomendação'] },
    sec('Identidade visual'),
    { tipo: 'multipla', titulo: 'Quais materiais possui?', opcoes: ['Logotipo', 'Manual da marca', 'Paleta de cores', 'Fontes', 'Materiais de redes sociais', 'Ainda não possuo identidade visual'] },
    { tipo: 'paragrafo', titulo: 'Liste sites que gosta e gostaria de usar como referência. Informe links e o que chamou atenção' },
    { tipo: 'multipla', titulo: 'O que o visual deve transmitir?', outro: true, opcoes: ['Modernidade', 'Tecnologia', 'Sofisticação', 'Confiança', 'Segurança', 'Autoridade', 'Tradição', 'Minimalismo', 'Criatividade', 'Inovação'] },
    { tipo: 'escolha', titulo: 'Qual estilo prefere?', opcoes: ['Minimalista', 'Tecnológico', 'Corporativo', 'Sofisticado', 'Criativo', 'Não sei, quero recomendação'] },
    { tipo: 'escolha', titulo: 'Você possui fotos da equipe, produtos, projetos ou espaço físico?', opcoes: ['Tenho tudo', 'Tenho parte', 'Não possuo', 'Quero produzir novas fotos'] },
    { tipo: 'escolha', titulo: 'Quem fornecerá os textos?', opcoes: ['Já possuo', 'Vou fornecer', 'Tenho parte', 'Quero que sejam desenvolvidos', 'Ainda não sei'] },
    sec('Funcionalidades'),
    { tipo: 'multipla', titulo: 'Quais funcionalidades são essenciais?', outro: true, opcoes: funcionalidades, ...alertaBlog },
    ...(comBlog ? [
      sec('Blog'),
      { tipo: 'paragrafo', titulo: 'Quais assuntos o blog deve abordar?', obrigatoria: true, ajuda: 'Temas, dúvidas frequentes dos clientes, serviços que quer divulgar.' },
      { tipo: 'paragrafo', titulo: 'Em quais buscas do Google você quer aparecer?', ajuda: 'Ex.: "podólogo em São Paulo", "unha encravada tratamento".' },
      { tipo: 'escolha', titulo: 'Quem vai escrever os artigos?', obrigatoria: true, opcoes: ['A VEX', 'A nossa equipe', 'Os dois'] },
      { tipo: 'escolha', titulo: 'Com que frequência quer publicar?', opcoes: ['1 por semana', '2 por semana', '4 por mês', 'Quero recomendação'] },
      { tipo: 'escolha', titulo: 'Já tem artigos ou conteúdos prontos para o blog?', opcoes: ['Sim', 'Alguns', 'Não'] },
    ] as Rascunho[] : []),
    sec('Reunião de alinhamento'),
    { tipo: 'data', titulo: 'Data preferencial' },
    { tipo: 'hora', titulo: 'Horário preferencial' },
    { tipo: 'paragrafo', titulo: 'Informações adicionais sobre o projeto' },
  ]
}

export interface ModeloBriefing { slug: string; name: string; description: string; perguntas: Pergunta[] }

/** O que a Central cria se ainda não existir nenhum briefing com o slug. */
export const MODELOS_PADRAO: ModeloBriefing[] = [
  {
    slug: 'trafego', name: 'Onboarding · Gestão de Tráfego',
    description: 'Preencha este formulário para iniciarmos a configuração da sua conta e o planejamento das campanhas.',
    perguntas: comIds('t', TRAFEGO),
  },
  {
    slug: 'site', name: 'Onboarding · Desenvolvimento de Website',
    description: 'Preencha este formulário para que possamos entender melhor sua empresa, público, serviços ou produtos, concorrentes, referências e necessidades. As respostas serão usadas para planejar a estrutura, conteúdo, design e funcionalidades do novo site.',
    perguntas: comIds('s', siteBase(false)),
  },
  {
    slug: 'site-blog', name: 'Onboarding · Website com Blog',
    description: 'Preencha este formulário para planejarmos o seu novo site e o blog: estrutura, conteúdo, design, funcionalidades e os assuntos dos artigos.',
    perguntas: comIds('b', siteBase(true)),
  },
]

/** Slug a partir do nome: "Site + Blog" → "site-blog". */
export function slugDe(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'briefing'
}
