import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) { return <TooltipPrimitive.Provider delayDuration={150}>{children}</TooltipPrimitive.Provider>; }
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export function TooltipContent({ className, sideOffset = 6, ...props }: TooltipPrimitive.TooltipContentProps) { return <TooltipPrimitive.Portal><TooltipPrimitive.Content className={`ui-tooltip ${className ?? ""}`} sideOffset={sideOffset} {...props} /></TooltipPrimitive.Portal>; }
