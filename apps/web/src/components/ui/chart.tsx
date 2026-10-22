import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export type ChartConfig = Record<string, { label: string; color: string }>;
export function ChartContainer({ className, config, children, ...props }: HTMLAttributes<HTMLDivElement> & { config: ChartConfig; children: ReactNode }) {
  const vars = Object.fromEntries(Object.entries(config).map(([key, item]) => [`--color-${key}`, item.color])) as CSSProperties;
  return <div className={cn("ui-chart", className)} style={vars} {...props}>{children}</div>;
}
