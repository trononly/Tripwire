import { useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { MessageSquareText, ShieldAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshSmsImport } from "../../bindings/mpesa-analyzer/parseservice";
import type { SmsRefreshResult } from "../../bindings/mpesa-analyzer/models";
import {
  hasSmsPermission,
  requestSmsImport,
  type SmsBridgeResult,
} from "@/lib/sms-bridge";

/** One flow step of the import dialog. */
type Phase =
  | "ready" // explanation + the one action button
  | "waiting" // permission prompt or inbox read or Go import in flight
  | "denied" // READ_SMS refused, can be asked again
  | "blocked" // permanently denied; only system settings can fix it
  | "error"; // bridge or import failure

/**
 * SMS import, Android only. The bridge (Phase 3) delivers raw messages as
 * a "common:sms" event; the Go service parses them and merges them into the
 * SMS record, so re-importing an unchanged inbox adds nothing. Deliberately
 * minimal: permission prompt, then done — the parsed/skipped breakdown and
 * the audit live on the SMS page, not here.
 */
export function ImportSmsDialog({
  open,
  onOpenChange,
  onResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires once per successful import; App applies the refreshed record. */
  onResult?: (refresh: SmsRefreshResult, bridgeCount: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [deniedNote, setDeniedNote] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The "common:sms" subscription is cancelled on unmount and on close, so
  // a late event can never touch an unmounted dialog, and rerenders never
  // stack duplicate listeners (each start replaces the previous one).
  const cancelEventRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelEventRef.current?.();
      cancelEventRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (open) return;
    // Closing resets everything, including any in-flight subscription.
    cancelEventRef.current?.();
    cancelEventRef.current = null;
    setPhase("ready");
    setDeniedNote(null);
    setErrorMessage(null);
  }, [open]);

  function startImport() {
    if (phaseRef.current === "waiting") return; // no concurrent imports
    setDeniedNote(null);
    setErrorMessage(null);
    setPhase("waiting");
    cancelEventRef.current?.();
    cancelEventRef.current = Events.Once("common:sms", (ev) => {
      if (!mountedRef.current) return;
      handleBridgeResult(ev.data as SmsBridgeResult);
    });
    requestSmsImport();
  }

  // Permission already granted (the common case after the first import,
  // and always after a launch-time auto-import): skip the explainer and
  // refetch straight away.
  useEffect(() => {
    if (!open || phaseRef.current !== "ready" || !hasSmsPermission()) return;
    startImport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  function handleBridgeResult(data: SmsBridgeResult) {
    cancelEventRef.current = null;
    if (!data.ok) {
      if (data.error?.includes("permanently denied")) {
        setPhase("blocked");
      } else if (data.error?.includes("permission denied")) {
        setDeniedNote("SMS access was denied. You can allow it and try again.");
        setPhase("denied");
      } else {
        setErrorMessage(data.error ?? "Unknown error");
        setPhase("error");
      }
      return;
    }
    setBridgeCount(data.count ?? 0);
    // The current device offset renders received times in the phone's own
    // timezone (JS Date.getTimezoneOffset convention: Nairobi is -180).
    const messages = (data.messages ?? []).map((m) => ({
      id: m.id,
      address: m.address,
      dateMs: m.dateMs,
      body: m.body,
      tzOffsetMinutes: new Date().getTimezoneOffset(),
    }));
    RefreshSmsImport(messages)
      .then((res) => {
        if (!mountedRef.current) return;
        if (!res) {
          setErrorMessage("Empty response from the importer.");
          setPhase("error");
          return;
        }
        onResult?.(res, data.count ?? 0);
        onOpenChange(false);
      })
      .catch((e) => {
        if (!mountedRef.current) return;
        setErrorMessage(String(e));
        setPhase("error");
      });
  }

  const busy = phase === "waiting";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-sm:w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Import SMS</DialogTitle>
          <DialogDescription>
            Read M-Pesa messages from this phone's inbox and import them as
            transactions. Everything stays on this device.
          </DialogDescription>
        </DialogHeader>

        {(phase === "ready" || phase === "denied") && (
          <div className="space-y-3">
            {deniedNote && (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                {deniedNote}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              The app reads only M-Pesa messages. Granting SMS access lets it
              list them; parsing happens inside the app.
            </p>
            <DialogFooter>
              <Button onClick={startImport} disabled={busy}>
                <MessageSquareText />
                {deniedNote ? "Allow SMS access and import" : "Read M-Pesa SMS"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === "waiting" && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Reading messages… answer the permission prompt if it appears.
          </p>
        )}

        {phase === "blocked" && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              SMS access is permanently denied for this app. Re-enable it in
              Android Settings → Apps → mpesa-analyzer → Permissions → SMS,
              then try again here.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase("ready")}>
                Back
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">Import failed: {errorMessage}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase("ready")}>
                Back
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
