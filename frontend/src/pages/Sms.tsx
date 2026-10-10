import { Link } from "react-router-dom";
import {
  ArrowRight,
  MessageSquareText,
  Smartphone,
} from "lucide-react";

import type { SmsImportResult } from "../../bindings/mpesa-analyzer/models";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SmsImportInspector } from "@/components/sms-import-inspector";

/**
 * SMS — the source-data view, mobile only: import M-Pesa texts, see the
 * parsed/skipped breakdown, and audit what the parser made of each message.
 * Importing saves straight into the regular store and switches the app
 * into SMS mode; the financial views stay on Dashboard and Transactions.
 */
export default function Sms({
  result,
  bridgeCount,
  isAndroid,
  onImport,
}: {
  result: SmsImportResult | null;
  bridgeCount: number | null;
  isAndroid: boolean;
  onImport: () => void;
}) {
  const txCount = (result?.txs ?? []).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">SMS</h1>
        </div>
        {isAndroid && (
          <Button onClick={onImport}>
            <MessageSquareText />
            Import SMS
          </Button>
        )}
      </div>

      {result && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0 max-sm:px-4 max-sm:py-4 sm:pt-6">
            <div className="min-w-0 text-sm">
              <p>
                <span className="font-medium">
                  {result.imported} parsed
                </span>{" "}
                · {results(result) - result.imported} skipped ·{" "}
                {txCount.toLocaleString()} transactions
              </p>
            </div>
            {txCount > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link to="/">
                  Open Dashboard
                  <ArrowRight />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {result ? (
        <SmsImportInspector result={result} bridgeCount={bridgeCount} />
      ) : (
        <Card className="flex min-h-64 items-center justify-center border-dashed">
          <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-6 text-center">
            {isAndroid ? (
              <>
                <p className="text-lg font-medium">No SMS imported yet</p>
                <p className="text-sm text-muted-foreground">
                  Read the M-Pesa messages from this phone&rsquo;s inbox and
                  import them as transactions.
                </p>
                <Button onClick={onImport}>
                  <MessageSquareText />
                  Import SMS
                </Button>
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

/** Total per-message results in this batch (all outcome kinds). */
function results(result: SmsImportResult): number {
  return (result.results ?? []).length;
}
