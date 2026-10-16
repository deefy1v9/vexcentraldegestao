import { cn } from "@/lib/utils";

/** Iniciais para o avatar sem foto: "Antonio Gomes" → "AG". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase().slice(0, 2);
}

const TAMANHOS = {
  sm: "w-7 h-7 text-[11px] rounded-full",
  md: "w-8 h-8 text-[12px] rounded-full",
  lg: "w-16 h-16 text-[20px] rounded-full",
  xl: "w-20 h-20 text-[24px] rounded-full",
} as const;

/**
 * A pessoa num círculo: foto quando há, iniciais quando não. Um desenho só
 * para gente da equipe e para contatos (ver inbox/ContactAvatar). `tom`
 * sobrevive só por compatibilidade: a barra deixou de ser escura.
 */
export function Avatar({
  nome,
  src,
  tamanho = "md",
  tom = "conteudo",
  className,
}: {
  nome: string;
  src?: string | null;
  tamanho?: keyof typeof TAMANHOS;
  tom?: "conteudo" | "barra";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid place-items-center overflow-hidden flex-shrink-0 font-semibold select-none",
        tom === "barra" ? "bg-secondary text-foreground" : "bg-secondary text-foreground",
        TAMANHOS[tamanho],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        iniciais(nome)
      )}
    </span>
  );
}
