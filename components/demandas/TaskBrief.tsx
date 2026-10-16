'use client'

import { useState } from 'react'
import { Copy, Check, AlertTriangle, Image as ImageIcon, MessageSquare, Hash, MousePointerClick, LayoutTemplate } from 'lucide-react'
import { parseBrief, splitHashtags, captionWithHashtags, type BriefKind } from '@/lib/task-brief'

const ESTILO: Record<BriefKind, { icon: React.ElementType; cls: string; label: string }> = {
  copy: { icon: LayoutTemplate, cls: 'border-primary/25 bg-destaque', label: 'Copy da arte' },
  legenda: { icon: MessageSquare, cls: 'border-border bg-card', label: 'Legenda' },
  hashtags: { icon: Hash, cls: 'border-border bg-card', label: 'Hashtags' },
  cta: { icon: MousePointerClick, cls: 'border-border bg-card', label: 'CTA' },
  imagem: { icon: ImageIcon, cls: 'border-border bg-secondary', label: 'Imagem' },
  alerta: { icon: AlertTriangle, cls: 'border-orange-200 bg-orange-50', label: 'Atenção' },
  texto: { icon: MessageSquare, cls: 'border-border bg-card', label: 'Descrição' },
}

/** Cabeçalho do briefing em caixa normal: "COPY DA ARTE" vira "Copy da arte". */
function caixaNormal(t: string) {
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t
}

/** URLs viram links clicáveis; o resto do texto fica intacto. */
function comLinks(texto: string) {
  return texto.split(/(https?:\/\/\S+)/g).map((parte, i) => (
    /^https?:\/\//.test(parte)
      ? <a key={i} href={parte} target="_blank" rel="noopener noreferrer" className="text-link underline break-all">{parte}</a>
      : <span key={i}>{parte}</span>
  ))
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
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-secondary"
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
              <p className="t-rotulo text-muted-foreground inline-flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {caixaNormal(s.title || e.label)}
              </p>
              {s.kind !== 'alerta' && <BotaoCopiar texto={s.body} />}
            </div>

            {s.kind === 'hashtags' ? (
              <div className="flex flex-wrap gap-1.5">
                {splitHashtags(s.body).map((h) => (
                  <span key={h} className="text-[11.5px] font-medium text-muted-foreground bg-secondary rounded-md px-2 py-0.5">{h}</span>
                ))}
              </div>
            ) : s.kind === 'alerta' ? (
              <p className="text-sm text-orange-800 whitespace-pre-wrap">{s.body}</p>
            ) : (
              <p className={`t-corpo text-foreground whitespace-pre-wrap leading-relaxed ${s.kind === 'copy' ? 'font-medium' : ''}`}>{comLinks(s.body)}</p>
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
