'use client'
import { useEffect, useState } from 'react'
import { Bot, MessageCircle } from 'lucide-react'
import { Switch } from '@/components/vex/switch'
import { campo } from '@/components/clientes/FormSecao'

export interface AvisoForm {
  whatsappGroupId: string
  avisoConclusaoAtivo: boolean
  agenteAcompanha: boolean
}

export const EMPTY_AVISO: AvisoForm = { whatsappGroupId: '', avisoConclusaoAtivo: false, agenteAcompanha: false }

type Grupo = { id: string; nome: string; participantes: number }

/**
 * Seção "Aviso no WhatsApp" do cadastro do cliente (só admin): escolhe o grupo
 * do cliente e liga o aviso automático de demanda concluída.
 */
export default function ClientAvisoSection({
  form,
  onChange,
}: {
  form: AvisoForm
  onChange: <K extends keyof AvisoForm>(field: K, value: AvisoForm[K]) => void
}) {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/whatsapp/grupos')
      .then(async (r) => {
        const b = await r.json().catch(() => ({}))
        if (!vivo) return
        setGrupos(b.grupos ?? [])
        if (!r.ok) setErro(b.error || 'Não consegui listar os grupos do WhatsApp.')
      })
      .catch(() => { if (vivo) { setGrupos([]); setErro('Falha de conexão ao listar os grupos.') } })
    return () => { vivo = false }
  }, [])

  // Grupo salvo que não aparece mais na lista (o número saiu do grupo, por exemplo)
  const salvoForaDaLista = !!form.whatsappGroupId && grupos !== null && !grupos.some((g) => g.id === form.whatsappGroupId)
  const semGrupo = !form.whatsappGroupId

  return (
    <section className="bg-card rounded-[24px] border border-border p-6 space-y-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <h2 className="font-display text-[21px] font-semibold tracking-[-0.01em] text-foreground flex items-center gap-3">
        <span className="w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-marca-suave text-marca-texto"><MessageCircle className="w-[18px] h-[18px]" /></span>
        Aviso no WhatsApp
      </h2>
      <p className="text-sm text-muted-foreground">
        Quando uma demanda deste cliente avança de uma etapa marcada no processo (briefing, desenvolvimento, publicação...), a Central avisa no grupo dele pelo WhatsApp da VEX.
      </p>

      <div>
        <label className="block text-[13px] font-medium text-foreground mb-1.5">Grupo do cliente</label>
        <select
          value={form.whatsappGroupId}
          onChange={(e) => onChange('whatsappGroupId', e.target.value)}
          className={campo}
          disabled={grupos === null}
        >
          <option value="">{grupos === null ? 'Carregando grupos…' : 'Nenhum grupo (não avisa)'}</option>
          {salvoForaDaLista && <option value={form.whatsappGroupId}>Grupo salvo (não encontrado no WhatsApp agora)</option>}
          {(grupos ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.nome || g.id} · {g.participantes} pessoas</option>
          ))}
        </select>
        {erro && <p className="text-xs text-destructive-texto mt-1">{erro}</p>}
        {salvoForaDaLista && <p className="text-xs text-warning mt-1">O WhatsApp da Central não aparece mais neste grupo. Escolha outro ou deixe sem grupo.</p>}
      </div>

      <label className={`flex items-center gap-3 text-sm ${semGrupo ? 'text-muted-foreground' : 'text-foreground'}`}>
        <Switch
          checked={form.avisoConclusaoAtivo}
          disabled={semGrupo && !form.avisoConclusaoAtivo}
          onCheckedChange={(v) => onChange('avisoConclusaoAtivo', v)}
          aria-label="Avisar o grupo quando a demanda for concluída"
        />
        Avisar o grupo quando uma etapa terminar
      </label>

      <div className={`space-y-1 ${semGrupo ? 'text-muted-foreground' : 'text-foreground'}`}>
        <label className="flex items-center gap-3 text-sm">
          <Switch
            checked={form.agenteAcompanha}
            disabled={semGrupo && !form.agenteAcompanha}
            onCheckedChange={(v) => onChange('agenteAcompanha', v)}
            aria-label="Agente de IA acompanha o grupo"
          />
          <Bot className="w-4 h-4 text-ia" /> Agente de IA acompanha o grupo
        </label>
        <p className="text-xs text-muted-foreground pl-12">O agente lê as mensagens novas do grupo e já trabalha os pedidos de ajuste, entregando para você validar. Ele nunca responde no grupo: o aviso ao cliente só sai depois da sua aprovação.</p>
      </div>

      <div className="rounded-[16px] bg-secondary/60 border border-border px-4 py-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Exemplo: </span>
        ✅ Atualização do seu projeto: • Finalizamos o briefing do seu site • Agendamos o post de Outubro Rosa. Qualquer dúvida, é só chamar.
      </div>
      <p className="text-xs text-muted-foreground">
        Sai de segunda a sexta, das 8h às 20h; fora disso espera o próximo horário. O que avançar em até 10 minutos vai numa mensagem só. As etapas e as frases são definidas em Processos. Precisa também do aviso ligado no geral (CRM › WhatsApp).
      </p>
    </section>
  )
}
