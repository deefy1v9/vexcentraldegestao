"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Claro ⇄ escuro, a fonte única da verdade no navegador.
 *
 * O tema NÃO mora em localStorage: mora no cookie `vex_tema`, porque quem
 * decide a classe do <html> é o SERVIDOR — ele lê o cookie e já manda a
 * página com `class="dark"`, sem o flash de claro-para-escuro (ver
 * app/layout.tsx). Sem cookie, o servidor cai no `tema_preferido` da
 * EMPRESA, que é parte do white-label. Uma biblioteca de tema no cliente
 * atropelaria as duas coisas.
 *
 * Este hook existe para que os DOIS controles de tema — o botão de ícone e o
 * switch da barra lateral — leiam e escrevam exatamente o mesmo lugar. Dois
 * controles com estado próprio discordariam na hora em que aparecessem na
 * mesma tela.
 *
 * `escuro` nasce null: no servidor não há <html> para consultar, e chutar
 * claro faria o ícone piscar. Quem desenha decide o que mostrar nesse
 * intervalo.
 */
export function usarTema() {
  const [escuro, setEscuro] = useState<boolean | null>(null);

  // Todas as instâncias do hook (botão do cabeçalho, item do menu, tela de
  // perfil) leem o <html> de novo quando qualquer uma delas muda o tema —
  // é o evento "vex-tema" que as mantém de acordo.
  useEffect(() => {
    const ler = () => setEscuro(document.documentElement.classList.contains("dark"));
    ler();
    window.addEventListener("vex-tema", ler);
    return () => window.removeEventListener("vex-tema", ler);
  }, []);

  // Estáveis de propósito: `definir` é passada direto como `onCheckedChange`
  // de um componente controlado, e uma função nova a cada render o remontaria
  // sem necessidade. A verdade é lida do <html> na hora, não da closure.
  const definir = useCallback((novo: boolean) => {
    document.documentElement.classList.toggle("dark", novo);
    try { localStorage.setItem("vex-theme", novo ? "dark" : "light"); } catch {}
    setEscuro(novo);
    window.dispatchEvent(new Event("vex-tema"));
  }, []);

  const alternar = useCallback(() => {
    definir(!document.documentElement.classList.contains("dark"));
  }, [definir]);

  return { escuro, montado: escuro !== null, definir, alternar };
}
