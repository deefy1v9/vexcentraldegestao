'use client'

import dynamic from 'next/dynamic'

/**
 * O formulário do briefing só no navegador: ele começa com o rascunho salvo
 * no próprio aparelho, que não existe no servidor.
 */
const FormularioBriefingCliente = dynamic(() => import('./FormularioBriefing'), {
  ssr: false,
  loading: () => <p className="mt-8 text-sm text-muted-foreground">Carregando o formulário…</p>,
})

export default FormularioBriefingCliente
