/**
 * Hook de inicialização do Next.js: roda uma vez quando o servidor sobe.
 *
 * É aqui que o despachante de mensagens agendadas é ligado. Rodar dentro do
 * próprio processo evita um container extra só para o cron — o stack tem uma
 * réplica do app, então não há risco de dois despachantes concorrendo.
 */
export async function register() {
  // Só no runtime Node: o middleware roda no Edge e não deve iniciar timers.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { startScheduler } = await import('./lib/scheduler')
  startScheduler()
}
