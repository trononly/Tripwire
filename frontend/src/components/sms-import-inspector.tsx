import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleSlash, FileWarning, Ban, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  SmsImportResult,
  SmsParseResult,
} from "../../bindings/mpesa-analyzer/models";
import { formatMoney } from "@/lib/format";

/** List page size; "Show more" extends by PAGE_STEP. Keeps 2,400+ results
 * renderable: only a window of one-line rows is ever mounted. */
const PAGE = 50;
const PAGE_STEP = 100;

type KindFilter =
  | "all"
  | "imported"
  | "unsupported"
  | "malformed"
  | "invalid"
  | "non_transactional";

const KINDS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "imported", label: "Parsed" },
  { value: "unsupported", label: "Unsupported" },
  { value: "malformed", label: "Malformed" },
  { value: "invalid", label: "Invalid" },
  { value: "non_transactional", label: "Non-transactional" },
];

function kindIcon(kind: string) {
  switch (kind) {
    case "imported":
      return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />;
    case "unsupported":
      return <CircleSlash className="size-4 shrink-0 text-amber-600" />;
    case "malformed":
      return <FileWarning className="size-4 shrink-0 text-destructive" />;
    case "non_transactional":
      return <Info className="size-4 shrink-0 text-sky-600" />;
    default:
      return <Ban className="size-4 shrink-0 text-muted-foreground" />;
  }
}

/** Plain-text audit report: counts plus every message with its outcome,
 * raw body and generated transactions — sized for pasting into another
 * agent/tool for investigation. Parsed messages are capped to keep the
 * report pasteable; skipped messages are always complete. */
function buildReport(result: SmsImportResult, bridgeCount: number | null): string {
  const results = result.results ?? [];
  const txs = result.txs ?? [];
  const lines: string[] = [
    "SMS import audit report",
    `Generated: ${new Date().toISOString()}`,
    `Messages read: ${bridgeCount ?? results.length} · results: ${results.length}`,
    `Parsed: ${result.imported} (transactions: ${txs.length})`,
    `Skipped: unsupported=${result.unsupported} malformed=${result.malformed} invalid=${result.invalid} non-transactional=${result.nonTransactional}`,
    "",
    "== Skipped messages ==",
  ];
  for (const r of results) {
    if (r.kind === "imported") continue;
    lines.push(`#${r.sourceId || "?"} [${r.kind}] sender=${r.address || "-"} received=${r.dateMs ?? "-"}`);
    lines.push(`reason: ${r.error || "-"}`);
    lines.push(`body: ${r.body || "(empty)"}`);
    lines.push("");
  }
  lines.push("== Parsed messages ==");
  const imported = results.filter((r) => r.kind === "imported");
  for (const r of imported.slice(0, 20)) {
    for (const t of r.txs ?? []) {
      lines.push(`${t.id} ${t.date} ${t.description} ${formatMoney(t.amount)} balance=${formatMoney(t.balance)}`);
    }
    lines.push(`body: ${r.body || ""}`);
    lines.push("");
  }
  if (imported.length > 20) {
    lines.push(`(… ${imported.length - 20} more parsed messages truncated — filter or import again to inspect)`);
  }
  return lines.join("\n");
}

/** Deterministic list key: provider ID + receive time + kind, with a
 * repeat counter so genuinely identical records never collide. Stable
 * because ImportSms preserves received-time order. */
function resultKeys(results: SmsParseResult[]): Map<SmsParseResult, string> {
  const seen = new Map<string, number>();
  const keys = new Map<SmsParseResult, string>();
  for (const r of results) {
    const base = `${r.sourceId}|${r.dateMs ?? 0}|${r.kind}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    keys.set(r, n === 0 ? base : `${base}#${n}`);
  }
  return keys;
}

/**
 * The audit view for one SMS import: every input message is listed with its
 * outcome, filterable by kind and free text (sender, provider or receipt
 * ID, raw body). Tapping a row opens the detail with the original SMS next
 * to everything the parser produced. Nothing here is persisted.
 */
