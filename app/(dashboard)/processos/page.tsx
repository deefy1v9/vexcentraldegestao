import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import { Button } from '@/components/vex/button'
import EquipesPanel from '@/components/processos/EquipesPanel'
import ProcessosVisao, { type ProcessoResumo } from '@/components/processos/ProcessosVisao'
import { ensureDefaultProcesses, listProcesses } from '@/lib/processos-server'
import { TEAM_INCLUDE } from '@/lib/equipes'
import { cn } from '@/lib/utils'

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

  // Só o que a tela mostra (a lista não edita nada)
  const resumo: ProcessoResumo[] = processos.map((p) => ({
    id: p.id, name: p.name, color: p.color, description: p.description, active: p.active, taskCount: p._count.tasks,
    stages: p.stages.map((s) => ({
      id: s.id, name: s.name, kind: s.kind, role: s.role,
      defaultUser: s.defaultUser ? { name: s.defaultUser.name } : null,
      team: s.team ? { name: s.team.name, color: s.team.color } : null,
      dueMode: s.dueMode, dueDays: s.dueDays, fields: s.fields, checklist: s.checklist, checklistRequired: s.checklistRequired,
    })),
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Processos"
        subtitle="A rota de etapas de cada entrega e quem assume cada uma"
        acoes={aba === 'processos' ? (
          <Button asChild>
            <Link href="/processos/novo"><Plus /> Novo processo</Link>
          </Button>
        ) : undefined}
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:px-8 space-y-5">
        <div className="inline-flex rounded-xl border border-border bg-secondary/60 p-1" role="tablist" aria-label="Processos ou equipes">
          {abas.map(([k, label, n]) => (
            <Link
              key={k}
              href={k === 'processos' ? '/processos' : '/processos?aba=equipes'}
              role="tab"
              aria-selected={aba === k}
              className={cn(
                'h-8 px-3.5 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors',
                aba === k ? 'bg-card text-marca-texto shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label} <span className={cn('rounded-full px-1.5 text-[11px]', aba === k ? 'bg-marca-suave text-marca-texto' : 'bg-card text-muted-foreground')}>{n}</span>
            </Link>
          ))}
        </div>

        {aba === 'equipes' ? (
          <EquipesPanel equipes={equipes} pessoas={pessoas} />
        ) : (
          <ProcessosVisao processos={resumo} />
        )}
      </div>
    </div>
  )
}
