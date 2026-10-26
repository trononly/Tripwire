import { useEffect } from "react";

import type { RecurringPlan } from "../../bindings/mpesa-analyzer/internal/store/models";
import { getPrivacyModeEnabled } from "@/lib/privacy-mode";
import { buildReminderItems, type LastPaid } from "@/lib/recurring-plans";
import { isAndroidBridge, scheduleReminders } from "@/lib/sms-bridge";

/**
 * Keeps the native reminder alarms in step with the plans and the payments
 * already in the statements. Scheduling waits for the plan list to load, so a
 * cold start cannot cancel the stored schedule with an empty list.
 */
export function usePlanReminders(
  plans: RecurringPlan[],
  lastPaid: Record<string, LastPaid | null>,
  loading: boolean,
) {
  useEffect(() => {
    if (loading || !isAndroidBridge()) return;
    scheduleReminders(
      buildReminderItems(plans, lastPaid, new Date(), getPrivacyModeEnabled()),
    );
  }, [plans, lastPaid, loading]);

  // Returning to the app is also a good moment: a receipt merged while we
  // were away has already changed lastPaid and silenced that cycle.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !isAndroidBridge()) return;
      scheduleReminders(
        buildReminderItems(plans, lastPaid, new Date(), getPrivacyModeEnabled()),
      );
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [plans, lastPaid]);
}
