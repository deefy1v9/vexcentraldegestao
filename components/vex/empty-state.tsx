import type { LucideIcon } from "lucide-react";

/**
 * Lista vazia com uma frase que diz o que fazer, não só "nada aqui".
 *
 * Um só para o painel e para o backoffice — a versão do backoffice
 * reexporta esta. O ícone num quadrado cinza, título, uma frase e UMA ação
 * (outline): o desenho dos sistemas de atendimento, onde o vazio parece
 * espaço, não um erro.
 */
export function EmptyState({
  icone: Icone,
  titulo,
  texto,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  texto?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius)] border border-border bg-card px-5 py-10 text-center">
      <span className="mx-auto mb-3 grid place-items-center w-10 h-10 rounded-lg bg-secondary">
        <Icone className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <p className="t-secao">{titulo}</p>
      {texto && <p className="t-legenda mt-1.5 max-w-md mx-auto leading-relaxed">{texto}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2 min-w-0">{children}</div>}
    </div>
  );
}
