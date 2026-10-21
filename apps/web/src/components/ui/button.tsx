import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonStyles = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: { default: "bg-[var(--accent)] text-white hover:opacity-90", outline: "border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--bg)]", ghost: "hover:bg-[var(--bg)]" },
    size: { default: "h-10 px-4 py-2", sm: "h-9 rounded-md px-3", icon: "size-9" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> { asChild?: boolean }

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}
