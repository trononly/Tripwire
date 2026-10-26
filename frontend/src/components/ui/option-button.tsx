import * as React from "react";

import { cn } from "@/lib/utils";

export interface OptionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

/**
 * A rectangular choice button, matching the payment-type and frequency
 * controls in the recurring-payment dialog. Settings uses the same control so
 * a selected option looks the same everywhere in the app.
 */
export function OptionButton({
  selected = false,
  className,
  type = "button",
  ...props
}: OptionButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm transition-colors",
        selected
          ? "border-primary bg-primary/10 font-medium text-foreground"
          : "border-border text-muted-foreground hover:bg-muted/60",
        className,
      )}
      {...props}
    />
  );
}
