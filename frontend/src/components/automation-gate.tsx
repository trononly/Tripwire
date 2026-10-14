import { useCallback, useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isAndroidBridge,
  openUssdAutomationSettings,
  ussdAutomationEnabled,
} from "@/lib/sms-bridge";

/**
 * Live availability of the automation service. Rechecks when the page mounts
 * and whenever the app regains focus — e.g. the user returns from system
 * Settings after enabling the service.
 */
export function useAutomationAvailable() {
  const [available, setAvailable] = useState(
    () => isAndroidBridge() && ussdAutomationEnabled(),
  );
  const recheck = useCallback(() => {
    setAvailable(isAndroidBridge() && ussdAutomationEnabled());
  }, []);
  useEffect(() => {
    recheck();
    const onFocus = () => recheck();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [recheck]);
  return { available, recheck };
}

/**
 * Visible warning shown instead of the guided button while automation is
 * off.
 */
export function AutomationOffPanel() {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm font-medium">Automation is off</p>
          <p className="text-xs text-muted-foreground">
            The app cannot fill the menus for you
          </p>
        </div>
      </div>
      <Button onClick={openUssdAutomationSettings}>Enable automation</Button>
    </div>
  );
}
