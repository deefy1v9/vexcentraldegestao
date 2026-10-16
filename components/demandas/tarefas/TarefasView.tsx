'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MousePointerClick } from 'lucide-react'
import ListaTarefas, { filtrarPorRecorte, ordenarPorPrazo, type Recorte } from './ListaTarefas'
import ResumoTarefa from './ResumoTarefa'
import type { Option, ProcessOption, Task } from '../types'

const RECORTES: Recorte[] = ['abertas', 'atrasadas', 'hoje', 'semana', 'concluidas']

/**
 * Tarefas no padrão de plataforma de processos: lista à esquerda, resumo da
 * tarefa à direita, na mesma tela. Colaborador vê as tarefas que estão com
 * ele; admin alterna entre as dele e as da equipe. A tarefa aberta fica na
 * URL (?t=id), então o link pode ser compartilhado.
 */
export default function TarefasView({
  tasks, processes, myTeamIds = [], clients, users, currentUserId, isAdmin, onReload,
}: {
  tasks: Task[]
  processes: ProcessOption[]
  myTeamIds?: string[]
  clients: Option[]
  users: Option[]
  currentUserId: string
  isAdmin: boolean
  onReload: () => Promise<void> | void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const selecionada = params.get('t')

  const [busca, setBusca] = useState('')
  const [recorte, setRecorte] = useState<Recorte>('abertas')
  const [processo, setProcesso] = useState('')
  const [cliente, setCliente] = useState('')
  const [escopo, setEscopo] = useState<'minhas' | 'equipe'>('minhas')
  const [pessoa, setPessoa] = useState('')

  function selecionar(id: string | null) {
    const q = new URLSearchParams(params.toString())
    if (id) q.set('t', id); else q.delete('t')
    router.replace(`${pathname}?${q.toString()}`, { scroll: false })
  }

  // Recorte de pessoa/escopo + busca + filtros, sem o recorte de prazo (é sobre
  // ele que os contadores dos chips contam)
  const base = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return tasks.filter((t) => {
      // Minhas = comigo, ou na fila de uma equipe minha sem ninguém ainda
      const naMinhaFila = !t.assignee && !!t.teamId && myTeamIds.includes(t.teamId)
      if (!isAdmin || escopo === 'minhas') { if (t.assignee?.id !== currentUserId && !naMinhaFila) return false }
      else if (pessoa && t.assignee?.id !== pessoa) return false
      if (processo && t.process?.id !== processo) return false
      if (cliente && t.client?.id !== cliente) return false
      if (termo) {
        const alvo = `${t.number} #${t.number} ${t.title} ${t.client?.name ?? ''} ${t.stage?.name ?? ''}`.toLowerCase()
        if (!alvo.includes(termo)) return false
      }
      return true
    })
  }, [tasks, isAdmin, escopo, pessoa, processo, cliente, busca, currentUserId, myTeamIds])

  const contagem = useMemo(
    () => Object.fromEntries(RECORTES.map((r) => [r, filtrarPorRecorte(base, r).length])) as Record<Recorte, number>,
    [base],
  )
  const visiveis = useMemo(() => {
    const lista = filtrarPorRecorte(base, recorte)
    return recorte === 'concluidas' ? lista.slice(0, 100) : ordenarPorPrazo(lista)
  }, [base, recorte])

  const pessoasDaEquipe = useMemo(() => users.filter((u) => tasks.some((t) => t.assignee?.id === u.id)), [users, tasks])

  return (
    <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 px-2 pb-2">
      <aside className={`min-h-0 rounded-[12px] border border-border bg-card overflow-hidden ${selecionada ? 'hidden lg:block' : 'block'}`}>
        <ListaTarefas
          tarefas={visiveis}
          total={contagem.abertas}
          selecionada={selecionada}
          onSelecionar={selecionar}
          busca={busca} onBusca={setBusca}
          recorte={recorte} onRecorte={setRecorte} contagem={contagem}
          processos={processes} processo={processo} onProcesso={setProcesso}
          clientes={clients} cliente={cliente} onCliente={setCliente}
          isAdmin={isAdmin} escopo={escopo} onEscopo={(e) => { setEscopo(e); setPessoa('') }}
          pessoas={pessoasDaEquipe} pessoa={pessoa} onPessoa={setPessoa}
        />
      </aside>

      <section className={`min-h-0 rounded-[12px] border border-border bg-card overflow-hidden ${selecionada ? 'block' : 'hidden lg:block'}`}>
        {selecionada ? (
          <ResumoTarefa
            key={selecionada}
            taskId={selecionada}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            myTeamIds={myTeamIds}
            users={users}
            onChanged={onReload}
            onVoltar={() => selecionar(null)}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <MousePointerClick className="w-7 h-7 text-subtle mb-3" />
            <p className="t-secao text-foreground">Selecione uma tarefa</p>
            <p className="t-rotulo text-muted-foreground mt-1 max-w-xs">O resumo aparece aqui: o que fazer agora, o briefing, comentários e histórico.</p>
          </div>
        )}
      </section>
    </div>
  )
}
