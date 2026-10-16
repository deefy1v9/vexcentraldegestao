import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Chip de estado: 22px, raio 6, fundo suave + texto escuro do mesmo matiz.
 * Cor de status NUNCA vem sozinha: cada variante carrega texto, e onde há
 * gravidade o chamador acrescenta um ícone — cor isolada não sobrevive a
 * daltonismo nem a impressão.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 h-[22px] rounded-md border px-2 text-[11.5px] font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-muted-foreground",
        outline: "border-border bg-card text-muted-foreground",
        primary: "border-transparent bg-destaque text-destaque-texto",
        success: "border-transparent bg-success-suave text-success",
        warning: "border-transparent bg-warning-suave text-warning",
        danger: "border-transparent bg-destructive-suave text-destructive-texto",
        info: "border-transparent bg-info-suave text-info",
        // Quem atende é identificado pelo rótulo, sem realce decorativo.
        ia: "border-transparent bg-secondary text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
