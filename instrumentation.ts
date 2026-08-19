/**
 * Agendador interno do servidor (Next.js instrumentation hook).
 *
 * A cada minuto compara o horário civil de America/Sao_Paulo com o horário
 * configurado (SystemSettings BILLING_REMINDER_TIME, padrão 09:00) e dispara
 * a rotina de confirmação de cobranças via WhatsApp. A marca de última
 * execução fica no banco (BILLING_REMINDER_LAST_RUN), então reinícios do
 * container não duplicam envios — e a chave única por cobrança é uma segunda
 * barreira contra mensagens repetidas.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { prisma } = await import('./lib/prisma')
  const { spNow, getBillingSetting } = await import('./lib/billing-whatsapp')
  const { runTaskReminders } = await import('./lib/task-flow')

  async function tick() {
    try {
      const { date, time } = spNow()
      const sendTime = (await getBillingSetting('BILLING_REMINDER_TIME')) || '09:00'
      if (time < sendTime) return

      const lastRun = await getBillingSetting('BILLING_REMINDER_LAST_RUN')
      if (lastRun === date) return

      // Marca o dia antes de enviar: numa corrida, o pior caso é pular um
      // minuto — nunca enviar em dobro (o unique por cobrança segura o resto)
      await prisma.$executeRaw`
        INSERT INTO "SystemSettings" (key, value, "updatedAt")
        VALUES ('BILLING_REMINDER_LAST_RUN', ${date}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${date}, "updatedAt" = NOW()
      `

      // Confirmação de cobrança via WhatsApp DESATIVADA: com o Asaas ativo,
      // o status de pagamento vem pelo webhook (Aguardando/Confirmado/
      // Recebido/Vencido) — sem pergunta manual aos administradores.

      // Lembretes das demandas (produção D-2, revisão D-1) — nunca mudam
      // status; a marcação reminder*At em cada demanda impede duplicidade
      const tasks = await runTaskReminders()
      if (tasks.sent > 0) {
        console.log(`[tasks] lembretes de demandas: ${tasks.sent} enviados`)
      }

      // Cobranças Asaas: gera as da janela de antecedência para clientes com
      // cobrança automática ativada (idempotente; erro em um cliente não
      // interrompe os demais)
      try {
        const { runAsaasBillingJob } = await import('./lib/billing-asaas')
        const billing = await runAsaasBillingJob()
        if (billing.created > 0 || billing.errors > 0) {
          console.log(`[asaas] cobranças: ${billing.created} criadas, ${billing.skipped} puladas, ${billing.errors} erros`)
        }
      } catch (err) {
        console.error('[asaas] billing job error:', err)
      }
    } catch (err) {
      console.error('[billing] scheduler error:', err)
    }
  }

  setInterval(tick, 60_000)
  // primeira checagem logo após o boot (cobre restart depois do horário)
  setTimeout(tick, 10_000)
}
