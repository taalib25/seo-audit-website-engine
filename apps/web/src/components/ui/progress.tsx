import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "../../lib/utils";

export function Progress({ value, className, ...props }: ProgressPrimitive.ProgressProps) {
  const bounded = Math.max(0, Math.min(value ?? 0, 100));
  return <ProgressPrimitive.Root className={cn("ui-progress", className)} value={bounded} {...props}><ProgressPrimitive.Indicator className="ui-progress-indicator" style={{ transform: `translateX(-${100 - bounded}%)` }} /></ProgressPrimitive.Root>;
}
