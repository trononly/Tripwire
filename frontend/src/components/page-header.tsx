import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The one screen title used by every route. Actions sit beside the title so
 * the filter/range control is where a native app puts it; the optional
 * subtitle is a data line, never an explainer.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 text-[24px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[26px]">
          {title}
        </h1>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {subtitle ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
