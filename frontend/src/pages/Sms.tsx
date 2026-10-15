import { useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2, Smartphone } from "lucide-react";

import type { SmsImportResult } from "../../bindings/mpesa-analyzer/models";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SmsImportInspector } from "@/components/sms-import-inspector";

/**
 * SMS - the source-data view, mobile only: import M-Pesa texts, see the
 * parsed/skipped breakdown, and audit what the parser made of each message.
 * Importing saves straight into the regular store and switches the app
 * into SMS mode; the financial views stay on Dashboard and Transactions.
 */
export default function Sms({
  result,
  bridgeCount,
  isAndroid,
  importing = false,
  onImport,
}: {
  result: SmsImportResult | null;
  bridgeCount: number | null;
  isAndroid: boolean;
  /** True while an SMS import is in flight: show skeletons, not buttons. */
  importing?: boolean;
  onImport: () => void;
}) {
  // Auto-import once: opening the page on Android with nothing imported
  // yet starts a direct import. The ref guard keeps StrictMode's
  // double-effect from firing twice; the buttons stay as manual fallback.
  const autoFired = useRef(false);
  useEffect(() => {
    if (isAndroid && result === null && !importing && !autoFired.current) {
      autoFired.current = true;
      onImport();
    }
  }, [isAndroid, result, importing, onImport]);

  // Pull-to-refresh, mirroring Transactions: dragging down from the very
  // top reveals an arrow that rotates with pull distance; releasing past
  // threshold starts an SMS import. onImport is sync, so the indicator
  // clears via the importing prop once the import settles.
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const refreshStarted = useRef(0);
  useEffect(() => {
    if (!refreshing || importing) return;
    const wait = Math.max(0, 700 - (Date.now() - refreshStarted.current));
    const t = window.setTimeout(() => {
      setRefreshing(false);
      setPull(0);
    }, wait);
    return () => window.clearTimeout(t);
  }, [refreshing, importing]);

  return (
    <div
      className="space-y-6"
      onTouchStart={(e) => {
        if (window.scrollY <= 0 && !refreshing) {
          startY.current = e.touches[0].clientY;
        }
      }}
      onTouchMove={(e) => {
        if (startY.current === null || refreshing) return;
        const d = e.touches[0].clientY - startY.current;
        setPull(d > 0 ? Math.min(d * 0.5, 96) : 0);
      }}
      onTouchEnd={() => {
        startY.current = null;
        if (pull >= 64 && !refreshing && !importing && isAndroid) {
          refreshStarted.current = Date.now();
          onImport();
          setRefreshing(true);
        } else if (!refreshing) {
          setPull(0);
        }
      }}
    >
      {(pull > 0 || refreshing) && (
        <div
          className="flex items-start justify-center overflow-hidden"
          style={{ height: refreshing ? 44 : pull }}
          aria-hidden="true"
        >
          {refreshing ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <ArrowDown
              className="size-5 text-muted-foreground transition-transform"
              style={{ transform: `rotate(${Math.min(pull / 64, 1) * 180}deg)` }}
            />
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Import and audit M-Pesa SMS messages.
        </p>
      </div>

      {result ? (
        <SmsImportInspector result={result} bridgeCount={bridgeCount} />
      ) : importing ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-20" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <Card className="flex min-h-64 items-center justify-center border-dashed">
          <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-6 text-center">
            {isAndroid ? (
              <>
                <p className="text-lg font-medium">No SMS imported yet</p>
                <p className="text-sm text-muted-foreground">
                  Pull down to read the M-Pesa messages from this phone&rsquo;s
                  inbox and import them as transactions.
                </p>
              </>
            ) : (
              <>
                <Smartphone className="size-8 text-muted-foreground" />
                <p className="text-lg font-medium">Android only</p>
                <p className="text-sm text-muted-foreground">
                  SMS import reads the device inbox and is available in the
                  Android app. On desktop, import PDF statements instead.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
