import { useCallback, useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import {
  startUssdQuickEntry,
  type UssdAutoEvent,
} from "@/lib/sms-bridge";
import type { QuickEntryScript } from "@/lib/ussd-menus";

export type QuickEntryStatus =
  | "idle"
  | "starting"
  | "step"
  | "awaiting-pin"
  | "complete"
  | "aborted";

/**
 * Runs one guided USSD session: subscribes to the service's progress events,
 * dials via startUssdQuickEntry, and unsubscribes on terminal states and
 * unmount. The PIN is always entered manually in the phone dialog; the
 * payment itself is confirmed by the SMS receipt, never here.
 */
export function useQuickEntry() {
  const [status, setStatus] = useState<QuickEntryStatus>("idle");
  const [step, setStep] = useState(0);
  const [steps, setSteps] = useState(0);
  const [reason, setReason] = useState<string | null>(null);
  const offRef = useRef<(() => void) | null>(null);
  const statusRef = useRef<QuickEntryStatus>("idle");
  statusRef.current = status;

  const cleanup = useCallback(() => {
    offRef.current?.();
    offRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Returning to the app means the USSD dialog closed: the user either paid
  // or cancelled. The native side emits complete/aborted while we were in the
  // background, but if that event is missed the button would stay on
  // "Paying..." until the 90s timeout. Give queued events a moment, then
  // clear the run so Pay now is usable again.
  useEffect(() => {
    let timer = 0;
    const onForeground = () => {
      if (document.visibilityState !== "visible") return;
      const current = statusRef.current;
      if (
        current !== "starting" &&
        current !== "step" &&
        current !== "awaiting-pin"
      ) {
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const now = statusRef.current;
        if (now === "starting" || now === "step" || now === "awaiting-pin") {
          cleanup();
          setStatus("idle");
          setReason(null);
        }
      }, 2500);
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [cleanup]);

  const start = useCallback(
    (script: QuickEntryScript, simKey?: string | null) => {
      cleanup();
      setStatus("starting");
      setStep(0);
      setSteps(script.steps.length);
      setReason(null);
      offRef.current = Events.On("common:ussd-auto", (ev) => {
        const data = ev.data as UssdAutoEvent;
        if (!data || typeof data.state !== "string") return;
        switch (data.state) {
          case "step":
            setStatus("step");
            setStep(data.step ?? 0);
            if (data.steps) setSteps(data.steps);
            break;
          case "awaiting-pin":
            setStatus("awaiting-pin");
            break;
          case "complete":
            setStatus("complete");
            cleanup();
            break;
          case "aborted":
            setStatus("aborted");
            setReason(data.reason ?? "aborted");
            cleanup();
            break;
        }
      });
      startUssdQuickEntry(script, simKey);
    },
    [cleanup],
  );

  return { status, step, steps, reason, start };
}
