/**
 * Modelo oficial da proposta comercial da VEX.
 *
 * Estrutura extraída do documento aprovado pela agência: mesma ordem de
 * páginas, mesmos títulos, mesmas cláusulas. Os textos jurídicos e
 * institucionais estão reproduzidos aqui como estão no modelo — só os dados
 * do tomador viraram placeholders `{{campo}}`, resolvidos de forma
 * determinística (lib/proposal-core → renderTemplate), sem IA.
 *
 * O conteúdo é versionado em ProposalTemplate.content: alterar o modelo cria
 * uma nova versão e as propostas antigas continuam com o texto original.
 */

export interface TemplateBlock {
  kind: 'cover' | 'index' | 'heading' | 'subheading' | 'paragraph' | 'bullets' | 'infoTable' | 'services' | 'totals' | 'payment' | 'signature' | 'addendum' | 'pageBreak'
  text?: string
  items?: string[]
  rows?: Array<[string, string]>
  /** Bloco só entra no documento quando a condição for verdadeira. */
  onlyFor?: 'PROPOSTA' | 'ADITIVO'
}

export interface ProposalTemplateContent {
  title: string
  subtitle: string
  blocks: TemplateBlock[]
}

/** Dados da prestadora — fixos no modelo, nunca vêm do formulário. */
export const VEX = {
  legalName: 'VEX PERFORMANCE DIGITAL',
  cnpj: '68.652.648/0001-86',
  representative: 'Davi Vieira Venturato Fernandes',
  representativeCpf: '125.924.846-12',
  representativeRole: 'Sócio',
  address: 'Rua Joao Samaha, 131, cidade de Belo Horizonte, Estado de Minas Gerais, CEP 31.520-100',
  email: 'contato@vexgrowth.com.br',
  phone: '(31) 99146-5195',
  forum: 'Belo Horizonte/MG',
  bank: '0260 - Nubank',
  agency: '0001',
  account: '106839861-2',
  pixKey: '68.652.648/0001-86',
} as const

export const DEFAULT_TEMPLATE_NAME = 'Proposta comercial VEX'
export const DEFAULT_TEMPLATE_VERSION = 1

