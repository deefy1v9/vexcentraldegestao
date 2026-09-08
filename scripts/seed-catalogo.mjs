/**
 * Catálogo oficial de serviços da VEX — faixas praticadas informadas pela
 * diretoria em 08/09/2026.
 *
 * Roda quantas vezes precisar: cada serviço é gravado pelo nome (unique), então
 * reexecutar só atualiza a faixa. Entradas antigas, criadas automaticamente a
 * partir dos contratos, são inativadas (nunca apagadas) — os contratos e o
 * histórico continuam apontando para elas.
 *
 * Uso:  node scripts/seed-catalogo.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const NOTA = 'Faixa praticada informada pela diretoria em 08/09/2026.'
const r$ = (reais) => Math.round(reais * 100)

/** min/max iguais quando o preço é fechado; default nulo em faixa larga. */
const SERVICOS = [
  /* ------------------------------- avulsos ------------------------------- */
  { name: 'Landing page', category: 'Sites', billingType: 'AVULSO', periodicity: 'UNICO', min: 1000, max: 1800 },
  { name: 'Site multipage', category: 'Sites', billingType: 'AVULSO', periodicity: 'UNICO', min: 3000, max: 3500 },
  { name: 'Perfil da Empresa no Google', category: 'Presença digital', billingType: 'AVULSO', periodicity: 'UNICO', min: 400, max: 450 },
  { name: 'Link da bio (domínio próprio)', category: 'Sites', billingType: 'AVULSO', periodicity: 'UNICO', min: 450, max: 450 },
  { name: 'Implementação de CRM', category: 'CRM e comercial', billingType: 'AVULSO', periodicity: 'UNICO', min: 750, max: 800 },
  {
    name: 'Consultoria de CRM', category: 'CRM e comercial', billingType: 'AVULSO', periodicity: 'UNICO',
    min: 1250, max: 1250, summary: 'Acompanhamento de 30 dias.',
  },
  { name: 'Consultoria comercial', category: 'CRM e comercial', billingType: 'AVULSO', periodicity: 'UNICO', min: 2500, max: 2500 },
  {
    name: 'Identidade visual e rebranding', category: 'Design', billingType: 'AVULSO', periodicity: 'UNICO',
    min: 400, max: 1800, semPadrao: true, summary: 'Valor conforme o porte do cliente.',
  },
  {
    name: 'Diagramação de e-book', category: 'Design', billingType: 'AVULSO', periodicity: 'UNICO',
    min: 200, max: 400, semPadrao: true, summary: 'R$ 200 até 15 páginas · R$ 400 até 30 páginas.',
  },
  { name: 'Apresentação institucional em PPTX editável', category: 'Design', billingType: 'AVULSO', periodicity: 'UNICO', min: 650, max: 950 },

  /* ------------------------------ recorrentes ----------------------------- */
  { name: 'Social media · 15 conteúdos', category: 'Social media', billingType: 'RECORRENTE', periodicity: 'MENSAL', min: 900, max: 900 },
  { name: 'Social media · 20 conteúdos', category: 'Social media', billingType: 'RECORRENTE', periodicity: 'MENSAL', min: 1400, max: 1500 },
  { name: 'Captação e edição · 10 vídeos', category: 'Vídeo', billingType: 'RECORRENTE', periodicity: 'MENSAL', min: 700, max: 700 },
  {
    name: 'Edição de vídeo avulsa', category: 'Vídeo', billingType: 'QUANTIDADE', periodicity: 'MENSAL',
    min: 115, max: 150, summary: 'Valor por vídeo.',
  },
  { name: 'Tráfego pago · 1 plataforma', category: 'Tráfego pago', billingType: 'RECORRENTE', periodicity: 'MENSAL', min: 800, max: 1000 },
  { name: 'Tráfego pago · 2 plataformas', category: 'Tráfego pago', billingType: 'RECORRENTE', periodicity: 'MENSAL', min: 1250, max: 1800 },
  { name: 'SEO Essencial', category: 'SEO e conteúdo', billingType: 'RECORRENTE', periodicity: 'MENSAL', min: 500, max: 550 },
  { name: 'SEO Performance', category: 'SEO e conteúdo', billingType: 'RECORRENTE', periodicity: 'MENSAL', min: 990, max: 990 },
  { name: 'SEO + IA (GEO/AEO)', category: 'SEO e conteúdo', billingType: 'RECORRENTE', periodicity: 'MENSAL', min: 1400, max: 1400 },
  {
    name: 'Gestão de blog', category: 'SEO e conteúdo', billingType: 'RECORRENTE', periodicity: 'MENSAL',
    min: 400, max: 1350, semPadrao: true, summary: '2 artigos: R$ 400 · 4 artigos: R$ 750 · 8 artigos: R$ 1.350.',
  },
  { name: 'LinkedIn · 12 posts', category: 'Social media', billingType: 'RECORRENTE', periodicity: 'MENSAL', min: 800, max: 800 },
  { name: 'Manutenção de site WordPress', category: 'Sites', billingType: 'RECORRENTE', periodicity: 'MENSAL', min: 235, max: 235 },
  {
    name: 'E-mail marketing e automação', category: 'E-mail marketing', billingType: 'RECORRENTE', periodicity: 'MENSAL',
    min: 700, max: 700, summary: 'Setup único de R$ 600 cobrado junto do primeiro mês.',
  },
  {
    name: 'Hora técnica', category: 'Suporte', billingType: 'QUANTIDADE', periodicity: 'MENSAL',
    min: 100, max: 100, summary: 'Valor por hora.',
  },
]

