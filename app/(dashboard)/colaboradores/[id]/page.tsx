'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { ArrowLeft, Save, Trash2, Mail, DollarSign, Shield, KeyRound } from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/vex/button'
import { Avatar } from '@/components/vex/avatar'
import { Painel, Chip, Numero, Sobretitulo } from '@/components/vex/vireo'

interface User {
  id: string
  name: string
  email: string
  role: string
  phone?: string | null
  position?: string | null
  salary?: number | null
  isActive: boolean
  createdAt: string
  activityLogs: { id: string; action: string; module: string; details?: string | null; createdAt: string }[]
  assignedTasks: { id: string; title: string; status: string; client?: { name: string } | null }[]
}

const STATUS_COLORS: Record<string, string> = {
  TODO: 'bg-secondary text-muted-foreground',
  EM_ANDAMENTO: 'bg-warning-suave text-warning',
  EM_REVISAO: 'bg-info-suave text-info',
  CONCLUIDO: 'bg-success-suave text-success',
  BACKLOG: 'bg-secondary text-muted-foreground',
}

const STATUS_LABEL: Record<string, string> = {
  TODO: 'A Fazer',
  EM_ANDAMENTO: 'Em Andamento',
  EM_REVISAO: 'Em Revisão',
  CONCLUIDO: 'Concluído',
  BACKLOG: 'Backlog',
}

