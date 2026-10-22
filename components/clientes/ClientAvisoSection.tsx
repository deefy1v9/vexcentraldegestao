'use client'
import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Switch } from '@/components/vex/switch'

export interface AvisoForm {
  whatsappGroupId: string
  avisoConclusaoAtivo: boolean
}

export const EMPTY_AVISO: AvisoForm = { whatsappGroupId: '', avisoConclusaoAtivo: false }

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
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 space-y-4">
      <h2 className="font-bold text-gray-900 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-[#030A8C]" />
        Aviso no WhatsApp
      </h2>
      <p className="text-sm text-gray-500">
        Quando uma demanda deste cliente avança de uma etapa marcada no processo (briefing, desenvolvimento, publicação...), a Central avisa no grupo dele pelo WhatsApp da VEX.
      </p>

      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Grupo do cliente</label>
        <select
          value={form.whatsappGroupId}
          onChange={(e) => onChange('whatsappGroupId', e.target.value)}
          className="input"
          disabled={grupos === null}
        >
          <option value="">{grupos === null ? 'Carregando grupos…' : 'Nenhum grupo (não avisa)'}</option>
          {salvoForaDaLista && <option value={form.whatsappGroupId}>Grupo salvo (não encontrado no WhatsApp agora)</option>}
          {(grupos ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.nome || g.id} · {g.participantes} pessoas</option>
          ))}
        </select>
        {erro && <p className="text-xs text-red-600 mt-1">{erro}</p>}
        {salvoForaDaLista && <p className="text-xs text-amber-700 mt-1">O WhatsApp da Central não aparece mais neste grupo. Escolha outro ou deixe sem grupo.</p>}
      </div>

      <label className={`flex items-center gap-3 text-sm ${semGrupo ? 'text-gray-400' : 'text-gray-700'}`}>
        <Switch
          checked={form.avisoConclusaoAtivo}
          disabled={semGrupo && !form.avisoConclusaoAtivo}
          onCheckedChange={(v) => onChange('avisoConclusaoAtivo', v)}
          aria-label="Avisar o grupo quando a demanda for concluída"
        />
        Avisar o grupo quando uma etapa terminar
      </label>

      <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-600">
        <span className="font-semibold text-gray-700">Exemplo: </span>
        ✅ Atualização do seu projeto: • Finalizamos o briefing do seu site • Agendamos o post de Outubro Rosa. Qualquer dúvida, é só chamar.
      </div>
      <p className="text-xs text-gray-400">
        Sai de segunda a sexta, das 8h às 20h; fora disso espera o próximo horário. O que avançar em até 10 minutos vai numa mensagem só. As etapas e as frases são definidas em Processos. Precisa também do aviso ligado no geral (CRM › WhatsApp).
      </p>
    </div>
  )
}