export function SmsImportInspector({
  result,
  bridgeCount,
}: {
  result: SmsImportResult;
  bridgeCount: number | null;
}) {
  const results = result.results ?? [];
  const txCount = (result.txs ?? []).length;

  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<SmsParseResult | null>(null);

  const kindCounts = useMemo(() => {
    const c: Record<string, number> = { all: results.length };
    for (const r of results) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [results]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return results.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (q === "") return true;
      return (
        (r.address ?? "").toLowerCase().includes(q) ||
        r.sourceId.toLowerCase().includes(q) ||
        (r.body ?? "").toLowerCase().includes(q) ||
        (r.txs ?? []).some(
          (t) =>
            t.id.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q),
        )
      );
    });
  }, [results, kindFilter, query]);

  const keys = useMemo(() => resultKeys(filtered), [filtered]);

  return (
    <div className="space-y-3">
      {/* Message counts vs generated transaction counts, separately. */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border p-2">
          <div className="font-medium">
            {result.imported} parsed · {results.length - result.imported} skipped
          </div>
          <div className="text-xs text-muted-foreground">
            {result.unsupported} unsupported · {result.malformed} malformed ·{" "}
            {result.invalid} invalid · {result.nonTransactional} non-transactional
            {bridgeCount !== null ? ` · ${bridgeCount} read` : ""}
          </div>
        </div>
        <div className="rounded-md border p-2">
          <div className="font-medium">{txCount} transactions</div>
          <div className="text-xs text-muted-foreground">generated from SMS</div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(buildReport(result, bridgeCount));
              toast.success("Audit report copied to clipboard");
            } catch {
              toast.error("Could not copy the report");
            }
          }}
        >
          Copy audit report
        </Button>
      </div>

      {/* Kind filter chips. */}
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <Button
            key={k.value}
            size="sm"
            variant={kindFilter === k.value ? "default" : "outline"}
            className="h-9"
            onClick={() => {
              setKindFilter(k.value);
              setVisible(PAGE);
            }}
          >
            {k.label} ({kindCounts[k.value] ?? 0})
          </Button>
        ))}
      </div>

      {/* Free-text filter: sender, IDs, raw body. */}
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setVisible(PAGE);
        }}
        placeholder="Filter by sender, receipt ID or message text…"
        className="h-10"
      />

      {/* One-line rows, windowed; tap for the full detail. */}
      <div className="overflow-hidden rounded-md border">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No messages match this filter.
          </p>
        ) : (
          <ul className="max-h-[45vh] divide-y overflow-y-auto">
            {filtered.slice(0, visible).map((r) => {
              const firstTx = (r.txs ?? [])[0];
              return (
                <li key={keys.get(r)}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 active:bg-muted"
                    onClick={() => setSelected(r)}
                  >
                    {kindIcon(r.kind)}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {r.kind === "imported" && firstTx
                          ? `${firstTx.id} · ${firstTx.description}`
                          : (r.error ?? r.kind)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {(r.body ?? "").slice(0, 90) || "(empty body)"}
                      </span>
                    </span>
                    {r.kind === "imported" && firstTx && (
                      <span className="shrink-0 font-mono text-xs">
                        {formatMoney(firstTx.amount)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > visible && (
          <div className="border-t p-2 text-center">
            <Button
              variant="outline"
              size="sm"
              className="h-10"
              onClick={() => setVisible((v) => v + PAGE_STEP)}
            >
              Show more ({filtered.length - visible} hidden)
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Preview only — these transactions are not saved to history yet.
      </p>

      <SmsResultDetail
        result={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

/** Detail view: the original SMS, its metadata, the parser outcome and
 * error, and every generated transaction including charge rows. */
function SmsResultDetail({
  result,
  onClose,
}: {
  result: SmsParseResult | null;
  onClose: () => void;
}) {
  const txs = result?.txs ?? [];
  return (
    <Dialog open={result !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:pt-[calc(1rem+env(safe-area-inset-top))] max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] max-sm:pl-[calc(1rem+env(safe-area-inset-left))] max-sm:pr-[calc(1rem+env(safe-area-inset-right))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result && kindIcon(result.kind)}
            {result?.kind === "imported"
              ? "Parsed message"
              : result
                ? `Skipped: ${result.kind}`
                : ""}
          </DialogTitle>
          <DialogDescription>
            Compare the original SMS with what the parser produced.
          </DialogDescription>
        </DialogHeader>

        {result && (
          <div className="space-y-3">
            <section>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Original SMS
              </p>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs">
                {result.body || "(empty body)"}
              </pre>
            </section>

            <section className="space-y-0.5 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Metadata</p>
              <p>
                Provider ID: {result.sourceId === "" ? "—" : result.sourceId}
              </p>
              <p>Sender: {result.address || "—"}</p>
              <p>
                Received:{" "}
                {result.dateMs
                  ? new Date(result.dateMs).toLocaleString()
                  : "—"}
              </p>
            </section>

            <section className="space-y-1 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Outcome</p>
              <p className="capitalize">{result.kind}</p>
              <p className={result.error ? "text-destructive" : "text-muted-foreground"}>
                {result.error || "No errors."}
              </p>
            </section>

            <section>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Generated transactions ({txs.length})
              </p>
              {txs.length === 0 ? (
                <p className="rounded-md border p-3 text-sm text-muted-foreground">
                  None — the message produced no transaction.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txs.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-mono text-xs">{tx.id}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {tx.date}
                          </TableCell>
                          <TableCell className="text-xs">{tx.description}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatMoney(tx.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
