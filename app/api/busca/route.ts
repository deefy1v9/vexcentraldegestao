import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Busca geral da Central (o "Buscar…" do menu e o Ctrl K): clientes,
 * demandas, oportunidades e propostas pelo nome, título ou número. O
 * colaborador só acha os clientes e as próprias demandas, como no resto da
 * Central; o comercial é só do administrador.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = session.user.role === 'ADMIN'
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ resultados: [] })

  const contem = { contains: q, mode: 'insensitive' as const }
  const numero = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null

  const [clientes, demandas, oportunidades, propostas] = await Promise.all([
    prisma.client.findMany({
      where: { OR: [{ name: contem }, { legalName: contem }] },
      select: { id: true, name: true, status: true },
      orderBy: { name: 'asc' },
      take: 6,
    }),
    prisma.task.findMany({
      where: {
        AND: [
          numero !== null ? { OR: [{ number: numero }, { title: contem }] } : { title: contem },
          isAdmin ? {} : { assigneeId: session.user.id },
        ],
      },
      select: { id: true, number: true, title: true, status: true, client: { select: { name: true } } },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 8,
    }),
    isAdmin
      ? prisma.opportunity.findMany({
          where: { OR: [{ title: contem }, { prospect: { OR: [{ name: contem }, { tradeName: contem }] } }, { client: { name: contem } }] },
          select: { id: true, title: true, stage: true, client: { select: { name: true } }, prospect: { select: { name: true, tradeName: true } } },
          take: 5,
        })
      : [],
    isAdmin
      ? prisma.proposal.findMany({
          where: { OR: [{ number: contem }, { client: { name: contem } }] },
          select: { id: true, number: true, status: true, client: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
      : [],
  ])

  const resultados = [
    ...clientes.map((c) => ({ tipo: 'Cliente', titulo: c.name, detalhe: c.status === 'ATIVO' ? 'Cliente ativo' : c.status.toLowerCase(), href: `/clientes/${c.id}` })),
    ...demandas.map((t) => ({ tipo: 'Demanda', titulo: `#${t.number} ${t.title}`, detalhe: [t.client?.name, t.status === 'CONCLUIDO' ? 'concluída' : 'em aberto'].filter(Boolean).join(' · '), href: `/demandas?task=${t.id}` })),
    ...oportunidades.map((o) => ({ tipo: 'Oportunidade', titulo: o.title, detalhe: o.client?.name ?? o.prospect?.tradeName ?? o.prospect?.name ?? '', href: `/pipeline?q=${encodeURIComponent(o.title)}` })),
    ...propostas.map((p) => ({ tipo: 'Proposta', titulo: p.number, detalhe: p.client?.name ?? '', href: `/propostas/${p.id}` })),
  ]
  return NextResponse.json({ resultados })
}
