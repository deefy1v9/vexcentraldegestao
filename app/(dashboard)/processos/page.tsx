import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRight, Plus } from 'lucide-react'
import { getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import { Badge } from '@/components/vex/badge'
import EquipesPanel from '@/components/processos/EquipesPanel'
import { ensureDefaultProcesses, listProcesses } from '@/lib/processos-server'
import { TEAM_INCLUDE } from '@/lib/equipes'

/**
 * Processos e equipes (admin). Cada processo é a rota de etapas de um tipo
 * de entrega; cada etapa diz quem assume: um papel, uma pessoa ou uma equipe.
 */
export default async function ProcessosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') redirect('/demandas')
  const aba = (await searchParams).aba === 'equipes' ? 'equipes' : 'processos'

  await ensureDefaultProcesses()
  const [processos, equipes, pessoas] = await Promise.all([
    listProcesses(),
    prisma.team.findMany({ include: TEAM_INCLUDE, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  const abas = [['processos', 'Processos', processos.length], ['equipes', 'Equipes', equipes.length]] as const

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Processos" subtitle="A rota de etapas de cada entrega e quem assume cada uma" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-1 border-b border-border" role="tablist">
          {abas.map(([k, label, n]) => (
            <Link
              key={k}
              href={k === 'processos' ? '/processos' : '/processos?aba=equipes'}
              role="tab"
              aria-selected={aba === k}
              className={`h-10 px-3 inline-flex items-center gap-1.5 t-rotulo border-b-2 -mb-px ${aba === k ? 'border-marca text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {label} <span className="text-muted-foreground">{n}</span>
            </Link>
          ))}
        </div>

        {aba === 'equipes' ? (
          <EquipesPanel equipes={equipes} pessoas={pessoas} />
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {processos.map((p) => {
              const etapas = p.stages.filter((s) => s.kind !== 'FINAL')
              const equipesDoProcesso = [...new Set(p.stages.map((s) => s.team?.name).filter(Boolean))]
              return (
                <Link key={p.id} href={`/processos/${p.id}`} className="rounded-[12px] border border-border bg-card p-4 hover:border-subtle transition-colors flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                    <p className="t-secao text-foreground flex-1 truncate">{p.name}</p>
                    {!p.active && <Badge variant="default">Desligado</Badge>}
                  </div>
                  {p.description && <p className="t-legenda line-clamp-2 -mt-1.5">{p.description}</p>}
                  <div className="flex flex-wrap items-center gap-1">
                    {etapas.map((s, i) => (
                      <span key={s.id} className="inline-flex items-center gap-1">
                        <Badge variant={s.kind === 'APROVACAO' ? 'warning' : 'default'}>{s.name}</Badge>
                        {i < etapas.length - 1 && <ChevronRight className="w-3 h-3 text-subtle" />}
                      </span>
                    ))}
                  </div>
                  <p className="t-legenda mt-auto">
                    {etapas.length} etapa(s) · {p._count.tasks} demanda(s){equipesDoProcesso.length ? ` · ${equipesDoProcesso.join(', ')}` : ''}
                  </p>
                </Link>
              )
            })}
            <Link href="/processos/novo" className="rounded-[12px] border border-dashed border-subtle bg-card p-4 min-h-[150px] grid place-items-center text-muted-foreground hover:border-marca hover:text-marca-texto transition-colors">
              <span className="inline-flex items-center gap-1.5 t-corpo font-medium"><Plus className="w-4 h-4" /> Novo processo</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
