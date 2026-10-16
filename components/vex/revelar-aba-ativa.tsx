"use client";

import { useEffect, useRef } from "react";

/** Mantém a seleção visível sem rolar a página ou mudar o foco. */
export function RevelarAbaAtiva({ ativa }: { ativa: string }) {
  const marcador = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const faixa = marcador.current?.parentElement;
    const selecionada = faixa?.querySelector<HTMLElement>('[aria-current="page"], [aria-selected="true"]');
    if (!faixa || !selecionada || faixa.scrollWidth <= faixa.clientWidth) return;
    const limite = faixa.getBoundingClientRect();
    const aba = selecionada.getBoundingClientRect();
    if (aba.left >= limite.left && aba.right <= limite.right) return;
    faixa.scrollTo({ left: faixa.scrollLeft + aba.left - limite.left - (faixa.clientWidth - aba.width) / 2 });
  }, [ativa]);
  return <span ref={marcador} className="hidden" aria-hidden />;
}
