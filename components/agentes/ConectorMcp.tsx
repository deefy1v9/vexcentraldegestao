'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Loader2, Plug, Unplug } from 'lucide-react'

interface Conexao {
  id: string
  appName: string
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

  if (!dados) return <div className="card p-5 text-sm text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando o conector…</div>

  const ativas = dados.conexoes.filter((c) => !c.revokedAt)
  const comandos = [
    { chave: 'claude', rotulo: 'Claude Code', cmd: `claude mcp add --transport http vex-central ${dados.endereco}` },
    { chave: 'codex', rotulo: 'Codex', cmd: `codex mcp add vex-central --url ${dados.endereco}` },
  ]

  return (
    <div className="card p-5 space-y-5">
      <div>
        <p className="text-sm font-bold text-gray-900 flex items-center gap-2"><Plug className="w-4 h-4 text-[#030A8C]" /> Conector de IA (MCP)</p>
        <p className="text-xs text-gray-500 mt-1 leading-snug">
          Liga a Central ao Claude Code e ao Codex (os agentes do Habblaud) e ao Claude. Eles leem clientes, demandas, financeiro e risco de churn,
          <strong> só leitura</strong>. A conexão é um login de administrador, sem chave colada.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Endereço do conector</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{dados.endereco}</code>
          <button onClick={() => copiar(dados.endereco, 'url')} className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50 inline-flex items-center gap-1">
            {copiado === 'url' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />} Copiar
          </button>
        </div>
        {comandos.map((c) => (
          <div key={c.chave} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-24 shrink-0">{c.rotulo}</span>
            <code className="flex-1 min-w-0 truncate text-[11px] bg-gray-900 text-gray-100 rounded-lg px-3 py-2">{c.cmd}</code>
            <button onClick={() => copiar(c.cmd, c.chave)} className="h-8 px-2.5 rounded-lg border border-gray-200 text-xs hover:bg-gray-50" aria-label={`Copiar comando do ${c.rotulo}`}>
              {copiado === c.chave ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        ))}
        <p className="text-[11px] text-gray-400">No Claude (claude.ai): Configurações › Conectores › Adicionar conector personalizado, com o endereço acima. Depois de adicionar, o assistente abre o login da Central: entre e clique em Autorizar. No Codex, o login abre com <code>codex mcp login vex-central</code>.</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quem conectou ({ativas.length} ativa{ativas.length === 1 ? '' : 's'})</p>
        {dados.conexoes.length === 0 && <p className="text-xs text-gray-400">Nenhum assistente conectado ainda.</p>}
        {dados.conexoes.map((c) => (
          <div key={c.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${c.revokedAt ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{c.appName} <span className="text-gray-400 font-normal">· {c.user.name}</span></p>
              <p className="text-[11px] text-gray-500">
                Conectado {quando(c.createdAt)} · {c.queryCount} consulta(s) · último uso {quando(c.lastUsedAt)}
                {c.revokedAt && ` · desconectado ${quando(c.revokedAt)}${c.revokedReason ? ` (${c.revokedReason})` : ''}`}
              </p>
            </div>
            {!c.revokedAt && (
              <button onClick={() => desconectar(c.id)} disabled={desligando === c.id} className="h-8 px-3 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 inline-flex items-center gap-1">
                {desligando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />} Desconectar
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Últimas consultas</p>
        {dados.consultas.length === 0 && <p className="text-xs text-gray-400">Nenhuma consulta ainda.</p>}
        <ul className="divide-y divide-gray-100">
          {dados.consultas.map((q) => (
            <li key={q.id} className="py-1.5 flex items-center gap-2 text-xs">
              <span className="text-gray-400 w-24 shrink-0">{quando(q.createdAt)}</span>
              <span className="font-mono text-[#030A8C]">{q.tool}</span>
              <span className="text-gray-500 truncate flex-1">{Object.entries(q.args ?? {}).map(([k, v]) => `${k}=${String(v)}`).join(' · ')}</span>
              <span className="text-gray-400 shrink-0">{q.connection.appName} · {q.connection.user.name}</span>
              {q.error && <span className="text-red-600 shrink-0" title={q.error}>erro</span>}
            </li>
          ))}
        </ul>
      </div>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  )
}
