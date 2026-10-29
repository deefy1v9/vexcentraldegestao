'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * O contrato desenhado página por página, na largura toda, dentro de um quadro
 * do tamanho de uma página: o dedo rola o contrato dentro do quadro, e logo
 * abaixo já vem a parte de assinar. (O <iframe> com o PDF não rolava no
 * celular; aqui cada página é um <canvas> dentro de uma área com rolagem.)
 *
 * pdf.js na versão "legacy" (funciona em Safari antigo de iPhone); o worker
 * fica em public/pdf.worker.min.mjs, copiado da mesma versão do pacote.
 */
export default function VisualizadorPdf({ url, titulo }: { url: string; titulo: string }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando')
  const [total, setTotal] = useState(0)
  const [atual, setAtual] = useState(1)

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
        setTotal(doc.numPages)
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

  // A página que está no meio do quadro, para o "página 2 de 6"
  function rolou(e: React.UIEvent<HTMLDivElement>) {
    const q = e.currentTarget
    const meio = q.scrollTop + q.clientHeight / 2
    const paginas = Array.from(q.querySelectorAll('canvas')) as HTMLCanvasElement[]
    const i = paginas.findIndex((p) => p.offsetTop + p.offsetHeight > meio)
    setAtual(i < 0 ? paginas.length : i + 1)
  }

  return (
    <div>
      {total > 1 && estado === 'pronto' && (
        <p className="px-4 py-2 text-xs text-gray-600 border-b border-gray-200 bg-white">
          Página {atual} de {total} · role dentro do quadro para ler o contrato todo
        </p>
      )}
      {/* O quadro tem a altura de uma página A4 (no máximo 75% da tela) e rola por dentro */}
      <div onScroll={rolou} className="relative w-full aspect-[1/1.414] max-h-[75vh] overflow-y-auto bg-gray-100" style={{ WebkitOverflowScrolling: 'touch' }}>
        {estado === 'carregando' && (
          <p className="flex items-center gap-2 px-4 py-10 justify-center text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Abrindo o contrato…</p>
        )}
        {estado === 'erro' && (
          <p className="px-4 py-10 text-center text-sm text-gray-600">Não deu para mostrar o contrato aqui. Use “Baixar PDF” logo abaixo para ler.</p>
        )}
        <div ref={caixa} className="space-y-2" />
      </div>
    </div>
  )
}
