import { CheckCircle2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogOverlay,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatFullDate, formatMoney } from "@/lib/format";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";

/**
 * Arrival receipt: the current transaction presented like an M-Pesa
 * confirmation slip - big amount, dashed tear-off separators, receipt
 * number. Opens automatically when a fresh confirmation merges (launch,
 * foreground-resume, or the debug replay); never from manual imports.
 */
export function TransactionReceiptDialog({
  tx,
  onClose,
  onViewAll,
  title = "Payment received",
  showViewAll = true,
}: {
  tx: parser.Transaction | null;
  onClose: () => void;
  onViewAll: () => void;
  title?: string;
  showViewAll?: boolean;
}) {
  return (
    <Dialog open={tx !== null} onOpenChange={(o) => !o && onClose()}>
      {/* Privacy veil: the ledger behind is blurred beyond reading while
          the slip is up. Stronger than the default dialog scrim. */}
      <DialogOverlay className="bg-black/70 backdrop-blur-xl" />
      <DialogContent className="max-w-sm max-sm:w-[calc(100vw-2rem)]">
        <div className="flex flex-col items-center gap-1 pt-2 text-center">
          <CheckCircle2 className="size-10 text-emerald-500" strokeWidth={1.5} />
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        </div>
        {tx && (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p
              className={`text-2xl font-bold tabular-nums ${
                tx.amount >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {formatMoney(tx.amount)}
            </p>
            <p className="mt-1 text-sm font-medium">{tx.description}</p>
            <div className="mt-3 space-y-1 border-t border-dashed pt-3 text-left text-xs tabular-nums">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Receipt No.</span>
                <span>{tx.id}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Date</span>
                <span>{formatFullDate(tx.date)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <span>{tx.status}</span>
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="flex-row justify-stretch gap-2 max-sm:flex-row">
          {showViewAll && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                onClose();
                onViewAll();
              }}
            >
              View all
            </Button>
          )}
          <Button className="flex-1" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