async function main() {
  let criados = 0
  let atualizados = 0

  for (const s of SERVICOS) {
    const dados = {
      category: s.category,
      summary: s.summary ?? null,
      billingType: s.billingType,
      periodicity: s.periodicity,
      minCents: r$(s.min),
      maxCents: r$(s.max),
      defaultCents: s.semPadrao ? null : r$(s.max),
      isActive: true,
      internalNotes: NOTA,
    }
    const existente = await prisma.serviceCatalog.findUnique({ where: { name: s.name } })
    if (existente) {
      await prisma.serviceCatalog.update({ where: { id: existente.id }, data: dados })
      atualizados++
    } else {
      await prisma.serviceCatalog.create({ data: { name: s.name, ...dados } })
      criados++
    }
  }
  console.log(`catálogo oficial: ${criados} criado(s), ${atualizados} atualizado(s)`)

  // Entradas herdadas dos contratos saem de circulação, mas continuam existindo
  const oficiais = SERVICOS.map((s) => s.name)
  const antigos = await prisma.serviceCatalog.findMany({
    where: { name: { notIn: oficiais }, isActive: true },
    include: { _count: { select: { clientServices: true } } },
  })
  for (const a of antigos) {
    await prisma.serviceCatalog.update({
      where: { id: a.id },
      data: {
        isActive: false,
        internalNotes: 'Entrada herdada dos contratos antigos. Inativada na adoção do catálogo oficial — os contratos existentes seguem válidos.',
      },
    })
    console.log(`  inativado: ${a.name} (${a._count.clientServices} contrato(s) ainda apontam para ele)`)
  }

  const contratos = await prisma.clientService.findMany({
    where: { status: 'ATIVO', OR: [{ catalogId: null }, { catalog: { isActive: false } }] },
    select: {
      serviceName: true, priceCents: true, monthlyValue: true,
      client: { select: { name: true } }, catalog: { select: { name: true } },
    },
    orderBy: { serviceName: 'asc' },
  })
  if (contratos.length > 0) {
    console.log('\ncontratos ativos que ainda usam nome antigo (repontar pela tela do cliente):')
    for (const c of contratos) {
      const cents = c.priceCents ?? Math.round((c.monthlyValue ?? 0) * 100)
      console.log(`  ${c.client.name} · ${c.serviceName} · R$ ${(cents / 100).toFixed(2)}`)
    }
  }
}

main()
  .catch((e) => { console.error('FALHOU:', e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
