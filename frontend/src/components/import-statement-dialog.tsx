import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImportStatement, PickFile } from "../../bindings/mpesa-analyzer/parseservice";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";
import { toast } from "sonner";

/**
 * Statement import, two steps: the file picker runs when `open` turns
 * true, then the dialog asks for the PIN and (optionally) a name. A blank
 * name is derived from the transaction date range by the backend.
 */
export function ImportStatementDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (record: store.StatementRecord) => void;
}) {
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pickStarted = useRef(false);

  useEffect(() => {
    if (!open) {
      pickStarted.current = false;
      setPin("");
      setName("");
      setFilePath(null);
      setIsLoading(false);
      return;
    }
    if (pickStarted.current) return;
    pickStarted.current = true;
    PickFile()
      .then((path) => {
        if (path) {
          setFilePath(path);
        } else {
          onOpenChange(false);
        }
      })
      .catch((err) => {
        console.error("Error picking file:", err);
        onOpenChange(false);
      });
  }, [open, onOpenChange]);

  async function handleImport() {
    if (!filePath || !pin.trim()) return;
    setIsLoading(true);
    try {
      const record = await ImportStatement(filePath, pin, name);
      if (record) {
        onImported(record);
        toast.success(`Imported ${record.txCount} transactions`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:pt-[calc(1rem+env(safe-area-inset-top))] max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] max-sm:pl-[calc(1rem+env(safe-area-inset-left))] max-sm:pr-[calc(1rem+env(safe-area-inset-right))] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Import statement</DialogTitle>
          <DialogDescription>
            {filePath === null
              ? "Choose a statement PDF…"
              : "Enter the PIN for the statement you want to import."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="statement-name">Statement name</Label>
            <Input
              id="statement-name"
              placeholder="Jan 2025 – Sep 2025"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={filePath === null}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to name it from the transaction dates.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="statement-pin">Statement PIN</Label>
            <Input
              id="statement-pin"
              type="password"
              placeholder="••••••"
              autoFocus={filePath !== null}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleImport();
              }}
              disabled={filePath === null}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={isLoading || filePath === null || !pin.trim()}>
            {isLoading ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
