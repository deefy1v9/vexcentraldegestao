import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRight, Send, CircleCheck, Hourglass, ClipboardList } from 'lucide-react'
import { getSessionUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import Header from '@/components/layout/Header'
import { Badge } from '@/components/vex/badge'
import { Avatar } from '@/components/vex/avatar'
import { Chip, Kpi, Painel } from '@/components/vex/vireo'
import { garantirBriefingsPadrao, perguntasDe } from '@/lib/briefing'
import CopiarLink from '@/components/briefings/CopiarLink'
import NovoBriefing from '@/components/briefings/NovoBriefing'

export const dynamic = 'force-dynamic'

const dataBr = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' })

/**
 * Briefings (admin). Aba "Briefings": os números, um cartão por cliente (o que
 * respondeu e o que ainda espera) e um cartão por briefing, com o link para
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

  // Um cartão por cliente: o que respondeu e o que ainda espera. "Enviados"
  // soma os dois (todo briefing que chegou ao cliente, pelo link dele ou não).
  type PorCliente = { nome: string; semCliente: boolean; respondidos: number; aguardando: number; naoLidas: number; ultimos: Array<{ id: string; briefing: string; quando: Date; tipo: 'respondido' | 'aguardando'; href?: string; token?: string; abriu?: boolean }> }
  const porCliente = new Map<string, PorCliente>()
  const doCliente = (chave: string, nome: string, semCliente: boolean) => {
    let c = porCliente.get(chave)
    if (!c) { c = { nome, semCliente, respondidos: 0, aguardando: 0, naoLidas: 0, ultimos: [] }; porCliente.set(chave, c) }
    return c
  }
  for (const r of respostas) {
    const nome = r.client?.name ?? r.companyName ?? r.respondentName ?? 'Sem identificação'
    const c = doCliente(r.clientId ?? `sem:${nome}`, nome, !r.client)
    c.respondidos++
    if (!r.readAt) c.naoLidas++
    c.ultimos.push({ id: r.id, briefing: r.template.name, quando: r.createdAt, tipo: 'respondido', href: `/briefings/respostas/${r.id}` })
  }
  for (const p of pendentes) {
    const c = doCliente(p.clientId, p.client.name, false)
    c.aguardando++
    c.ultimos.push({ id: p.id, briefing: p.template.name, quando: p.createdAt, tipo: 'aguardando', token: p.token, abriu: !!p.openedAt })
  }
  const clientes = [...porCliente.values()]
    .map((c) => ({ ...c, ultimos: c.ultimos.sort((x, y) => y.quando.getTime() - x.quando.getTime()) }))
    .sort((x, y) => (y.aguardando - x.aguardando) || (y.naoLidas - x.naoLidas) || x.nome.localeCompare(y.nome, 'pt-BR'))
  const totalRespondidos = respostas.length
  const totalAguardando = pendentes.length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Briefings"
        subtitle="O formulário de cada produto: você manda o link, o cliente responde e a resposta cai aqui"
        acoes={<NovoBriefing modelos={briefings.map((b) => ({ id: b.id, name: b.name }))} />}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-8 pt-2 space-y-5">
        {/* Abas em pílula (modelo Vireo) */}
        <nav className="flex items-center gap-1" role="tablist" aria-label="Briefings">
          {abas.map(([k, label, n]) => (
            <Link
              key={k}
              href={k === 'briefings' ? '/briefings' : '/briefings?aba=respostas'}
              role="tab"
              aria-selected={aba === k}
              className={`h-9 px-4 inline-flex items-center gap-2 rounded-full text-[13px] font-semibold transition-colors ${aba === k ? 'bg-marca-suave text-marca-texto' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
            >
              {label}
              {k === 'respostas'
                ? (n > 0 && <Badge variant="info">{n} nova{n > 1 ? 's' : ''}</Badge>)
                : <span className="text-[11.5px] font-semibold text-muted-foreground tabular">{n}</span>}
            </Link>
          ))}
        </nav>

        {aba === 'briefings' ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <Kpi icone={Send} tom="marca" rotulo="Enviados" valor={totalRespondidos + totalAguardando} nota="respondidos + aguardando" />
              <Kpi icone={CircleCheck} tom="sucesso" rotulo="Respondidos" valor={totalRespondidos} nota={naoLidas ? `${naoLidas} ainda não lida(s)` : 'todos lidos'} href="/briefings?aba=respostas" />
              <Kpi icone={Hourglass} tom="atencao" rotulo="Aguardando o cliente" valor={totalAguardando} nota="links sem resposta" />
              <Kpi icone={ClipboardList} tom="neutro" rotulo="Modelos de briefing" valor={briefings.length} nota={`${briefings.filter((b) => b.active).length} ligados`} />
            </div>

            {/* Por cliente: o foco da tela */}
            <Painel rotulo="Clientes" titulo="Por cliente" sub="Quem já respondeu e quem ainda está devendo o briefing">
              {clientes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum briefing enviado a cliente ainda. Gere o link de um cliente no briefing (Editar e links por cliente).</p>
              ) : (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {clientes.map((c) => (
                    <article key={c.nome} className="rounded-[20px] border border-border bg-card p-4 flex flex-col gap-3 hover:border-marca/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar nome={c.nome} className="w-10 h-10 text-[13px] bg-marca-suave text-marca-texto" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold text-foreground truncate">{c.nome}</p>
                          {c.semCliente
                            ? <p className="text-[11.5px] text-warning">sem cliente ligado</p>
                            : <p className="text-[11.5px] text-muted-foreground">{c.respondidos + c.aguardando} enviado{c.respondidos + c.aguardando === 1 ? '' : 's'}</p>}
                        </div>
                        {c.naoLidas > 0 && <Badge variant="info">{c.naoLidas} nova{c.naoLidas > 1 ? 's' : ''}</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="default">{c.respondidos + c.aguardando} enviado{c.respondidos + c.aguardando === 1 ? '' : 's'}</Badge>
                        <Badge variant={c.respondidos ? 'success' : 'default'}>{c.respondidos} respondido{c.respondidos === 1 ? '' : 's'}</Badge>
                        <Badge variant={c.aguardando ? 'warning' : 'default'}>{c.aguardando} aguardando</Badge>
                      </div>
                      <ul className="divide-y divide-border border-t border-border -mx-4 px-4">
                        {c.ultimos.slice(0, 3).map((u) => (
                          <li key={u.id} className="flex items-center gap-2 py-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-[12.5px] text-foreground truncate">{u.briefing}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {u.tipo === 'respondido' ? `respondido em ${dataBr(u.quando)}` : `link de ${dataBr(u.quando)} · ${u.abriu ? 'abriu, ainda não enviou' : 'ainda não abriu'}`}
                              </p>
                            </div>
                            {u.href
                              ? <Link href={u.href} className="t-rotulo font-semibold text-marca-texto hover:underline inline-flex items-center gap-0.5 shrink-0">Ver <ChevronRight className="w-3.5 h-3.5" /></Link>
                              : u.token && <CopiarLink caminho={`/b/${u.token}`} rotulo="Copiar" />}
                          </li>
                        ))}
                      </ul>
                      {c.ultimos.length > 3 && <p className="t-meta -mt-1">+ {c.ultimos.length - 3} outro(s) em Respostas</p>}
                    </article>
                  ))}
                </div>
              )}
            </Painel>

            {/* Modelos: o formulário de cada produto */}
            <Painel rotulo="Modelos" titulo="Briefings" sub="Copie o link geral ou abra para editar e gerar o link de um cliente">
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {briefings.map((b) => {
                  const perguntas = perguntasDe(b.questions).filter((p) => p.tipo !== 'secao')
                  return (
                    <div key={b.id} className="rounded-[20px] border border-border bg-card p-4 flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <Chip icone={ClipboardList} tom={b.active ? 'marca' : 'neutro'} />
                        <p className="text-[14px] font-semibold text-foreground flex-1 pt-1.5">{b.name}</p>
                        {!b.active && <Badge variant="default">Desligado</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {perguntas.length} perguntas · {perguntas.filter((p) => p.obrigatoria).length} obrigatórias ·{' '}
                        <Link href={`/briefings?aba=respostas&b=${b.id}`} className="text-marca-texto hover:underline">{b._count.responses} resposta{b._count.responses === 1 ? '' : 's'}</Link>
                      </p>
                      <div className="mt-auto flex flex-wrap items-center gap-2">
                        {b.active && <CopiarLink caminho={`/b/${b.publicToken}`} rotulo="Copiar link" />}
                        <Link href={`/briefings/${b.id}`} className="h-9 px-3 inline-flex items-center gap-1 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-accent">
                          Editar e links por cliente <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Painel>
          </>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/briefings?aba=respostas" className={`h-8 px-3 inline-flex items-center rounded-full border text-xs font-medium ${!filtro ? 'border-marca/30 bg-marca-suave text-marca-texto' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>Todos</Link>
              {briefings.map((b) => (
                <Link key={b.id} href={`/briefings?aba=respostas&b=${b.id}`} className={`h-8 px-3 inline-flex items-center rounded-full border text-xs font-medium ${filtro === b.id ? 'border-marca/30 bg-marca-suave text-marca-texto' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>{b.name}</Link>
              ))}
            </div>

            <Painel semPadding titulo={<>Respondidos <span className="text-muted-foreground tabular">{respostas.length}</span></>}>
              {respostas.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhuma resposta ainda.</p>
              ) : (
                <div className="divide-y divide-border border-t border-border">
                  {respostas.map((r) => {
                    const nome = r.client?.name ?? r.companyName ?? r.respondentName ?? 'Sem identificação'
                    return (
                      <Link key={r.id} href={`/briefings/respostas/${r.id}`} className="flex items-center gap-3 px-6 py-3 hover:bg-secondary/40">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${r.readAt ? 'bg-transparent' : 'bg-marca'}`} aria-label={r.readAt ? undefined : 'Não lida'} />
                        <Avatar nome={nome} className="bg-secondary text-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${r.readAt ? 'text-foreground' : 'font-semibold text-foreground'}`}>
                            {nome}
                            {!r.client && <span className="ml-2"><Badge variant="warning">sem cliente ligado</Badge></span>}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{r.template.name} · respondido em {dataBr(r.createdAt)}{r.respondentName ? ` · ${r.respondentName}` : ''}</p>
                        </div>
                        {r.alerts.length > 0 && <Badge variant="warning">{r.alerts.length} aviso{r.alerts.length > 1 ? 's' : ''}</Badge>}
                        <Badge variant="success">Respondido</Badge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </Link>
                    )
                  })}
                </div>
              )}
            </Painel>

            <Painel semPadding titulo={<>Aguardando o cliente <span className="text-muted-foreground tabular">{pendentes.length}</span></>}>
              {pendentes.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum link de cliente esperando resposta.</p>
              ) : (
                <div className="divide-y divide-border border-t border-border">
                  {pendentes.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 px-6 py-3">
                      <Avatar nome={c.client.name} className="bg-secondary text-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{c.client.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.template.name} · link criado em {dataBr(c.createdAt)} · {c.openedAt ? `abriu em ${dataBr(c.openedAt)}, ainda não enviou` : 'ainda não abriu'}
                        </p>
                      </div>
                      <Badge variant={c.openedAt ? 'info' : 'warning'}>{c.openedAt ? 'Abriu' : 'Aguardando'}</Badge>
                      <CopiarLink caminho={`/b/${c.token}`} rotulo="Copiar" />
                    </div>
                  ))}
                </div>
              )}
            </Painel>
          </div>
        )}
      </div>
    </div>
  )
}
