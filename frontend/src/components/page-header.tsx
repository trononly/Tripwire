import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The one screen title used by every route. The h1 names the screen; the
 * subtitle carries the period and the one finding a reader should leave with.
 * Actions sit on the same line on desktop and wrap under the title on a phone.
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
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[26px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
