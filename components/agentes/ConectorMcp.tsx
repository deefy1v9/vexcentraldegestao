'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Bot, Check, CheckCircle2, ChevronDown, Copy, Loader2, Plug, Unplug } from 'lucide-react'
import { Chip, Numero, Painel, Sobretitulo } from '@/components/vex/vireo'

interface Conexao {
  id: string
  appName: string
  scope: string
  createdAt: string
  lastUsedAt: string | null
  queryCount: number
  revokedAt: string | null
  revokedReason: string | null
  user: { name: string }
}
interface Consulta {
  id: string
  tool: string
  args: Record<string, unknown>
  durationMs: number | null
  error: string | null
  createdAt: string
  connection: { appName: string; user: { name: string } }
}

const quando = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

/**
 * Conector de IA (MCP): o endereço que se cola no Claude Code, no Codex
 * (Habblaud) ou no Claude, quem conectou (com Desconectar) e as últimas
 * consultas. Só leitura; a conexão é um login, nunca uma chave colada.
 */
export default function ConectorMcp() {
  const [dados, setDados] = useState<{ endereco: string; conexoes: Conexao[]; consultas: Consulta[] } | null>(null)
  const [copiado, setCopiado] = useState('')
  const [desligando, setDesligando] = useState('')
  const [erro, setErro] = useState('')

  const buscar = useCallback(async () => {
    const r = await fetch('/api/mcp/conexoes', { cache: 'no-store' })
    return r.ok ? r.json() : null
  }, [])
  const aplicar = useCallback((b: typeof dados) => {
    if (b) setDados(b)
    else setErro('Não foi possível carregar o conector.')
  }, [])
  const carregar = useCallback(async () => { aplicar(await buscar()) }, [buscar, aplicar])
  useEffect(() => {
    let vivo = true
    buscar().then((b) => { if (vivo) aplicar(b) })
    return () => { vivo = false }
  }, [buscar, aplicar])

  async function copiar(texto: string, chave: string) {
    await navigator.clipboard.writeText(texto).catch(() => {})
    setCopiado(chave)
    setTimeout(() => setCopiado(''), 1500)
  }

  async function desconectar(id: string) {
    setDesligando(id); setErro('')
    const r = await fetch(`/api/mcp/conexoes/${id}`, { method: 'DELETE' })
    if (!r.ok) setErro('Não foi possível desconectar.')
    await carregar()
    setDesligando('')
  }

  if (!dados) return <div className="rounded-[24px] border border-border bg-card p-6 t-corpo text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando o conector…</div>

  const ativas = dados.conexoes.filter((c) => !c.revokedAt)
  const comErro = dados.consultas.filter((q) => q.error)
  const ultimoUso = ativas.map((c) => c.lastUsedAt).filter((d): d is string => !!d).sort().at(-1) ?? null
  const comandos = [
    { chave: 'claude', rotulo: 'Claude Code', cmd: `claude mcp add --transport http vex-central ${dados.endereco}` },
    { chave: 'codex', rotulo: 'Codex', cmd: `codex mcp add vex-central --url ${dados.endereco}` },
  ]

  return (
    <Painel
      rotulo="Integração"
      titulo={<span className="flex items-center gap-2.5"><Chip icone={Plug} tom="ia" tamanho="sm" /> Conector de IA (MCP)</span>}
      sub="Liga a Central ao Claude Code, ao Codex e ao Claude, só com login de administrador."
    >
      {/* Situação em destaque: quem está ligado, uso e falhas */}
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="rounded-xl bg-secondary/60 px-4 py-3">
          <dt className="t-meta">Conexões ativas</dt>
          <dd><Numero className="text-[20px]">{ativas.length}</Numero></dd>
        </div>
        <div className="rounded-xl bg-secondary/60 px-4 py-3">
          <dt className="t-meta">Último uso</dt>
          <dd className="t-corpo font-semibold text-foreground mt-1">{quando(ultimoUso)}</dd>
        </div>
        <div className="rounded-xl bg-secondary/60 px-4 py-3">
          <dt className="t-meta">Últimas consultas</dt>
          <dd><Numero className="text-[20px]">{dados.consultas.length}</Numero></dd>
        </div>
        <div className={`rounded-xl px-4 py-3 ${comErro.length > 0 ? 'bg-destructive-suave' : 'bg-success-suave'}`}>
          <dt className={`t-meta flex items-center gap-1 ${comErro.length > 0 ? 'text-destructive-texto' : 'text-success'}`}>
            {comErro.length > 0 ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />} Consultas com falha
          </dt>
          <dd><Numero className="text-[20px]" alerta={comErro.length > 0}>{comErro.length}</Numero></dd>
        </div>
      </dl>

      {/* Quem conectou */}
      <div className="mt-5 space-y-2">
        <Sobretitulo>Quem conectou ({ativas.length} ativa{ativas.length === 1 ? '' : 's'})</Sobretitulo>
        {dados.conexoes.length === 0 && <p className="t-legenda">Nenhum assistente conectado ainda.</p>}
        {dados.conexoes.map((c) => (
          <div key={c.id} className={`flex items-center gap-3 rounded-2xl border border-border px-4 py-3 ${c.revokedAt ? 'opacity-60' : ''}`}>
            <Chip icone={Bot} tom={c.revokedAt ? 'neutro' : 'ia'} tamanho="sm" />
            <div className="min-w-0 flex-1">
              <p className="t-corpo font-medium text-foreground truncate">{c.appName} <span className="text-muted-foreground font-normal">· {c.user.name}</span>
                <span className={`ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-md ${c.scope.includes('central.acoes') ? 'bg-warning-suave text-warning' : 'bg-secondary text-muted-foreground'}`}>{c.scope.includes('central.acoes') ? 'leitura + ações' : 'só leitura'}</span></p>
              <p className="t-legenda">
                Conectado {quando(c.createdAt)} · {c.queryCount} consulta(s) · último uso {quando(c.lastUsedAt)}
                {c.revokedAt && ` · desconectado ${quando(c.revokedAt)}${c.revokedReason ? ` (${c.revokedReason})` : ''}`}
              </p>
            </div>
            {!c.revokedAt && (
              <button onClick={() => desconectar(c.id)} disabled={desligando === c.id} className="h-8 px-3 rounded-lg border border-destructive/30 text-destructive-texto text-xs font-medium hover:bg-destructive-suave inline-flex items-center gap-1">
                {desligando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />} Desconectar
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Como conectar: recolhido, abre quando precisar */}
      <details className="group mt-5 rounded-2xl border border-border">
        <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="t-corpo font-semibold text-foreground">Como conectar <span className="t-legenda font-normal">· endereço, comandos e permissões</span></span>
          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
          <p className="t-legenda leading-snug pt-3">
            Liga a Central ao Claude Code e ao Codex (os agentes do Habblaud) e ao Claude. Eles leem clientes, demandas, financeiro e risco de churn. Com <strong>ações</strong>, o agente também lê o grupo do cliente e trabalha nas demandas da
            <strong> Fila do agente de IA</strong> até entregar para você validar; aprovar e avisar o cliente continua com você. A conexão é um login de administrador, sem chave colada.
            Para dar ações a uma conexão só de leitura, desconecte e conecte de novo.
          </p>
          <Sobretitulo>Endereço do conector</Sobretitulo>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-xs bg-secondary/60 border border-border rounded-lg px-3 py-2">{dados.endereco}</code>
            <button onClick={() => copiar(dados.endereco, 'url')} className="h-8 px-3 rounded-lg border border-border text-xs font-medium hover:bg-secondary/60 inline-flex items-center gap-1">
              {copiado === 'url' ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />} Copiar
            </button>
          </div>
          {comandos.map((c) => (
            <div key={c.chave} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-24 shrink-0">{c.rotulo}</span>
              <code className="flex-1 min-w-0 truncate text-[11px] bg-foreground text-background rounded-lg px-3 py-2">{c.cmd}</code>
              <button onClick={() => copiar(c.cmd, c.chave)} className="h-8 px-2.5 rounded-lg border border-border text-xs hover:bg-secondary/60" aria-label={`Copiar comando do ${c.rotulo}`}>
                {copiado === c.chave ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">No Claude (claude.ai): Configurações › Conectores › Adicionar conector personalizado, com o endereço acima. Depois de adicionar, o assistente abre o login da Central: entre e clique em Autorizar. No Codex, o login abre com <code>codex mcp login vex-central</code>.</p>
        </div>
      </details>

      {/* Últimas consultas: recolhido, com as falhas no rótulo */}
      <details className="group mt-3 rounded-2xl border border-border">
        <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="t-corpo font-semibold text-foreground">
            Últimas consultas <span className="t-legenda font-normal">· {dados.consultas.length}</span>
            {comErro.length > 0 && <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-destructive-suave text-destructive-texto">{comErro.length} com erro</span>}
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-3 border-t border-border">
          {dados.consultas.length === 0 && <p className="t-legenda pt-3">Nenhuma consulta ainda.</p>}
          <ul className="divide-y divide-border">
            {dados.consultas.map((q) => (
              <li key={q.id} className="py-2 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-24 shrink-0 tabular">{quando(q.createdAt)}</span>
                <span className="font-mono text-foreground">{q.tool}</span>
                <span className="text-muted-foreground truncate flex-1">{Object.entries(q.args ?? {}).map(([k, v]) => `${k}=${String(v)}`).join(' · ')}</span>
                <span className="text-muted-foreground shrink-0">{q.connection.appName} · {q.connection.user.name}</span>
                {q.error && <span className="text-destructive-texto font-semibold shrink-0" title={q.error}>erro</span>}
              </li>
            ))}
          </ul>
        </div>
      </details>
      {erro && <p className="t-rotulo text-destructive-texto mt-3">{erro}</p>}
    </Painel>
  )
}