export const DEFAULT_TEMPLATE: ProposalTemplateContent = {
  title: 'PROPOSTA COMERCIAL',
  subtitle: 'Serviços de Marketing Digital.',
  blocks: [
    /* ------------------------------ capa ------------------------------ */
    { kind: 'cover' },
    {
      kind: 'infoTable',
      rows: [
        ['CLIENTE', '{{cliente_nome}}'],
        ['RESPONSÁVEL', '{{cliente_responsavel}}'],
        ['EMPRESA PRESTADORA', VEX.legalName],
        ['CNPJ', VEX.cnpj],
        ['DATA', '{{data_proposta}}'],
      ],
    },
    { kind: 'subheading', text: 'Resumo da contratação' },
    { kind: 'totals' },
    { kind: 'pageBreak' },

    /* ----------------------------- índice ----------------------------- */
    { kind: 'index', text: 'ÍNDICE' },
    { kind: 'pageBreak' },

    /* ---------------------------- contrato ---------------------------- */
    { kind: 'heading', text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARKETING DIGITAL' },
    { kind: 'paragraph', text: 'Pelo presente instrumento particular, de um lado:' },
    {
      kind: 'paragraph',
      text: '{{cliente_nome_maiusculo}}, {{cliente_qualificacao}}, e-mail {{cliente_email}}; doravante denominada CONTRATANTE.',
    },
    { kind: 'paragraph', text: 'E, de outro lado:' },
    {
      kind: 'paragraph',
      text: `${VEX.legalName}, inscrita no CNPJ nº ${VEX.cnpj}, neste ato representada por ${VEX.representative}, inscrito no CPF nº ${VEX.representativeCpf}, com sede à ${VEX.address}, e-mail ${VEX.email}, telefone/WhatsApp ${VEX.phone}, doravante denominada CONTRATADA;`,
    },
    {
      kind: 'paragraph',
      text: 'Têm entre si justo e contratado o presente Contrato de Prestação de Serviços, que será regido pelas cláusulas e condições abaixo.',
    },

    { kind: 'heading', text: '1. OBJETO DA PROPOSTA' },
    {
      kind: 'paragraph',
      text: '1.1. O presente contrato tem como objeto a prestação dos serviços descritos neste instrumento para a CONTRATANTE, conforme escopo detalhado na cláusula 2.',
    },
    {
      kind: 'paragraph',
      text: '1.2. Os serviços serão executados de acordo com o escopo descrito neste contrato, não estando inclusos serviços não mencionados expressamente neste documento, salvo mediante novo orçamento e aprovação entre as partes.',
    },

    { kind: 'heading', text: '2. SERVIÇOS CONTRATADOS' },
    { kind: 'services' },

    { kind: 'heading', text: '3. CONDIÇÕES DA PRESTAÇÃO DOS SERVIÇOS' },
    {
      kind: 'paragraph',
      text: '3.1. Os serviços serão executados de forma remota, mediante alinhamentos realizados por WhatsApp, e-mail, Google Drive, reuniões online ou outros canais definidos entre as partes.',
    },
    {
      kind: 'paragraph',
      text: '3.2. A execução dos serviços será realizada de forma colaborativa, com troca de informações entre CONTRATANTE e CONTRATADA, buscando manter comunicação clara, organizada e amigável.',
    },
    {
      kind: 'paragraph',
      text: '3.3. A execução dos serviços dependerá do envio, pela CONTRATANTE, das informações necessárias, conteúdos, imagens, textos, referências, medidas, aprovações e direcionamentos.',
    },
    {
      kind: 'paragraph',
      text: '3.4. Os prazos de execução e a continuidade das entregas poderão ser impactados caso a CONTRATANTE atrase o envio de materiais, informações, imagens, textos, aprovações ou validações necessárias.',
    },
    {
      kind: 'paragraph',
      text: '3.5. Serviços não descritos nesta proposta poderão ser orçados separadamente, caso solicitados pela CONTRATANTE.',
    },

    { kind: 'heading', text: '4. OBRIGAÇÕES DA CONTRATANTE' },
    {
      kind: 'paragraph',
      text: '4.1. A CONTRATANTE é responsável por garantir que os arquivos, imagens, textos, marcas, fotos, logotipos e informações enviados para uso estejam autorizados e não violem direitos de terceiros.',
    },
    { kind: 'paragraph', text: '4.2. Realizar os pagamentos conforme os valores e vencimentos previstos neste contrato.' },

    { kind: 'heading', text: '5. OBRIGAÇÕES DA CONTRATADA' },
    { kind: 'paragraph', text: 'São obrigações da CONTRATADA:' },
    {
      kind: 'bullets',
      items: [
        'Executar os serviços contratados conforme o escopo descrito nesta proposta;',
        'Solicitar materiais, informações, referências e aprovações necessárias para a execução dos serviços;',
        'Manter comunicação clara sobre prazos, necessidades, limitações técnicas e andamento das atividades;',
        'Zelar pela confidencialidade das informações recebidas;',
        'Aplicar boas práticas criativas, visuais e operacionais na execução dos serviços, sem garantia de resultados comerciais específicos.',
      ],
    },

    { kind: 'heading', text: '6. PRAZOS, VIGÊNCIA E RECORRÊNCIA' },
    { kind: 'paragraph', text: '6.1. O presente contrato refere-se à entrega dos serviços contratados, iniciando-se em {{data_inicio}}.' },
    {
      kind: 'paragraph',
      text: '6.2. Após o término da vigência inicial, o contrato será renovado automaticamente por prazo indeterminado, permanecendo válidas as condições contratadas, salvo manifestação contrária de qualquer uma das partes com antecedência mínima de 30 dias.',
    },

    { kind: 'heading', text: '7. VALORES E CONDIÇÕES DE PAGAMENTO' },
    { kind: 'subheading', text: '7.1. Valores contratados' },
    { kind: 'payment' },
    {
      kind: 'paragraph',
      text: '7.7. Qualquer serviço solicitado além do escopo contratado será considerado serviço adicional e deverá ser orçado separadamente.',
    },
    {
      kind: 'paragraph',
      text: '7.8. O pagamento poderá ser realizado via PIX, transferência bancária, boleto bancário ou cartão de crédito, sujeito à taxa da operadora, se aplicável.',
    },
    { kind: 'subheading', text: 'Dados de pagamento' },
    {
      kind: 'infoTable',
      rows: [
        ['Banco', VEX.bank],
        ['Agência', VEX.agency],
        ['Conta', VEX.account],
        ['Chave PIX', VEX.pixKey],
      ],
    },

    { kind: 'heading', text: '8. REAJUSTES, ESCOPO E SERVIÇOS EXTRAS' },
    { kind: 'paragraph', text: '8.1. Os valores previstos nesta proposta são válidos exclusivamente para o escopo descrito neste contrato.' },
    {
      kind: 'paragraph',
      text: '8.2. Qualquer demanda não prevista no escopo contratado será considerada serviço adicional e poderá ser orçada separadamente.',
    },
    { kind: 'paragraph', text: '8.3. Consideram-se serviços adicionais, entre outros:' },
    {
      kind: 'bullets',
      items: [
        'Criação de identidade visual completa;',
        'Criação de logotipo;',
        'Criação de site;',
        'Landing pages;',
        'Gestão completa de redes sociais;',
        'Publicação de posts nas redes sociais;',
        'Criação de calendário editorial completo;',
        'Planejamento estratégico mensal aprofundado;',
        'Copywriting avançado;',
        'Verba de mídia paga diretamente às plataformas de anúncios;',
        'Fotografia profissional;',
        'Captação presencial de fotos ou vídeos;',
        'Criação de campanhas especiais não previstas no escopo;',
        'Compra de imagens, fontes, bancos de imagem, ferramentas pagas, licenças ou qualquer recurso externo necessário para execução das demandas.',
      ],
    },
    {
      kind: 'paragraph',
      text: '8.4. Demandas extras somente serão iniciadas após orçamento, aprovação da CONTRATANTE e definição das condições de pagamento.',
    },
    {
      kind: 'paragraph',
      text: '8.5. Caso algum serviço seja cancelado, suspenso, ampliado, reduzido ou alterado, os valores poderão ser recalculados de acordo com o novo escopo.',
    },
    {
      kind: 'paragraph',
      text: '8.6. Eventuais reajustes, alterações de valores, prazos ou condições poderão ser negociados entre as partes e deverão ser formalizados por escrito.',
    },

    { kind: 'heading', text: '9. INADIMPLÊNCIA' },
    { kind: 'paragraph', text: '9.1. O não pagamento dos valores contratados na data acordada poderá implicar a suspensão dos serviços.' },
    {
      kind: 'paragraph',
      text: '9.2. Em caso de atraso superior a 5 dias corridos, a CONTRATADA poderá pausar a gestão de campanhas, acompanhamentos e demais atividades em andamento.',
    },
    { kind: 'paragraph', text: '9.3. Os serviços serão retomados somente após a regularização integral dos valores pendentes.' },
    {
      kind: 'paragraph',
      text: '9.4. A suspensão dos serviços por inadimplência não isenta a CONTRATANTE do pagamento dos valores já vencidos, proporcionais ou referentes a serviços já executados.',
    },
    {
      kind: 'paragraph',
      text: '9.5. Caso existam valores pendentes, a CONTRATADA poderá reter a entrega de arquivos finais ainda não enviados até a regularização do pagamento.',
    },
    {
      kind: 'paragraph',
      text: '9.6. A CONTRATADA não será responsável por atrasos no cronograma decorrentes de suspensão causada por inadimplência da CONTRATANTE.',
    },

    { kind: 'heading', text: '10. RESCISÃO CONTRATUAL' },
    {
      kind: 'paragraph',
      text: '10.1. O contrato poderá ser encerrado por qualquer uma das partes, mediante comunicação formal e observância do aviso prévio mínimo de 30 dias corridos.',
    },
    {
      kind: 'paragraph',
      text: '10.2. O aviso prévio poderá ser realizado por escrito via WhatsApp, e-mail ou outro canal formal acordado entre as partes.',
    },
    {
      kind: 'paragraph',
      text: '10.3. Não haverá multa rescisória pelo encerramento do contrato, desde que seja respeitado o aviso prévio de 30 dias corridos.',
    },
    {
      kind: 'paragraph',
      text: '10.4. Durante o período de aviso prévio, os serviços continuarão sendo prestados normalmente e os valores proporcionais ou mensais devidos permanecerão exigíveis.',
    },
    {
      kind: 'paragraph',
      text: '10.5. Em caso de encerramento, permanecerão devidos os valores vencidos, proporcionais, mensais em aberto ou referentes a serviços já executados até a data efetiva de encerramento.',
    },
    {
      kind: 'paragraph',
      text: '10.6. A ausência de multa não elimina a obrigação de pagamento por serviços já prestados, configurações realizadas ou valores proporcionais devidos.',
    },
    {
      kind: 'paragraph',
      text: '10.7. Materiais, informações, artes e arquivos finais já entregues e quitados permanecerão de uso da CONTRATANTE.',
    },
    {
      kind: 'paragraph',
      text: '10.8. A CONTRATADA não será obrigada a executar novas demandas, ajustes ou entregas após a data efetiva de encerramento do contrato, salvo novo acordo entre as partes.',
    },
    {
      kind: 'paragraph',
      text: '10.9. Propriedade dos Ativos: Todas as contas de anúncios, campanhas, públicos, pixels, eventos e histórico de dados criados durante a vigência pertencem à CONTRATANTE. Arquivos editáveis de criação, metodologias internas e processos de gestão da VEX Growth pertencem exclusivamente à CONTRATADA.',
    },
    {
      kind: 'paragraph',
      text: '10.10. Encerramento e Transição: Em caso de rescisão, a CONTRATADA garante que não excluirá ou desativará ativos da CONTRATANTE sem autorização prévia e manterá os acessos necessários para a transição de serviços durante o período de aviso prévio.',
    },

    { kind: 'heading', text: '11. CONFIDENCIALIDADE E LGPD' },
    {
      kind: 'paragraph',
      text: '11.1. As partes se comprometem a manter sigilo sobre informações comerciais, estratégicas, financeiras, técnicas, dados de acesso, materiais internos, conteúdos, campanhas, arquivos, referências, imagens, textos e quaisquer informações confidenciais compartilhadas durante a execução deste contrato.',
    },
    {
      kind: 'paragraph',
      text: '11.2. A CONTRATADA utilizará os dados, arquivos, imagens, textos, marcas, logotipos e informações fornecidos pela CONTRATANTE exclusivamente para execução dos serviços contratados.',
    },
    {
      kind: 'paragraph',
      text: '11.3. As partes declaram estar cientes da Lei Geral de Proteção de Dados - LGPD, Lei nº 13.709/2018, comprometendo-se a tratar dados pessoais de forma adequada e segura.',
    },
    {
      kind: 'paragraph',
      text: '11.4. A CONTRATANTE é responsável pela veracidade, autorização de uso e regularidade dos dados, contatos, imagens, textos, marcas, logotipos, fotografias, informações comerciais e demais conteúdos enviados para uso nos materiais contratados.',
    },
    {
      kind: 'paragraph',
      text: '11.5. A CONTRATADA não se responsabiliza por eventual uso indevido de imagens, textos, marcas, logotipos, fotografias ou conteúdos enviados pela CONTRATANTE sem a devida autorização de terceiros.',
    },

    { kind: 'heading', text: '12. DISPOSIÇÕES GERAIS' },
    {
      kind: 'paragraph',
      text: '12.1. Este contrato não estabelece vínculo empregatício, societário, associativo ou de representação comercial entre as partes.',
    },
    {
      kind: 'paragraph',
      text: '12.2. A CONTRATADA poderá contar com profissionais, parceiros ou fornecedores para execução de etapas específicas, permanecendo responsável pela entrega final perante a CONTRATANTE.',
    },
    {
      kind: 'paragraph',
      text: '12.3. Alterações de escopo, valores, prazos, condições ou canais de organização deverão ser formalizadas por escrito.',
    },
    {
      kind: 'paragraph',
      text: '12.4. A CONTRATANTE declara estar ciente de que resultados em mídias sociais, vendas, seguidores, engajamento, alcance, visualizações, contatos, conversões, reconhecimento de marca ou retorno comercial podem variar conforme mercado, público, concorrência, atendimento, oferta, investimento, constância, conteúdo, qualidade das informações enviadas e demais fatores externos.',
    },
    {
      kind: 'paragraph',
      text: '12.5. Resultados: A VEX Growth compromete-se a executar a estratégia com diligência e aplicar boas práticas, contudo, não garante resultados financeiros, volume de vendas ou número específico de leads, visto que tais resultados dependem de fatores externos alheios à gestão de tráfego.',
    },
    {
      kind: 'paragraph',
      text: '12.6. Os materiais e relatórios estratégicos criados pela CONTRATADA poderão ser utilizados pela CONTRATANTE após a quitação dos valores correspondentes.',
    },
    {
      kind: 'paragraph',
      text: '12.7. A entrega padrão será realizada em formato de relatórios ou acessos às plataformas de tráfego, conforme o tipo de material e alinhamento entre as partes.',
    },
    {
      kind: 'paragraph',
      text: '12.8. A CONTRATADA não será responsável por bloqueios, restrições, suspensões ou alterações promovidas pelas plataformas de anúncios por motivos alheios à sua atuação, desde que não tenham sido ocasionados por erro, negligência ou descumprimento das políticas pela própria CONTRATADA.',
    },
    {
      kind: 'paragraph',
      text: `12.9. Fica eleito o foro da comarca de ${VEX.forum}, com renúncia a qualquer outro, por mais privilegiado que seja, para dirimir eventuais questões oriundas deste contrato.`,
    },

    { kind: 'heading', text: '13. TERMO DE ACEITE' },
    {
      kind: 'paragraph',
      text: 'As partes declaram que leram, compreenderam e aceitam integralmente os termos desta proposta comercial e contrato de prestação de serviços.',
    },
    { kind: 'paragraph', text: 'Por estarem de acordo, firmam o presente instrumento.' },
    { kind: 'signature' },
  ],
}

/** Itens do índice — acompanham as cláusulas acima. */
export const TEMPLATE_INDEX = [
  'Objeto da Proposta',
  'Serviços Contratados',
  'Condições da Prestação dos Serviços',
  'Obrigações da Contratante',
  'Obrigações da Contratada',
  'Prazos, Vigência e Recorrência',
  'Valores e Condições de Pagamento',
  'Reajustes, Escopo e Serviços Extras',
  'Inadimplência',
  'Rescisão Contratual',
  'Confidencialidade e LGPD',
  'Disposições Gerais',
  'Termo de Aceite',
]

/**
 * Modelo do aditivo: mesma identidade visual, cláusulas próprias e referência
 * obrigatória ao documento original. Não altera nem substitui o contrato.
 */
export const ADDENDUM_TEMPLATE: ProposalTemplateContent = {
  title: 'TERMO ADITIVO',
  subtitle: 'Aditivo ao contrato de prestação de serviços de marketing digital.',
  blocks: [
    { kind: 'cover' },
    {
      kind: 'infoTable',
      rows: [
        ['CLIENTE', '{{cliente_nome}}'],
        ['RESPONSÁVEL', '{{cliente_responsavel}}'],
        ['EMPRESA PRESTADORA', VEX.legalName],
        ['CNPJ', VEX.cnpj],
        ['DOCUMENTO ORIGINAL', '{{documento_origem}}'],
        ['DATA', '{{data_proposta}}'],
      ],
    },
    { kind: 'subheading', text: 'Resumo do aditivo' },
    { kind: 'totals' },
    { kind: 'pageBreak' },

    { kind: 'heading', text: 'TERMO ADITIVO AO CONTRATO DE PRESTAÇÃO DE SERVIÇOS' },
    {
      kind: 'paragraph',
      text: 'Pelo presente termo aditivo, {{cliente_nome_maiusculo}}, {{cliente_qualificacao}}, e-mail {{cliente_email}}, doravante CONTRATANTE, e ' +
        `${VEX.legalName}, inscrita no CNPJ nº ${VEX.cnpj}, neste ato representada por ${VEX.representative}, inscrito no CPF nº ${VEX.representativeCpf}, doravante CONTRATADA, resolvem alterar o contrato de prestação de serviços firmado entre as partes, referenciado neste documento como {{documento_origem}}, nos termos abaixo.`,
    },

    { kind: 'heading', text: '1. OBJETO DO ADITIVO' },
    {
      kind: 'paragraph',
      text: '1.1. Este termo tem por objeto registrar as alterações de escopo, valores, quantidades, duração ou condições de pagamento descritas na cláusula 2, permanecendo inalteradas todas as demais disposições do contrato original.',
    },
    {
      kind: 'paragraph',
      text: '1.2. O contrato original permanece válido e produzindo efeitos naquilo que não conflitar com este aditivo.',
    },

    { kind: 'heading', text: '2. ALTERAÇÕES CONTRATADAS' },
    { kind: 'addendum' },

    { kind: 'heading', text: '3. VALORES E VIGÊNCIA' },
    { kind: 'payment' },
    { kind: 'paragraph', text: '3.2. As alterações passam a vigorar a partir de {{data_inicio}}.' },
    {
      kind: 'paragraph',
      text: '3.3. Os valores anteriores permanecem devidos até a data de início da vigência deste aditivo.',
    },

    { kind: 'heading', text: '4. DISPOSIÇÕES FINAIS' },
    {
      kind: 'paragraph',
      text: '4.1. Permanecem inalteradas e em pleno vigor todas as cláusulas do contrato original não expressamente modificadas por este termo, incluindo prazos, obrigações, confidencialidade, LGPD, rescisão e foro.',
    },
    {
      kind: 'paragraph',
      text: '4.2. As partes declaram que leram, compreenderam e aceitam integralmente os termos deste aditivo.',
    },
    { kind: 'signature' },
  ],
}
