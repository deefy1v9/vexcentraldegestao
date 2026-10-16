import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * O botão do sistema.
 *
 * Um principal por tela, na cor da marca; o hover é a MESMA cor um degrau
 * mais escura (`--primary-hover`) — inverter para preto no hover, como era,
 * fazia o botão "piscar" e parecia outro botão. O resto é branco com borda
 * (`outline`), transparente (`ghost`) ou vermelho, que é só para o que
 * destrói. Raio 8, ícone 16, altura 36 no padrão.
 */
const buttonVariants = cva(
  // `select-none` na base: o texto de um botão não é texto para copiar. Sem
  // isto, arrastar o mouse ou dar dois cliques pinta o rótulo de azul do
  // sistema — o detalhe que faz a tela inteira parecer um formulário cru.
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13.5px] font-medium transicao " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background " +
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline: "border border-border bg-card text-foreground hover:bg-accent hover:border-subtle/60",
        secondary: "bg-secondary text-secondary-foreground hover:bg-border/60",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-95",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
