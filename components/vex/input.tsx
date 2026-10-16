import * as React from "react";
import { cn } from "@/lib/utils";

/** Campo: 36px, raio 8px, 13.5px. Foco = borda da marca + anel a 30 %. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full min-w-0 rounded-lg border border-border bg-input px-3 py-2 text-[13.5px] transicao",
        "placeholder:text-subtle",
        "hover:border-subtle",
        "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
