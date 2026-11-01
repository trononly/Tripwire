import { isDebugBuild } from "@/lib/sms-bridge";
import { cn } from "@/lib/utils";

/**
 * The product mark. Debug builds use the blue switch from the debug launcher
 * icon, so the icon, splash and in-app header all tell the same story.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={isDebugBuild() ? "/tripwire-debug.svg" : "/tripwire.svg"}
      alt="Tripwire"
      className={cn("size-6", className)}
    />
  );
}
