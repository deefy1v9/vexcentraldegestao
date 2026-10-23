/**
 * Freio de pedidos em memória (janela deslizante). A Central roda num
 * container só, então basta para segurar um assistente em loop ou um robô
 * batendo no registro/token. Testado em scripts/tests/mcp-oauth.test.ts.
 */
export interface Limitador {
  /** ok=false com esperarSeg quando a chave estourou o limite na janela. */
  conferir(chave: string, agora?: number): { ok: true } | { ok: false; esperarSeg: number }
}

export function criarLimitador(maximo: number, janelaMs: number): Limitador {
  const marcas = new Map<string, number[]>()
  return {
    conferir(chave, agora = Date.now()) {
      const recentes = (marcas.get(chave) ?? []).filter((t) => agora - t < janelaMs)
      if (recentes.length >= maximo) {
        marcas.set(chave, recentes)
        return { ok: false, esperarSeg: Math.max(1, Math.ceil((recentes[0] + janelaMs - agora) / 1000)) }
      }
      recentes.push(agora)
      marcas.set(chave, recentes)
      // Não deixa o mapa crescer sem fim com chaves velhas
      if (marcas.size > 5000) for (const [k, v] of marcas) if (!v.some((t) => agora - t < janelaMs)) marcas.delete(k)
      return { ok: true }
    },
  }
}

/** IP de quem chamou, atrás do Traefik. */
export function ipDe(headers: Headers): string {
  return (headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || headers.get('x-real-ip') || 'desconhecido'
}

export const CONSULTAS_POR_MINUTO = 60
export const limiteConsultas = criarLimitador(CONSULTAS_POR_MINUTO, 60_000)
export const limiteToken = criarLimitador(60, 60_000)
export const limiteRegistro = criarLimitador(20, 10 * 60_000)
