import { prisma } from '@/lib/prisma'
import AgendaMes, { type ItemAgenda } from '@/components/v2/AgendaMes'

/**
 * Agenda da versão 2 (prévia): o mês inteiro das demandas e eventos, no
 * desenho de calendário de publicações do modelo — filtros por processo,
 * mini calendário e o que está sem data ao lado.
 */
const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export default async function AgendaV2({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams
  const hoje = diaSP(new Date())
  const [ano, m] = (/^\d{4}-\d{2}$/.test(mes ?? '') ? mes! : hoje.slice(0, 7)).split('-').map(Number)

  // A grade começa na segunda-feira da semana do dia 1 e tem 6 semanas
  const primeiro = new Date(Date.UTC(ano, m - 1, 1))
  const recuo = (primeiro.getUTCDay() + 6) % 7
  const inicioGrade = new Date(Date.UTC(ano, m - 1, 1 - recuo))
  const fimGrade = new Date(inicioGrade.getTime() + 42 * 86400000)
  const segunda = (() => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d })()
  const fimSemana = new Date(segunda.getTime() + 7 * 86400000)

  const [tarefas, eventos, semData, concluidasSemana, processos] = await Promise.all([
    prisma.task.findMany({
      where: { dueDate: { gte: inicioGrade, lt: fimGrade } },
      select: { id: true, number: true, title: true, status: true, dueDate: true, client: { select: { name: true } }, assignee: { select: { name: true } }, process: { select: { id: true, name: true, color: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.calendarEvent.findMany({
      where: { startDate: { gte: inicioGrade, lt: fimGrade } },
      select: { id: true, title: true, startDate: true, type: true, client: { select: { name: true } } },
    }).catch(() => [] as Array<{ id: string; title: string; startDate: Date; type: string | null; client: { name: string } | null }>),
    prisma.task.findMany({
      where: { dueDate: null, status: { not: 'CONCLUIDO' } },
      select: { id: true, number: true, title: true, client: { select: { name: true } }, process: { select: { name: true, color: true } } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.task.count({ where: { status: 'CONCLUIDO', updatedAt: { gte: segunda, lt: fimSemana } } }),
    prisma.process.findMany({ where: { active: true }, select: { id: true, name: true, color: true }, orderBy: { position: 'asc' } }),
  ])

  const itens: ItemAgenda[] = [
    ...tarefas.map((t) => ({
      id: t.id, tipo: 'demanda' as const, numero: t.number, titulo: t.title, dia: t.dueDate!.toISOString().slice(0, 10),
      status: t.status, cliente: t.client?.name ?? null, responsavel: t.assignee?.name ?? null,
      processoId: t.process?.id ?? null, cor: t.process?.color ?? null, href: `/demandas?task=${t.id}`,
    })),
    ...eventos.map((e) => ({
      id: e.id, tipo: 'evento' as const, numero: null, titulo: e.title, dia: diaSP(e.startDate),
      status: 'EVENTO', cliente: e.client?.name ?? null, responsavel: null, processoId: null, cor: null, href: '/calendario',
    })),
  ]

  const proximos7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10) })
  const diasVazios = proximos7.filter((d) => !itens.some((i) => i.dia === d && i.status !== 'CONCLUIDO')).length
  const semanaIni = segunda.toISOString().slice(0, 10), semanaFim = fimSemana.toISOString().slice(0, 10)

  const resumo = {
    agendadasSemana: tarefas.filter((t) => t.status !== 'CONCLUIDO' && t.dueDate!.toISOString().slice(0, 10) >= semanaIni && t.dueDate!.toISOString().slice(0, 10) < semanaFim).length,
    aguardandoAprovacao: await prisma.task.count({ where: { status: { in: ['EM_REVISAO', 'APROVADO'] } } }),
    concluidasSemana,
    diasVazios,
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 pt-6 pb-10">
    <AgendaMes
      ano={ano}
      mes={m}
      hoje={hoje}
      inicioGrade={inicioGrade.toISOString().slice(0, 10)}
      itens={itens}
      semData={semData.map((t) => ({ id: t.id, numero: t.number, titulo: t.title, cliente: t.client?.name ?? null, cor: t.process?.color ?? null, processo: t.process?.name ?? null }))}
      processos={processos}
      resumo={resumo}
    />
    </div>
  )
}
