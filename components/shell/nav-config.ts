import {
  Painel, Predios, Caixa, Grupo, Tarefa, Calendario, Funil, Quadro,
  Robo, Globo, Carteira, Documento, Historico, Engrenagem, Interrogacao, Rotas, Lista,
} from '@/components/icones/duotone'

/**
 * Fonte única de navegação da Central, no mesmo desenho do painel da VEX
 * Sales: o trilho fica com a OPERAÇÃO — o que se abre todo dia — e o que se
 * ajusta de vez em quando vai para a coluna de Configurações, aberta pela
 * engrenagem no pé.
 *
 * `adminOnly` esconde o destino do colaborador, que acompanha só clientes e
 * as próprias demandas. A checagem de verdade continua no servidor; aqui é
 * para não mostrar porta que não abre.
 */
export type NavItem = {
  href: string
  icon: React.ElementType
  label: string
  /** O que a tela É. Vira a dica ao passar o mouse no trilho. */
  hint: string
  adminOnly?: boolean
  /** O grupo do destino dentro da coluna de Configurações. */
  grupo?: string
}

export type NavSection = {
  label: string
  items: NavItem[]
  /** A seção que não mora no trilho: vira a engrenagem no pé e abre numa
   *  coluna ao lado enquanto a pessoa está numa dessas telas. */
  coluna?: { icone: React.ElementType }
  /** A seção que fica no pé do trilho, acima de Configurações. */
  pe?: boolean
}

export const navSections: NavSection[] = [
  {
    label: 'Acompanhar',
    items: [
      { href: '/dashboard', icon: Painel, label: 'Dashboard', hint: 'o retrato do mês: caixa, recebimentos e o que pede atenção' },
      { href: '/clientes', icon: Predios, label: 'Clientes', hint: 'quem a VEX atende, com contrato e histórico' },
      { href: '/financeiro', icon: Carteira, label: 'Financeiro', hint: 'cobranças, notas fiscais e o caixa da empresa' },
    ],
  },
  {
    label: 'Produzir',
    items: [
      { href: '/demandas', icon: Tarefa, label: 'Demandas', hint: 'o que a equipe precisa entregar' },
      { href: '/calendario', icon: Calendario, label: 'Calendário', hint: 'entregas e publicações, dia a dia' },
      { href: '/processos', icon: Rotas, label: 'Processos', hint: 'as rotas de etapas de cada tipo de entrega: site, LP, logo, conteúdo', adminOnly: true },
    ],
  },
  {
    label: 'Vender',
    items: [
      { href: '/crm', icon: Funil, label: 'CRM', hint: 'as conversas com quem ainda não é cliente', adminOnly: true },
      { href: '/pipeline', icon: Quadro, label: 'Pipeline', hint: 'as propostas em aberto, coluna a coluna', adminOnly: true },
      { href: '/propostas', icon: Documento, label: 'Propostas', hint: 'contratos e aditivos gerados', adminOnly: true },
      { href: '/briefings', icon: Lista, label: 'Briefings', hint: 'o formulário de cada produto: o link vai para o cliente e a resposta cai aqui', adminOnly: true },
    ],
  },
  {
    label: 'Automatizar',
    items: [
      { href: '/agentes', icon: Robo, label: 'Agentes', hint: 'os assistentes que vigiam o financeiro e a operação', adminOnly: true },
      { href: '/seo', icon: Globo, label: 'SEO', hint: 'posição no Google e o que o Search Console mostra', adminOnly: true },
    ],
  },
  {
    label: 'Suporte',
    pe: true,
    items: [
      { href: '/logs', icon: Historico, label: 'Logs', hint: 'o que o sistema fez: integrações, envios e erros', adminOnly: true },
    ],
  },
  {
    label: 'Configurações',
    coluna: { icone: Engrenagem },
    items: [
      { href: '/servicos', icon: Caixa, label: 'Serviços', hint: 'o catálogo e os preços de tabela', adminOnly: true, grupo: 'Operação' },
      { href: '/colaboradores', icon: Grupo, label: 'Equipe', hint: 'quem acessa a Central e o que cada um vê', adminOnly: true, grupo: 'Operação' },
    ],
  },
]

export const TITULOS: Record<string, { titulo: string }> = {
  '/dashboard': { titulo: 'Dashboard' },
  '/clientes': { titulo: 'Clientes' },
  '/financeiro': { titulo: 'Financeiro' },
  '/demandas': { titulo: 'Demandas' },
  '/calendario': { titulo: 'Calendário' },
  '/crm': { titulo: 'CRM' },
  '/pipeline': { titulo: 'Pipeline' },
  '/propostas': { titulo: 'Propostas' },
  '/briefings': { titulo: 'Briefings' },
  '/agentes': { titulo: 'Agentes' },
  '/seo': { titulo: 'SEO' },
  '/logs': { titulo: 'Logs' },
  '/servicos': { titulo: 'Serviços' },
  '/colaboradores': { titulo: 'Equipe' },
}

/** O item do trilho correspondente à rota atual, com a seção em que ele mora. */
export function itemAtivo(pathname: string, secoes: NavSection[] = navSections) {
  for (const secao of secoes) {
    for (const item of secao.items) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) return { item, secao }
    }
  }
  return null
}
