'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * O contrato desenhado página por página, na largura toda. O <iframe> com o
 * PDF não rola no celular (o dedo mexe a moldura, não o documento); aqui cada
 * página vira um <canvas> no fluxo da página, e rolar a página rola o contrato.
 *
 * pdf.js na versão "legacy" (funciona em Safari antigo de iPhone); o worker
 * fica em public/pdf.worker.min.mjs, copiado da mesma versão do pacote.
 */
export default function VisualizadorPdf({ url, titulo }: { url: string; titulo: string }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando')

  useEffect(() => {
    let cancelado = false
    const alvo = caixa.current
    if (!alvo) return
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const dados = await fetch(url).then((r) => {
          if (!r.ok) throw new Error(String(r.status))
          return r.arrayBuffer()
        })
        const doc = await pdfjs.getDocument({ data: new Uint8Array(dados) }).promise
        const largura = alvo.clientWidth
        const nitidez = Math.min(window.devicePixelRatio || 1, 2)
        alvo.replaceChildren()
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelado) return
          const pagina = await doc.getPage(n)
          const base = pagina.getViewport({ scale: 1 })
          const vista = pagina.getViewport({ scale: (largura / base.width) * nitidez })
          const tela = document.createElement('canvas')
          tela.width = Math.floor(vista.width)
          tela.height = Math.floor(vista.height)
          tela.className = 'block w-full h-auto bg-white shadow-sm'
          tela.setAttribute('aria-label', `${titulo}, página ${n} de ${doc.numPages}`)
          alvo.appendChild(tela)
          await pagina.render({ canvasContext: tela.getContext('2d')!, viewport: vista }).promise
          if (n === 1) setEstado('pronto')
        }
      } catch {
        if (!cancelado) setEstado('erro')
      }
    })()
    return () => { cancelado = true }
  }, [url, titulo])

  return (
    <div>
      {estado === 'carregando' && (
        <p className="flex items-center gap-2 px-4 py-10 justify-center text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Abrindo o contrato…</p>
      )}
      {estado === 'erro' && (
        <p className="px-4 py-10 text-center text-sm text-gray-600">Não deu para mostrar o contrato aqui. Use “Baixar PDF” logo abaixo para ler.</p>
      )}
      <div ref={caixa} className="space-y-2 bg-gray-100" />
    </div>
  )
}
