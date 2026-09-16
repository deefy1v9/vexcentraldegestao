'use client'

import { useState } from 'react'
import { Copy, Check, AlertTriangle, Image as ImageIcon, MessageSquare, Hash, MousePointerClick, LayoutTemplate } from 'lucide-react'
import { parseBrief, splitHashtags, captionWithHashtags, type BriefKind } from '@/lib/task-brief'

const ESTILO: Record<BriefKind, { icon: React.ElementType; cls: string; label: string }> = {
  copy: { icon: LayoutTemplate, cls: 'border-[#030A8C]/20 bg-[#030A8C]/[0.03]', label: 'Copy da arte' },
  legenda: { icon: MessageSquare, cls: 'border-gray-200 bg-white', label: 'Legenda' },
  hashtags: { icon: Hash, cls: 'border-gray-200 bg-white', label: 'Hashtags' },
  cta: { icon: MousePointerClick, cls: 'border-gray-200 bg-white', label: 'CTA' },
  imagem: { icon: ImageIcon, cls: 'border-gray-200 bg-gray-50', label: 'Imagem' },
  alerta: { icon: AlertTriangle, cls: 'border-orange-200 bg-orange-50', label: 'Atenção' },
  texto: { icon: MessageSquare, cls: 'border-gray-200 bg-white', label: 'Descrição' },
}

function BotaoCopiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(texto).then(() => {
          setOk(true)
          setTimeout(() => setOk(false), 1500)
        }).catch(() => {})
      }}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-[#030A8C] px-2 py-1 rounded-md hover:bg-white/70"
    >
      {ok ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
      {ok ? 'Copiado' : rotulo}
    </button>
  )
}

/**
 * Descrição da demanda em blocos: copy da arte, legenda, hashtags, CTA e
 * imagem, cada um com o próprio botão de copiar. Quebras de linha do texto
 * original são preservadas. Sem cabeçalho reconhecido, mostra o texto puro.
 */
export default function TaskBrief({ description }: { description: string | null | undefined }) {
  const secoes = parseBrief(description)
  if (secoes.length === 0) return null
  const legendaPronta = captionWithHashtags(secoes)

  return (
    <div className="space-y-3">
      {secoes.map((s, i) => {
        const e = ESTILO[s.kind]
        const Icon = e.icon
        return (
          <section key={i} className={`rounded-xl border p-3.5 ${e.cls}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 inline-flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {s.title || e.label}
              </p>
              {s.kind !== 'alerta' && <BotaoCopiar texto={s.body} />}
            </div>

            {s.kind === 'hashtags' ? (
              <div className="flex flex-wrap gap-1.5">
                {splitHashtags(s.body).map((h) => (
                  <span key={h} className="text-xs font-medium text-[#030A8C] bg-[#030A8C]/5 border border-[#030A8C]/15 rounded-full px-2 py-0.5">{h}</span>
                ))}
              </div>
            ) : s.kind === 'alerta' ? (
              <p className="text-sm text-orange-800 whitespace-pre-wrap">{s.body}</p>
            ) : (
              <p className={`text-sm text-gray-800 whitespace-pre-wrap leading-relaxed ${s.kind === 'copy' ? 'font-medium' : ''}`}>{s.body}</p>
            )}
          </section>
        )
      })}

      {legendaPronta && (
        <div className="flex justify-end">
          <BotaoCopiar texto={legendaPronta} rotulo="Copiar legenda + hashtags" />
        </div>
      )}
    </div>
  )
}
