import { useCallback, useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import {
  startUssdQuickEntry,
  type UssdAutoEvent,
} from "@/lib/sms-bridge";
import { canStartQuickEntry, isInterruptionCode } from "@/lib/automation-status";
import type { QuickEntryScript } from "@/lib/ussd-menus";
import {
	clearPendingGuidedPayment,
	markPendingGuidedPayment,
} from "@/lib/pending-payment";

export type QuickEntryStatus =
  | "idle"
  | "starting"
  | "step"
  | "awaiting-pin"
  | "awaiting-confirm"
  | "complete"
  | "aborted"
  | "interrupted";

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
  const [code, setCode] = useState<string | null>(null);
  const offRef = useRef<(() => void) | null>(null);
  const startOffRef = useRef<(() => void) | null>(null);
  const statusRef = useRef<QuickEntryStatus>("idle");
  statusRef.current = status;
  // Synchronous guard: a double tap can land before React re-renders the
  // disabled button. It must never start a second USSD session.
  const activeRef = useRef(false);

  const cleanup = useCallback(() => {
    offRef.current?.();
    offRef.current = null;
    startOffRef.current?.();
    startOffRef.current = null;
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
        current !== "awaiting-pin" &&
        current !== "awaiting-confirm"
      ) {
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const now = statusRef.current;
        if (
          now === "starting" ||
          now === "step" ||
          now === "awaiting-pin" ||
          now === "awaiting-confirm"
        ) {
          activeRef.current = false;
          cleanup();
          setStatus("interrupted");
          setCode("outcome-unknown");
          setReason("automation did not report completion");
          clearPendingGuidedPayment();
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

  const dismiss = useCallback(() => {
    activeRef.current = false;
    setStatus("idle");
    setReason(null);
    setCode(null);
  }, []);

  const start = useCallback(
    (script: QuickEntryScript, simKey?: string | null) => {
      if (!canStartQuickEntry(statusRef.current, activeRef.current)) return;
      activeRef.current = true;
      cleanup();
      setStatus("starting");
      setStep(0);
      setSteps(script.steps.length);
      setReason(null);
      setCode(null);
      // The receipt banner is only automatic for a payment this session
      // started; it stays valid for the SMS window in pending-payment.ts.
      markPendingGuidedPayment();
      // A failed dial (permission, automation off) must not leave the marker
      // armed for an unrelated spend in the next ten minutes.
      startOffRef.current = Events.Once("common:ussd", (ev) => {
        const data = ev.data as { ok?: boolean };
        if (data && data.ok === false) clearPendingGuidedPayment();
      });
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
          case "awaiting-confirm":
            setStatus("awaiting-confirm");
            cleanup();
            break;
          case "complete":
            activeRef.current = false;
            setStatus("complete");
            cleanup();
            break;
          case "aborted": {
            const abortCode = data.code ?? null;
            const interrupted = isInterruptionCode(abortCode);
            activeRef.current = false;
            setStatus(interrupted ? "interrupted" : "aborted");
            setCode(abortCode);
            setReason(data.reason ?? "aborted");
            clearPendingGuidedPayment();
            cleanup();
            break;
          }
        }
      });
      startUssdQuickEntry(script, simKey);
    },
    [cleanup],
  );

  return { status, step, steps, reason, code, start, dismiss };
}
