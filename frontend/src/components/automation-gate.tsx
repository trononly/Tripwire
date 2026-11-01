import { useCallback, useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isAndroidBridge,
  openUssdAutomationSettings,
  ussdAutomationEnabled,
  ussdAutomationRunning,
} from "@/lib/sms-bridge";

/**
 * Live availability of the automation service: `available` is the switch,
 * `running` is whether Android is actually running it. The two disagree
 * after the system has killed the service - the switch stays on while
 * nothing is bound, which Android reports as "malfunctioning".
 *
 * Rechecks when the page mounts, when the app regains focus (the user
 * returning from system Settings), and once shortly after mount, because a
 * cold start can bind the service a moment after the UI appears.
 */
export function useAutomationAvailable() {
  const read = () => {
    if (!isAndroidBridge()) return { enabled: false, running: false };
    const enabled = ussdAutomationEnabled();
    return { enabled, running: enabled && ussdAutomationRunning() };
  };
  const [available, setAvailable] = useState(() => read().enabled);
  const [running, setRunning] = useState(() => read().running);
  const recheck = useCallback(() => {
    const next = read();
    setAvailable(next.enabled);
    setRunning(next.running);
  }, []);
  useEffect(() => {
    recheck();
    const timer = window.setTimeout(recheck, 1200);
    const onFocus = () => recheck();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [recheck]);
  return { available, running, recheck };
}

/**
 * Visible warning shown instead of the guided button while automation is
 * off.
 */
export function AutomationOffPanel() {
  return (
    <div
      role="alert"
      className="space-y-3 border border-amber-500/40 bg-amber-500/10 p-4"
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

/**
 * Shown in Settings when the switch is on but the service is not running -
 * Android's "This service is malfunctioning". Toggling it in system Settings
 * is the only fix that does not need a restart, so the button goes straight
 * there.
 */
export function AutomationStoppedNotice() {
  const { available, running } = useAutomationAvailable();
  if (!available || running) return null;
  return (
    <div
      role="alert"
      className="space-y-3 border border-amber-500/40 bg-amber-500/10 p-3"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm font-medium">Automation isn&rsquo;t running</p>
          <p className="text-xs text-muted-foreground">
            Android says it is on, but nothing is running. Turn it off and on
            again to fix it.
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={openUssdAutomationSettings}>
        Accessibility broken? Re-enable here
      </Button>
    </div>
  );
}
