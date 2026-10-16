import { Badge } from "@/components/vex/badge";
import { cn } from "@/lib/utils";

/**
 * Um vocabulário de estado para o sistema inteiro.
 *
 * Cada estado tem UMA cor e UM rótulo, e eles não mudam de tela para tela:
 * "crítico" é vermelho na Fila e vermelho em Mensagens. Quem aprende uma
 * vez, entende em todo lugar.
 *
 * Só quatro cores carregam significado — vermelho (crítico/erro), âmbar
 * (atenção/pendente), verde (ok/conectado/finalizada) e a cor da IA
 * (`ia`). O resto é neutro. Dezenas de cores é o que faz um painel parecer
 * um CRM antigo.
 */
export type Estado =
  | "critico"
  | "atencao"
  | "normal"
  | "ia"
  | "humano"
  | "finalizada"
  | "conectado"
  | "desconectado"
  | "erro"
  | "pendente"
  | "ok"
  | "desligado"
  | "marcada"
  | "info";

const ESTADOS: Record<Estado, { rotulo: string; variant: "danger" | "warning" | "success" | "ia" | "primary" | "default" | "outline" | "info"; ponto?: string }> = {
  critico: { rotulo: "Crítico", variant: "danger" },
  atencao: { rotulo: "Atenção", variant: "warning" },
  normal: { rotulo: "Normal", variant: "outline" },
  ia: { rotulo: "Assistente", variant: "ia" },
  humano: { rotulo: "Atendente", variant: "info" },
  finalizada: { rotulo: "Finalizada", variant: "default" },
  conectado: { rotulo: "Conectado", variant: "success", ponto: "var(--success)" },
  desconectado: { rotulo: "Desconectado", variant: "danger", ponto: "var(--destructive)" },
  erro: { rotulo: "Erro", variant: "danger", ponto: "var(--destructive)" },
  pendente: { rotulo: "Configuração necessária", variant: "warning", ponto: "var(--warning)" },
  ok: { rotulo: "Ativo", variant: "success", ponto: "var(--success)" },
  desligado: { rotulo: "Desligado", variant: "default" },
  // O que está POR VIR (reunião marcada, ainda não aconteceu): a cor da
  // marca, suave, como o "O que vem por aí" do Início. Verde é o que já deu
  // certo; uma reunião marcada ainda não deu nada.
  marcada: { rotulo: "Marcada", variant: "primary", ponto: "var(--destaque-texto)" },
  info: { rotulo: "Nova", variant: "info" },
};

export function StatusBadge({
  estado,
  rotulo,
  className,
}: {
  estado: Estado;
  /** Troca o texto mantendo a cor do estado: "esperando há 3h". */
  rotulo?: React.ReactNode;
  className?: string;
}) {
  const e = ESTADOS[estado];
  return (
    <Badge variant={e.variant} className={className}>
      {e.ponto && <span aria-hidden className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: e.ponto }} />}
      {/* O rótulo num span próprio para poder truncar: texto solto dentro
          de um flex não recebe reticências, ele estoura. */}
      <span className="truncate">{rotulo ?? e.rotulo}</span>
    </Badge>
  );
}

/** Crítico / Atenção / Normal a partir do que a Fila já sabe: horas sem
 *  resposta e potencial. Uma regra só, escrita uma vez. */
export function urgenciaDe(horasSilencio: number, potencial: number, aguardandoNos: boolean): "critico" | "atencao" | "normal" {
  if (!aguardandoNos) return "normal";
  if (horasSilencio >= 4 || (horasSilencio >= 1 && potencial >= 70)) return "critico";
  if (horasSilencio >= 1 || potencial >= 70) return "atencao";
  return "normal";
}
