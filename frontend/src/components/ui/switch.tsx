import * as React from "react";

import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name; also used as the title on the knob row. */
  label: string;
  disabled?: boolean;
  className?: string;
}

/**
 * The sliding on/off switch used by settings and the recurring reminder row.
 * The whole control is one button with role="switch", so screen readers get
 * the state without a separate checkbox.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      // The app-wide button rule sets min-height 44px; inline dimensions keep
      // this the same 44x24 pill as the reminder switch in the payment dialog.
      style={{ width: 44, height: 24, minWidth: 0, minHeight: 0 }}
      className={cn(
        "relative shrink-0 rounded-full p-0 transition-colors",
        checked ? "bg-primary" : "bg-muted",
        disabled && "opacity-50",
        className,
      )}
    >
      <span
        aria-hidden
        style={{ width: 20, height: 20, top: 2 }}
        className={cn(
          "absolute rounded-full bg-background shadow transition-all",
          checked ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}
