import { useState } from "react";
import { Check, ChevronDown, FileUp, Trash2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";

/**
 * Header status chip plus the statement-history sheet. The chip shows the
 * active statement and opens the sheet; rows activate on tap and delete
 * behind a confirm dialog.
 */
export function HistorySheet({
  statements,
  activeId,
  open,
  onOpenChange,
  onActivate,
  onDelete,
  onImport,
}: {
  statements: store.StatementMeta[];
  activeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
}) {
  const isMobile = useIsMobile();
  const [pendingDelete, setPendingDelete] = useState<store.StatementMeta | null>(null);
  const active = statements.find((s) => s.id === activeId) ?? null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-[38vw] gap-1.5 sm:max-w-60">
            <span className="truncate">
              {active ? `${active.name} · ${active.txCount} txns` : "No statement active"}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </SheetTrigger>
        <SheetContent side={isMobile ? "bottom" : "right"} className="flex flex-col gap-0">
          <SheetHeader>
            <SheetTitle>Statement history</SheetTitle>
            <SheetDescription>
              One active at a time. Switching re-renders the dashboard.
            </SheetDescription>
          </SheetHeader>
          <div className="px-3 pb-3">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => {
                onOpenChange(false);
                onImport();
              }}
            >
              <FileUp className="size-4" />
              Import new statement
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            {statements.map((s) => {
              const isActive = s.id === activeId;
              return (
                <div
                  key={s.id}
                  className={`group flex items-center gap-2 rounded-md border px-3 py-2 ${
                    isActive ? "border-accent bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <button
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                    onClick={() => {
                      onActivate(s.id);
                      onOpenChange(false);
                    }}
                  >
                    <span className="flex w-full items-center gap-1.5 text-sm font-medium">
                      {isActive && <Check className="size-4 shrink-0" />}
                      <span className="truncate">{s.name || "Untitled statement"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.dateRange.start} – {s.dateRange.end} · {s.txCount} txns
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${s.name}`}
                    onClick={() => setPendingDelete(s)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete statement?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.name}” and its {pendingDelete?.txCount} transactions will be
              removed from the store. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
