import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Activity, Bot, Briefcase, Calendar, ClipboardList, DollarSign, FileText, Filter, Globe, LogIn, Settings, Users, Workflow, X,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import { Painel, Chip, Numero, GrupoDaLista, type Tom } from '@/components/vex/vireo'
import { Avatar } from '@/components/vex/avatar'
import { cn } from '@/lib/utils'

const FUSO = 'America/Sao_Paulo'

/** Ícone e tom de cada módulo no registro (o resto cai no neutro). */
function estiloDoModulo(modulo: string): { icone: React.ElementType; tom: Tom } {
  const m = modulo.toLowerCase()
  if (m.includes('financ') || m.includes('caixa') || m.includes('cobran') || m.includes('bpo')) return { icone: DollarSign, tom: 'sucesso' }
  if (m.includes('cliente')) return { icone: Briefcase, tom: 'marca' }
  if (m.includes('demanda') || m.includes('tarefa')) return { icone: ClipboardList, tom: 'info' }
  if (m.includes('calend')) return { icone: Calendar, tom: 'info' }
  if (m.includes('agente') || m.includes('ia') || m.includes('planej')) return { icone: Bot, tom: 'ia' }
  if (m.includes('proposta') || m.includes('contrato') || m.includes('briefing')) return { icone: FileText, tom: 'atencao' }
  if (m.includes('processo')) return { icone: Workflow, tom: 'marca' }
  if (m.includes('colaborador') || m.includes('equipe')) return { icone: Users, tom: 'marca' }
  if (m.includes('seo')) return { icone: Globe, tom: 'info' }
  if (m.includes('login') || m.includes('auth') || m.includes('acesso')) return { icone: LogIn, tom: 'neutro' }
  if (m.includes('config') || m.includes('integra')) return { icone: Settings, tom: 'neutro' }
  return { icone: Activity, tom: 'neutro' }
}

const diaCivil = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: FUSO })
const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })

