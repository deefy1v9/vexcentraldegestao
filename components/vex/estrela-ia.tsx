import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Marca vetorial do conteúdo gerado pelo assistente. */
export function EstrelaIa({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      data-estrela-ia
      className={cn("h-4 w-4 shrink-0 text-ia", className)}
      {...props}
    >
      <path d="M10 1.5 12.7 8.3 19.5 11l-6.8 2.7L10 20.5l-2.7-6.8L.5 11l6.8-2.7L10 1.5Z" />
      <path d="m20 15 1.1 2.9L24 19l-2.9 1.1L20 23l-1.1-2.9L16 19l2.9-1.1L20 15Z" />
    </svg>
  );
}

/** A caixa ao lado da resposta ou análise, sem substituir o nome do autor. */
export function SeloLateralIa({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-selo-lateral-ia
      className={cn("selo-lateral-ia", className)}
      {...props}
    >
      <EstrelaIa />
    </span>
  );
}
