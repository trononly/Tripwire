import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ParsePDF, PickFile } from "../../bindings/mpesa-analyzer/parseservice";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import { toast } from "sonner";

export function ImportStatementDialog({onImported}: {onImported: (txs:parser.Transaction[]) => void}) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [filePath, setFilePath] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handlePickFile() {
    try {
      const path = await PickFile()
      if (path) {
        setFilePath(path);
        setOpen(true);
      }
    } catch (err) {
      console.error("Error picking file:", err);
    }
  }

 async function handlePin() {
    if (!pin.trim()) {
      toast.error("PIN cannot be empty");
      return;
    }
    setIsLoading(true);
    try {
      const txs = (await ParsePDF(filePath, pin)) ?? [];
      onImported(txs);
      setOpen(false);
      setIsLoading(false)
      toast.success(`Imported ${txs.length} transactions`);
      setPin("");
      setFilePath("");
    } catch (err) {
      setIsLoading(false);
      toast.error	(String(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={(e) => {
        e.preventDefault();
        handlePickFile();
      }}>
        <Button >
          <FileUp />
          Import statement
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Import statement</DialogTitle>
          <DialogDescription>
            Enter the PIN for the statement you want to import.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="statement-pin">Statement PIN</Label>
          <Input
            id="statement-pin"
            type="password"
            placeholder="••••••"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePin()
            }}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handlePin} disabled={isLoading || !pin.trim()}>
            {isLoading ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