/** "HOJE · 03 NOV", "ONTEM · 02 NOV" ou "SEG · 27 OUT". */
function rotuloDoDia(iso: string, hojeIso: string, ontemIso: string) {
  const d = new Date(`${iso}T12:00:00Z`)
  const data = d.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short' }).replace('.', '')
  const prefixo = iso === hojeIso ? 'Hoje' : iso === ontemIso ? 'Ontem' : d.toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '')
  return `${prefixo} · ${data}`
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; module?: string }>
}) {
  // Logs de atividade: restritos a administradores.
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') redirect('/dashboard')

  const { userId, module } = await searchParams

  const [logs, users] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(module ? { module } : {}),
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // Módulos que de fato aparecem no registro (a lista fixa deixava de fora
  // Propostas, Pipeline, Processos, Briefings, Caixa…)
  const modules = (await prisma.activityLog.findMany({ distinct: ['module'], select: { module: true }, orderBy: { module: 'asc' } }))
    .map((m) => m.module)
    .filter(Boolean)

  // Linha do tempo agrupada pelo dia civil de Brasília
  const agora = new Date()
  const hojeIso = diaCivil(agora)
  const ontemIso = diaCivil(new Date(agora.getTime() - 24 * 60 * 60 * 1000))
  const grupos: Array<{ dia: string; itens: typeof logs }> = []
  for (const log of logs) {
    const dia = diaCivil(log.createdAt)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(log)
    else grupos.push({ dia, itens: [log] })
  }

  const pessoaFiltrada = users.find((u) => u.id === userId)
  const href = (p: { userId?: string; module?: string }) => {
    const q = new URLSearchParams()
    if (p.userId) q.set('userId', p.userId)
    if (p.module) q.set('module', p.module)
    const s = q.toString()
    return s ? `/logs?${s}` : '/logs'
  }
  const seletor = 'h-10 rounded-xl border border-border bg-card px-3 t-corpo text-foreground outline-none focus:border-marca focus:ring-2 focus:ring-marca/20 w-full sm:w-auto sm:min-w-[200px]'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Logs de Atividade" subtitle="Registro de todas as ações no sistema" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:px-8 space-y-5">
        {/* Filtros */}
        <Painel>
          <form className="flex flex-col sm:flex-row gap-3 sm:flex-wrap sm:items-center">
            <select name="userId" defaultValue={userId || ''} className={seletor} aria-label="Colaborador">
              <option value="">Todos os colaboradores</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <select name="module" defaultValue={module || ''} className={seletor} aria-label="Módulo">
              <option value="">Todos os módulos</option>
              {modules.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button type="submit"
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto h-10 px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary-hover transition-colors">
              <Filter className="w-4 h-4" /> Filtrar
            </button>
            <p className="sm:ml-auto t-legenda">
              <Numero className="text-[15px]">{logs.length}</Numero> {logs.length === 1 ? 'ação' : 'ações'} {logs.length === 100 ? '(as 100 mais recentes)' : ''}
            </p>
          </form>

          {/* Atalhos por módulo, como as pílulas do modelo */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Link
              href={href({ userId })}
              className={cn('h-7 px-2.5 inline-flex items-center rounded-lg text-[12px] font-semibold transition-colors', !module ? 'bg-marca-suave text-marca-texto' : 'bg-secondary text-muted-foreground hover:text-foreground')}
            >
              Todos os módulos
            </Link>
            {modules.map((m) => (
              <Link
                key={m}
                href={href({ userId, module: m })}
                className={cn('h-7 px-2.5 inline-flex items-center rounded-lg text-[12px] font-semibold transition-colors', module === m ? 'bg-marca-suave text-marca-texto' : 'bg-secondary text-muted-foreground hover:text-foreground')}
              >
                {m}
              </Link>
            ))}
          </div>

          {(pessoaFiltrada || module) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 t-legenda">
              <span>Filtros ativos:</span>
              {pessoaFiltrada && (
                <Link href={href({ module })} className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border bg-card text-foreground hover:border-subtle">
                  {pessoaFiltrada.name} <X className="w-3 h-3" />
                </Link>
              )}
              {module && (
                <Link href={href({ userId })} className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border bg-card text-foreground hover:border-subtle">
                  {module} <X className="w-3 h-3" />
                </Link>
              )}
              <Link href="/logs" className="font-semibold text-marca-texto hover:underline">Limpar tudo</Link>
            </div>
          )}
        </Painel>

        {/* Linha do tempo */}
        <Painel semPadding className="overflow-hidden">
          {logs.length === 0 ? (
            <div className="py-14 text-center">
              <Chip icone={Activity} tom="neutro" tamanho="lg" className="mx-auto" />
              <p className="t-secao text-foreground mt-3">Nenhum log encontrado</p>
              <p className="t-legenda mt-1">Mude os filtros para ver outras ações.</p>
            </div>
          ) : (
            grupos.map((g, gi) => (
              <div key={g.dia} className={gi === 0 ? '[&>div:first-child]:border-t-0' : ''}>
                <GrupoDaLista titulo={rotuloDoDia(g.dia, hojeIso, ontemIso)} quantidade={g.itens.length} tom={g.dia === hojeIso ? 'marca' : 'neutro'} />
                <ol className="px-6 py-2">
                  {g.itens.map((log, i) => {
                    const { icone, tom } = estiloDoModulo(log.module)
                    const ultimo = i === g.itens.length - 1
                    return (
                      <li key={log.id} className="relative flex gap-4 py-3">
                        {/* trilho da linha do tempo */}
                        {!ultimo && <span aria-hidden className="absolute left-4 top-12 bottom-0 w-px bg-border" />}
                        <Chip icone={icone} tom={tom} tamanho="sm" className="relative mt-0.5 rounded-full" />
                        <div className="min-w-0 flex-1">
                          <p className="t-corpo text-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="inline-flex items-center gap-2 font-semibold">
                              <Avatar nome={log.user.name} tamanho="sm" className="w-5 h-5 text-[9px]" />
                              {log.user.name}
                            </span>
                            <span>{log.action}</span>
                            <span className="inline-flex items-center h-[22px] rounded-md px-2 text-[11.5px] font-medium bg-secondary text-muted-foreground">{log.module}</span>
                          </p>
                          <p className="t-meta mt-1 tabular">
                            {hora(log.createdAt)}
                            {log.details && <span className="text-muted-foreground"> · <span className="break-words">{log.details}</span></span>}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))
          )}
        </Painel>
      </div>
    </div>
  )
}