export default function EditColaboradorPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'COLABORADOR',
    phone: '',
    position: '',
    salary: '',
  })

  useEffect(() => {
    fetch(`/api/colaboradores/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setUser(data)
        setForm({
          name: data.name || '',
          email: data.email || '',
          role: data.role || 'COLABORADOR',
          phone: data.phone || '',
          position: data.position || '',
          salary: data.salary?.toString() || '',
        })
        setLoading(false)
      })
  }, [id])

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body: Record<string, unknown> = { ...form, salary: form.salary ? Number(form.salary) : null }
    if (newPassword) body.password = newPassword

    const res = await fetch(`/api/colaboradores/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      router.push('/colaboradores')
    } else {
      alert('Erro ao salvar')
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!confirm('Desativar este colaborador? Ele perderá acesso ao sistema.')) return
    const res = await fetch(`/api/colaboradores/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/colaboradores')
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Header title="Carregando..." />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-marca border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!user) return null

  // A API devolve só as 10 demandas mais recentes: os números dizem isso.
  const recentes = user.assignedTasks
  const abertas = recentes.filter((t) => t.status !== 'CONCLUIDO').length
  const concluidas = recentes.length - abertas
  const campo = 'block t-rotulo font-semibold text-foreground mb-1.5'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title={`Editar — ${user.name}`} subtitle={user.position || user.role} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:px-8">
        <div className="max-w-6xl">
          <Link href="/colaboradores" className="inline-flex items-center gap-1 t-corpo text-muted-foreground hover:text-foreground mb-5">
            <ArrowLeft className="w-4 h-4" /> Voltar para Colaboradores
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
            {/* Edit Form */}
            <div className="space-y-5 order-2 lg:order-1">
              <form onSubmit={handleSave} className="space-y-5">
                <Painel rotulo="Cadastro" titulo={<span className="flex items-center gap-2.5"><Chip icone={Mail} tamanho="sm" /> Dados Pessoais</span>}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className={campo}>Nome Completo *</label>
                      <input
                        required
                        value={form.name}
                        onChange={(e) => setField('name', e.target.value)}
                        className="input"
                        placeholder="Nome do colaborador"
                      />
                    </div>
                    <div>
                      <label className={campo}>Email *</label>
                      <input
                        required
                        type="email"
                        value={form.email}
                        onChange={(e) => setField('email', e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className={campo}>Telefone</label>
                      <input
                        value={form.phone}
                        onChange={(e) => setField('phone', e.target.value)}
                        className="input"
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                    <div>
                      <label className={campo}>Cargo</label>
                      <input
                        value={form.position}
                        onChange={(e) => setField('position', e.target.value)}
                        className="input"
                        placeholder="Ex: Designer, Redator..."
                      />
                    </div>
                    <div>
                      <label className="t-rotulo font-semibold text-foreground mb-1.5 flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5" /> Nível de Acesso
                      </label>
                      <select
                        value={form.role}
                        onChange={(e) => setField('role', e.target.value)}
                        className="input"
                      >
                        <option value="COLABORADOR">Colaborador</option>
                        <option value="ADMIN">Administrador</option>
                      </select>
                    </div>
                  </div>
                </Painel>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Painel rotulo="Remuneração" titulo={<span className="flex items-center gap-2.5"><Chip icone={DollarSign} tom="sucesso" tamanho="sm" /> Financeiro</span>}>
                    <label className={campo}>Salário Mensal (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.salary}
                      onChange={(e) => setField('salary', e.target.value)}
                      className="input"
                      placeholder="Ex: 3500.00"
                    />
                  </Painel>

                  <Painel rotulo="Acesso" titulo={<span className="flex items-center gap-2.5"><Chip icone={KeyRound} tom="neutro" tamanho="sm" /> Alterar Senha</span>}>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input"
                      placeholder="Nova senha (mín. 6 caracteres)"
                      minLength={6}
                    />
                    <p className="t-legenda mt-1.5">Deixe em branco para manter a senha atual.</p>
                  </Painel>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={saving}>
                    <Save />
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/colaboradores">Cancelar</Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleDeactivate}
                    className="sm:ml-auto text-destructive-texto hover:bg-destructive-suave hover:text-destructive-texto"
                  >
                    <Trash2 />
                    Desativar
                  </Button>
                </div>
              </form>
            </div>

            {/* Perfil (modelo Vireo: cartão da pessoa e números) */}
            <div className="space-y-5 order-1 lg:order-2">
              <section className="rounded-[24px] border border-border bg-card overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="h-20 bg-gradient-to-br from-marca-suave via-marca-suave/60 to-card" />
                <div className="px-6 pb-6 -mt-9">
                  <Avatar nome={user.name} tamanho="xl" className="w-[72px] h-[72px] text-[22px] bg-marca text-white ring-4 ring-card" />
                  <h2 className="mt-3 font-display text-[21px] font-semibold tracking-[-0.01em] text-foreground">{user.name}</h2>
                  <p className="t-legenda">{user.position || 'Sem cargo definido'}</p>
                  <span className={`mt-2 inline-flex items-center gap-1 h-[22px] rounded-md px-2 text-[11.5px] font-medium ${user.role === 'ADMIN' ? 'bg-marca-suave text-marca-texto' : 'bg-secondary text-muted-foreground'}`}>
                    <Shield className="w-3 h-3" /> {user.role === 'ADMIN' ? 'Administrador' : 'Colaborador'}
                  </span>

                  <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-secondary/60 py-2.5 flex flex-col-reverse">
                      <dt className="t-meta">em aberto</dt>
                      <dd><Numero className="text-[20px]">{abertas}</Numero></dd>
                    </div>
                    <div className="rounded-xl bg-secondary/60 py-2.5 flex flex-col-reverse">
                      <dt className="t-meta">concluídas</dt>
                      <dd><Numero className="text-[20px]">{concluidas}</Numero></dd>
                    </div>
                    <div className="rounded-xl bg-secondary/60 py-2.5 flex flex-col-reverse">
                      <dt className="t-meta">ações</dt>
                      <dd><Numero className="text-[20px]">{user.activityLogs.length}</Numero></dd>
                    </div>
                  </dl>
                  <p className="t-legenda mt-2">
                    Contando as {recentes.length} demandas mais recentes e as {user.activityLogs.length} últimas ações registradas.
                  </p>
                  {user.salary && (
                    <div className="mt-4 pt-4 border-t border-border flex items-baseline justify-between">
                      <Sobretitulo>Salário</Sobretitulo>
                      <span><Numero className="text-[16px]">{formatCurrency(user.salary)}</Numero><span className="t-legenda">/mês</span></span>
                    </div>
                  )}
                </div>
              </section>

              {/* Demandas recentes */}
              {recentes.length > 0 && (
                <Painel rotulo={`As ${recentes.length} mais recentes`} titulo="Demandas Atribuídas" semPadding>
                  <ul className="divide-y divide-border border-t border-border">
                    {recentes.map((task) => (
                      <li key={task.id} className="px-6 py-3 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="t-corpo font-medium text-foreground leading-tight">{task.title}</p>
                          {task.client && <p className="t-legenda mt-0.5">{task.client.name}</p>}
                        </div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium shrink-0 ${STATUS_COLORS[task.status] || 'bg-secondary text-muted-foreground'}`}>
                          {STATUS_LABEL[task.status] || task.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Painel>
              )}

              {/* Atividade recente */}
              {user.activityLogs.length > 0 && (
                <Painel rotulo="Linha do tempo" titulo="Atividade Recente">
                  <ol>
                    {user.activityLogs.slice(0, 8).map((log, i, arr) => (
                      <li key={log.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
                        {i < arr.length - 1 && <span aria-hidden className="absolute left-[5px] top-3 bottom-0 w-px bg-border" />}
                        <span className="relative w-[11px] h-[11px] rounded-full bg-marca-suave ring-2 ring-marca/40 mt-1 shrink-0" />
                        <div className="min-w-0">
                          <p className="t-corpo text-foreground leading-snug">{log.action}</p>
                          <p className="t-meta">{log.module} · {formatDateTime(log.createdAt)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Painel>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
