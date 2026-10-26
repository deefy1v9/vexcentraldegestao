import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import { Badge } from '@/components/vex/badge'
import { garantirBriefingsPadrao, perguntasDe } from '@/lib/briefing'
import CopiarLink from '@/components/briefings/CopiarLink'
import NovoBriefing from '@/components/briefings/NovoBriefing'

export const dynamic = 'force-dynamic'

const dataBr = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' })

/**
 * Briefings (admin). Aba "Briefings": um cartão por briefing, com o link para
 * mandar ao cliente. Aba "Respostas": quem respondeu, de qual briefing, e os
 * links de cliente que ainda não voltaram.
 */
export default async function BriefingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') redirect('/demandas')
  const sp = await searchParams
  const aba = sp.aba === 'respostas' ? 'respostas' : 'briefings'
  const filtro = typeof sp.b === 'string' ? sp.b : ''

  await garantirBriefingsPadrao()
  const [briefings, respostas, pendentes, naoLidas] = await Promise.all([
    prisma.briefingTemplate.findMany({
      orderBy: [{ active: 'desc' }, { position: 'asc' }],
      include: { _count: { select: { responses: true } } },
    }),
    prisma.briefingResponse.findMany({
      where: filtro ? { templateId: filtro } : {},
      include: { template: { select: { name: true } }, client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.briefingInvite.findMany({
      where: { responses: { none: {} }, ...(filtro ? { templateId: filtro } : {}) },
      include: { template: { select: { id: true, name: true } }, client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.briefingResponse.count({ where: { readAt: null } }),
  ])

  const abas = [['briefings', 'Briefings', briefings.length], ['respostas', 'Respostas', naoLidas]] as const

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Briefings" subtitle="O formulário de cada produto: você manda o link, o cliente responde e a resposta cai aqui" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-1 border-b border-border" role="tablist">
          {abas.map(([k, label, n]) => (
            <Link
              key={k}
              href={k === 'briefings' ? '/briefings' : '/briefings?aba=respostas'}
              role="tab"
              aria-selected={aba === k}
              className={`h-10 px-3 inline-flex items-center gap-1.5 t-rotulo border-b-2 -mb-px ${aba === k ? 'border-marca text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {label}
              {k === 'respostas' ? (n > 0 && <Badge variant="primary">{n} nova{n > 1 ? 's' : ''}</Badge>) : <span className="text-muted-foreground">{n}</span>}
            </Link>
          ))}
        </div>

        {aba === 'briefings' ? (
          <>
            <div className="flex justify-end"><NovoBriefing modelos={briefings.map((b) => ({ id: b.id, name: b.name }))} /></div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {briefings.map((b) => {
                const perguntas = perguntasDe(b.questions).filter((p) => p.tipo !== 'secao')
                return (
                  <div key={b.id} className="rounded-[12px] border border-border bg-card p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-2">
                      <p className="t-secao text-foreground flex-1">{b.name}</p>
                      {!b.active && <Badge variant="default">Desligado</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {perguntas.length} perguntas · {perguntas.filter((p) => p.obrigatoria).length} obrigatórias ·{' '}
                      <Link href={`/briefings?aba=respostas&b=${b.id}`} className="text-link hover:underline">{b._count.responses} resposta{b._count.responses === 1 ? '' : 's'}</Link>
                    </p>
                    <div className="mt-auto flex items-center gap-2">
                      {b.active && <CopiarLink caminho={`/b/${b.publicToken}`} rotulo="Copiar link" />}
                      <Link href={`/briefings/${b.id}`} className="h-9 px-3 inline-flex items-center gap-1 rounded-lg border border-border text-xs font-medium hover:bg-accent">
                        Editar e links por cliente <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/briefings?aba=respostas" className={`h-8 px-3 inline-flex items-center rounded-full border text-xs ${!filtro ? 'border-primary text-foreground' : 'border-border text-muted-foreground'}`}>Todos</Link>
              {briefings.map((b) => (
                <Link key={b.id} href={`/briefings?aba=respostas&b=${b.id}`} className={`h-8 px-3 inline-flex items-center rounded-full border text-xs ${filtro === b.id ? 'border-primary text-foreground' : 'border-border text-muted-foreground'}`}>{b.name}</Link>
              ))}
            </div>

            <section>
              <h2 className="t-secao text-foreground mb-2">Respondidos <span className="text-muted-foreground">{respostas.length}</span></h2>
              {respostas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma resposta ainda.</p>
              ) : (
                <div className="rounded-[12px] border border-border bg-card divide-y divide-border">
                  {respostas.map((r) => (
                    <Link key={r.id} href={`/briefings/respostas/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${r.readAt ? 'bg-transparent' : 'bg-primary'}`} aria-label={r.readAt ? undefined : 'Não lida'} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${r.readAt ? 'text-foreground' : 'font-semibold text-foreground'}`}>
                          {r.client?.name ?? r.companyName ?? r.respondentName ?? 'Sem identificação'}
                          {!r.client && <span className="ml-2"><Badge variant="warning">sem cliente ligado</Badge></span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{r.template.name} · respondido em {dataBr(r.createdAt)}{r.respondentName ? ` · ${r.respondentName}` : ''}</p>
                      </div>
                      {r.alerts.length > 0 && <Badge variant="warning">{r.alerts.length} aviso{r.alerts.length > 1 ? 's' : ''}</Badge>}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="t-secao text-foreground mb-2">Aguardando o cliente <span className="text-muted-foreground">{pendentes.length}</span></h2>
              {pendentes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum link de cliente esperando resposta.</p>
              ) : (
                <div className="rounded-[12px] border border-border bg-card divide-y divide-border">
                  {pendentes.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{c.client.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.template.name} · link criado em {dataBr(c.createdAt)} · {c.openedAt ? `abriu em ${dataBr(c.openedAt)}, ainda não enviou` : 'ainda não abriu'}
                        </p>
                      </div>
                      <CopiarLink caminho={`/b/${c.token}`} rotulo="Copiar" />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
