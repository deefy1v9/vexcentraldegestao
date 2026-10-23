/**
 * O que o agente de IA pode fazer numa demanda. Conferido NO SERVIDOR, a
 * cada ação (não depende do assistente se comportar). Testado em
 * scripts/tests/mcp-agente.test.ts.
 *
 *   - só mexe em demanda marcada "Fila do agente de IA" (tag agente-ia);
 *   - só entrega etapa de execução: aprovar é sempre de uma pessoa;
 *   - nunca conclui a demanda (a próxima etapa não pode ser a final);
 *   - nunca sai de etapa que avisa o cliente: quem dispara o aviso no grupo
 *     é a Central, depois que a pessoa aprova.
 */

export const TAG_AGENTE = 'agente-ia'

export const naFilaDoAgente = (tags: string[] | null | undefined) => (tags ?? []).includes(TAG_AGENTE)

interface EtapaMin { name: string; kind: string; notifyClient?: boolean | null }

/** null = pode entregar; senão, o motivo (vai para o agente explicar ao Antonio). */
export function motivoParaNaoEntregar(tags: string[] | null | undefined, atual: EtapaMin | null, destino: EtapaMin | null): string | null {
  if (!naFilaDoAgente(tags)) return 'Esta demanda não está na fila do agente de IA. Peça para marcarem "Fila do agente de IA" na Central.'
  if (!atual) return 'A demanda não está em nenhuma etapa do processo.'
  if (atual.kind === 'FINAL') return 'A demanda já está concluída.'
  if (atual.kind !== 'EXECUCAO') return `A etapa "${atual.name}" é de aprovação: quem aprova é uma pessoa, na Central.`
  if (atual.notifyClient) return `A etapa "${atual.name}" avisa o cliente ao terminar: só uma pessoa pode concluí-la.`
  if (!destino) return 'Não há próxima etapa.'
  if (destino.kind === 'FINAL') return 'Entregar agora concluiria a demanda: só uma pessoa pode concluir.'
  return null
}

/** Texto do aviso ao responsável quando o agente entrega para validar. */
export function avisoDeEntrega(d: { numero: number; titulo: string; etapa: string; resumo: string; link?: string | null; app: string }): string {
  return [
    `🤖 ${d.app} entregou a demanda #${d.numero} (${d.titulo}) para você validar em "${d.etapa}".`,
    `O que foi feito: ${d.resumo.slice(0, 300)}`,
    d.link ? `Link: ${d.link}` : null,
    'Aprove na Central para seguir (o aviso ao cliente só sai depois da sua aprovação).',
  ].filter(Boolean).join('\n')
}
