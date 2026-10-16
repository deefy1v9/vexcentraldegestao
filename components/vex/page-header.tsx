import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página: título, uma frase curta e humana, e as ações à
 * direita. O mesmo em todas as telas — é o que faz o painel parecer um
 * produto só.
 *
 * Sem cabeçalho gigante: 20px de título. O espaço vai para o conteúdo, que
 * é onde a pessoa passa o dia.
 */
export function PageHeader({
  titulo,
  descricao,
  acoes,
  className,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  className?: string;
}) {
  return (
    <header data-cabecalho-pagina className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3 min-w-0", className)}>
      <div className="min-w-0 flex-1 basis-[240px]">
        <h1 className="t-pagina">{titulo}</h1>
        {descricao && <p className="t-legenda mt-1">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">{acoes}</div>}
    </header>
  );
}

/** Título de seção dentro da página, com a mesma régua. */
export function SectionHeader({
  titulo,
  descricao,
  acoes,
  className,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 className="t-secao">{titulo}</h2>
        {descricao && <p className="t-legenda mt-0.5">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">{acoes}</div>}
    </div>
  );
}
