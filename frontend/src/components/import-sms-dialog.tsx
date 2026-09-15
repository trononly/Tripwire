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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ImportSms } from "../../bindings/mpesa-analyzer/parseservice";
import type { SmsImportResult } from "../../bindings/mpesa-analyzer/models";
import { formatMoney, formatFullDate } from "@/lib/format";
import {
  requestSmsImport,
  type SmsBridgeResult,
} from "@/lib/sms-bridge";

/** One flow step of the import dialog. */
type Phase =
  | "ready" // explanation + the one action button
  | "waiting" // permission prompt or inbox read or Go import in flight
  | "denied" // READ_SMS refused, can be asked again
  | "blocked" // permanently denied; only system settings can fix it
  | "results" // preview of what the parser produced
  | "error"; // bridge or import failure

const PREVIEW_ROWS = 8;
const ERROR_ROWS = 5;

/**
 * SMS import, Android only. The bridge (Phase 3) delivers raw messages as
 * a "common:sms" event; the Go service (Phase 4) parses them. Nothing is
 * persisted — the result is explicitly a preview.
 */
export function ImportSmsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [deniedNote, setDeniedNote] = useState<string | null>(null);
  const [bridgeCount, setBridgeCount] = useState<number | null>(null);
  const [result, setResult] = useState<SmsImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The "common:sms" subscription is cancelled on unmount and on close, so
  // a late event can never touch an unmounted dialog, and rerenders never
  // stack duplicate listeners (each start replaces the previous one).
  const cancelEventRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

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
    setBridgeCount(null);
    setResult(null);
    setErrorMessage(null);
  }, [open]);

  function startImport() {
    if (phase === "waiting") return; // no concurrent imports
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
    ImportSms(messages)
      .then((res) => {
        if (!mountedRef.current) return;
        setResult(res);
        setPhase("results");
      })
      .catch((e) => {
        if (!mountedRef.current) return;
        setErrorMessage(String(e));
        setPhase("error");
      });
  }

  const busy = phase === "waiting";
  // The generated types allow null for Go slices even though the service
  // always returns non-nil; normalize for TS.
  const txs = result?.txs ?? [];
  const skipped = result ? result.unsupported + result.malformed + result.invalid : 0;
  const failures = (result?.results ?? []).filter((r) => r.kind !== "imported");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import SMS</DialogTitle>
          <DialogDescription>
            Read M-Pesa messages from this phone's inbox and parse them into
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

        {phase === "results" && result && (
          <div className="space-y-4">
            {bridgeCount === 0 || txs.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {bridgeCount === 0
                  ? "No M-Pesa messages found in the inbox."
                  : "Messages were read, but none could be parsed into transactions."}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md border p-2">
                    <div className="font-medium">{result.imported} parsed</div>
                    <div className="text-xs text-muted-foreground">transactions</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="font-medium">{skipped} skipped</div>
                    <div className="text-xs text-muted-foreground">
                      {result.unsupported} unsupported · {result.malformed} malformed ·{" "}
                      {result.invalid} invalid
                    </div>
                  </div>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txs.slice(0, PREVIEW_ROWS).map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatFullDate(tx.date)}
                          </TableCell>
                          <TableCell className="max-w-48 truncate text-xs">
                            {tx.description}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatMoney(tx.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {txs.length > PREVIEW_ROWS && (
                    <p className="border-t p-2 text-xs text-muted-foreground">
                      and {txs.length - PREVIEW_ROWS} more…
                    </p>
                  )}
                </div>

                {failures.length > 0 && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Skipped messages</p>
                    {failures.slice(0, ERROR_ROWS).map((r, i) => (
                      <p key={i}>
                        #{r.sourceId || "?"} ({r.kind}): {r.error}
                      </p>
                    ))}
                    {failures.length > ERROR_ROWS && (
                      <p>and {failures.length - ERROR_ROWS} more…</p>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Preview only — these transactions are not saved to history
                  yet.
                </p>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button variant="secondary" onClick={startImport} disabled={busy}>
                Read again
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
