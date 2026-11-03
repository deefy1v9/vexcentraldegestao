import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/api-auth'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { Plus, Mail, Phone, Pencil, ClipboardList, Activity, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/vex/button'
import { Avatar } from '@/components/vex/avatar'
import { Numero, Sobretitulo } from '@/components/vex/vireo'

const ACESSO: Record<string, string> = { ADMIN: 'Administrador', COLABORADOR: 'Colaborador' }

export default async function ColaboradoresPage() {
  // Equipe, salários e contatos: restrito a administradores.
  const viewer = await getSessionUser()
  if (!viewer || viewer.role !== 'ADMIN') redirect('/dashboard')

  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: {
      _count: { select: { assignedTasks: true, activityLogs: true } },
    },
    orderBy: { name: 'asc' },
  })

  const admins = users.filter((u) => u.role === 'ADMIN').length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Colaboradores"
        subtitle={`${users.length} colaborador(es) ativo(s)`}
        acoes={
          <Button asChild>
            <Link href="/colaboradores/novo"><Plus /> Novo Colaborador</Link>
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:px-8 space-y-5">
        {/* Barra do modelo: quantos e de que nível */}
        <div className="rounded-[24px] border border-border bg-card px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="t-corpo text-muted-foreground"><Numero className="text-[18px] mr-1">{users.length}</Numero> pessoa(s) na equipe</p>
          <span className="hidden sm:block w-px h-5 bg-border" />
          <p className="t-corpo text-muted-foreground"><Numero className="text-[18px] mr-1">{admins}</Numero> administrador(es)</p>
          <p className="t-corpo text-muted-foreground"><Numero className="text-[18px] mr-1">{users.length - admins}</Numero> colaborador(es)</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {users.map((user) => (
            <article key={user.id} className="rounded-[24px] border border-border bg-card p-6 flex flex-col shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-marca/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <Avatar nome={user.name} tamanho="lg" className="w-14 h-14 text-[18px] bg-marca-suave text-marca-texto" />
                <span className={`inline-flex items-center gap-1 h-[22px] rounded-md px-2 text-[11.5px] font-medium ${user.role === 'ADMIN' ? 'bg-marca-suave text-marca-texto' : 'bg-secondary text-muted-foreground'}`}>
                  {user.role === 'ADMIN' && <ShieldCheck className="w-3 h-3" />}
                  {ACESSO[user.role] ?? user.role}
                </span>
              </div>

              <h3 className="mt-4 font-display text-[17px] font-semibold tracking-[-0.01em] text-foreground truncate">{user.name}</h3>
              <p className="t-legenda mt-0.5">{user.position || 'Sem cargo definido'}</p>

              <div className="mt-3 space-y-1">
                <p className="flex items-center gap-1.5 t-legenda min-w-0">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </p>
                {user.phone && (
                  <p className="flex items-center gap-1.5 t-legenda">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{user.phone}</span>
                  </p>
                )}
              </div>

              {/* Números com rótulo próprio: total no histórico, não "abertas" */}
              <dl className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
                  <dt className="t-meta flex items-center gap-1 whitespace-nowrap"><ClipboardList className="w-3 h-3 shrink-0" /> Demandas</dt>
                  <dd>
                    <Numero className="block text-[20px] leading-7">{user._count.assignedTasks}</Numero>
                    <span className="t-legenda block">atribuídas, desde o início</span>
                  </dd>
                </div>
                <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
                  <dt className="t-meta flex items-center gap-1 whitespace-nowrap"><Activity className="w-3 h-3 shrink-0" /> Ações</dt>
                  <dd>
                    <Numero className="block text-[20px] leading-7">{user._count.activityLogs}</Numero>
                    <span className="t-legenda block">registradas no sistema</span>
                  </dd>
                </div>
              </dl>
              {user.salary && (
                <div className="mt-3 flex items-baseline justify-between">
                  <Sobretitulo>Salário</Sobretitulo>
                  <span className="t-corpo"><Numero className="text-[15px]">{formatCurrency(user.salary)}</Numero><span className="t-legenda">/mês</span></span>
                </div>
              )}

              <div className="mt-auto pt-5 flex items-center gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link href={`/colaboradores/${user.id}`}><Pencil /> Editar</Link>
                </Button>
                <Button asChild variant="ghost" size="icon-sm" aria-label={`Enviar e-mail para ${user.name}`}>
                  <a href={`mailto:${user.email}`}><Mail /></a>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
