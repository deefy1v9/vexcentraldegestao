"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * A aba do item ativo no trilho laranja (o dono, 01/10): um recorte da cor do
 * fundo da página, colado na borda direita, que "puxa" o ícone ativo para
 * dentro do conteúdo e DESLIZA até o novo item a cada troca de página, com
 * as curvas invertidas em cima e embaixo que a ligam ao conteúdo.
 *
 * Mede o link com `aria-current="page"` dentro do <aside> (os itens da nav e
 * os do pé) e se move por `transform`, então a Sidebar não precisa saber dela.
 * O desenho (cor, curvas, transição) está no globals.css, em
 * `[data-aba-trilho]`. Na gaveta do celular (coluna larga, por cima da
 * página) não há conteúdo ao lado para a aba se ligar: ela some.
 */
/** Quanto a aba passa do ícone em cima e embaixo. */
const FOLGA = 2;

export function AbaDoTrilho() {
  const ref = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();
  const [pos, setPos] = useState<{ y: number; h: number; corte: number } | null>(null);
  const [pronto, setPronto] = useState(false);

  useLayoutEffect(() => {
    const aside = ref.current?.closest("aside");
    if (!aside) return;
    const medir = () => {
      const link = aside.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!link || aside.clientWidth > 120) return setPos(null);
      const a = aside.getBoundingClientRect();
      const l = link.getBoundingClientRect();
      // O ativo que rolou para fora da lista (tela baixa) não tem aba: sem
      // esta guarda ela ficava desenhada por cima do pé, cobrindo Suporte e
      // a engrenagem (04/10/2026).
      const lista = link.closest("nav")?.getBoundingClientRect();
      if (lista && (l.top < lista.top - 1 || l.bottom > lista.bottom + 1)) return setPos(null);
      // Onde o cabeçalho termina, medido do topo da aba. A parte da aba (e da
      // curva de cima) que fica ao lado dele pinta na cor dele, com a mesma
      // linha de borda: a aba emenda nos dois lados sem degrau.
      const cab = document.querySelector("header.cabecalho-global")?.getBoundingClientRect();
      const corte = cab ? cab.bottom - (l.top - FOLGA) : -99;
      setPos({ y: l.top - a.top, h: l.height, corte });
    };
    // Enquanto os destinos se reacomodam (o ativo ganha folga em cima e
    // embaixo, com transição no globals.css), a aba remede a cada quadro e
    // acompanha o destino até ele parar.
    // Em tela bem baixa a lista ainda rola: o destino ativo entra na vista ao
    // abrir a página, em vez de ficar escondido embaixo (04/10/2026).
    const lista = aside.querySelector("nav");
    const ativoNaLista = lista?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (lista && ativoNaLista) {
      const n = lista.getBoundingClientRect();
      const l = ativoNaLista.getBoundingClientRect();
      if (l.bottom > n.bottom) lista.scrollTop += l.bottom - n.bottom + 24;
      else if (l.top < n.top) lista.scrollTop -= n.top - l.top + 24;
    }
    let quadro = 0;
    const acompanhar = () => {
      const fim = performance.now() + 600;
      cancelAnimationFrame(quadro);
      const passo = () => {
        medir();
        if (performance.now() < fim) quadro = requestAnimationFrame(passo);
      };
      passo();
    };
    acompanhar();
    // Liga a transição só depois da primeira posição: ao abrir a página a aba
    // já nasce no lugar, sem descer do topo.
    const raf = requestAnimationFrame(() => setPronto(true));
    const nav = aside.querySelector("nav");
    nav?.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    // O `aria-current` troca quando a Sidebar re-renderiza com a rota nova.
    const mo = new MutationObserver(acompanhar);
    mo.observe(aside, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(quadro);
      nav?.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
      mo.disconnect();
    };
  }, [pathname]);

  return (
    <span
      ref={ref}
      aria-hidden
      data-aba-trilho=""
      data-visivel={pos ? "" : undefined}
      data-pronto={pronto ? "" : undefined}
      style={
        pos
          ? ({ transform: `translateY(${pos.y - FOLGA}px)`, height: pos.h + 2 * FOLGA, "--corte": `${pos.corte}px` } as React.CSSProperties)
          : undefined
      }
    />
  );
}
