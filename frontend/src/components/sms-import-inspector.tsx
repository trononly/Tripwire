import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  FileWarning,
  Ban,
  Info,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SlidersHorizontal } from "lucide-react";
import type {
  SmsImportResult,
  SmsParseResult,
} from "../../bindings/mpesa-analyzer/models";
import { formatMoney } from "@/lib/format";
import { filterSmsResults, type KindFilter } from "@/lib/sms-filter";
import { cn } from "@/lib/utils";

/** List page size; "Show more" extends by PAGE_STEP. Keeps 2,400+ results
 * renderable: only a window of one-line rows is ever mounted. */
const PAGE = 50;
const PAGE_STEP = 100;

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

/** Plain-text audit report of exactly the rows on screen: counts plus
 * every message with its outcome, raw body and generated transactions -
 * sized for pasting into another agent/tool for investigation. Parsed
 * messages are capped to keep the report pasteable. */
function buildReport(
  scope: string,
  rows: SmsParseResult[],
  total: number,
  bridgeCount: number | null,
): string {
  const skipped = rows.filter((r) => r.kind !== "imported");
  const imported = rows.filter((r) => r.kind === "imported");
  const lines: string[] = [
    "SMS import audit report",
    `Generated: ${new Date().toISOString()}`,
    `Scope: ${scope} (${rows.length} of ${total} messages)`,
  ];
  if (bridgeCount !== null) lines.push(`Messages read: ${bridgeCount}`);
  lines.push("", `== Skipped messages (${skipped.length}) ==`);
  for (const r of skipped) {
    lines.push(
      `#${r.sourceId || "?"} [${r.kind}] sim=${r.simLabel || r.simId || "-"} sender=${r.address || "-"} received=${r.dateMs ?? "-"}`,
    );
    lines.push(`reason: ${r.error || "-"}`);
    lines.push(`body: ${r.body || "(empty)"}`);
    lines.push("");
  }
  lines.push(`== Parsed messages (${imported.length}) ==`);
  for (const r of imported.slice(0, 20)) {
    for (const t of r.txs ?? []) {
      lines.push(
        `${t.id} ${t.date} ${t.description} ${formatMoney(t.amount)} balance=${formatMoney(t.balance)}`,
      );
    }
    lines.push(`body: ${r.body || ""}`);
    lines.push("");
  }
  if (imported.length > 20) {
    lines.push(
      `(… ${imported.length - 20} more parsed messages truncated; filter further to inspect)`,
    );
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
  const results = useMemo(() => result.results ?? [], [result.results]);

  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const kindCounts = useMemo(() => {
    const c: Record<string, number> = { all: results.length };
    for (const r of results) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [results]);

  const filtered = useMemo(
    () =>
      filterSmsResults(results, {
        kind: kindFilter,
        query,
        from: fromDay,
        to: toDay,
      }),
    [results, kindFilter, query, fromDay, toDay],
  );

  const keys = useMemo(() => resultKeys(filtered), [filtered]);

  const activeFilterCount =
    (kindFilter === "all" ? 0 : 1) + (fromDay ? 1 : 0) + (toDay ? 1 : 0);

  const clearFilters = () => {
    setKindFilter("all");
    setFromDay("");
    setToDay("");
    setVisible(PAGE);
  };

  // What the copy button copies: exactly the rows on screen.
  const scopeLabel = useMemo(() => {
    const kind = KINDS.find((k) => k.value === kindFilter)?.label ?? "All";
    const dates =
      fromDay || toDay ? `${fromDay || "…"}–${toDay || "…"}` : null;
    const q = query.trim().slice(0, 24);
    return [kind, dates, q ? `“${q}”` : null].filter(Boolean).join(" · ");
  }, [kindFilter, query, fromDay, toDay]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                buildReport(scopeLabel, filtered, results.length, bridgeCount),
              );
              toast.success("Audit report copied to clipboard");
            } catch {
              toast.error("Could not copy the report");
            }
          }}
        >
          Copy {scopeLabel} report
        </Button>
      </div>

      {/* Search + filter button row. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(PAGE);
            }}
            placeholder="Filter by sender, receipt ID or message text…"
            className="pr-9"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear filter"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Filters"
          onClick={() => setFiltersOpen(true)}
          className="relative size-8 shrink-0"
        >
          <SlidersHorizontal className="size-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Drawer: kind filters in a bottom sheet. */}
      <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Filter messages</DrawerTitle>
            <DrawerDescription>
              {filtered.length} messages match.
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-1.5 p-4">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                aria-pressed={kindFilter === k.value}
                onClick={() => {
                  setKindFilter(k.value);
                  setVisible(PAGE);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50",
                  kindFilter === k.value && "border-primary bg-accent",
                )}
              >
                <span>{k.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {kindCounts[k.value] ?? 0}
                </span>
              </button>
            ))}
            {/* Received-date window: newest messages surface first, so the
                To date is the common anchor. */}
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-muted-foreground">
                Received date
              </p>
              <div className="flex items-center gap-2">
                <label className="flex-1 space-y-1">
                  <span className="text-xs text-muted-foreground">From</span>
                  <Input
                    type="date"
                    value={fromDay}
                    max={toDay || undefined}
                    onChange={(e) => {
                      setFromDay(e.target.value);
                      setVisible(PAGE);
                    }}
                  />
                </label>
                <label className="flex-1 space-y-1">
                  <span className="text-xs text-muted-foreground">To</span>
                  <Input
                    type="date"
                    value={toDay}
                    min={fromDay || undefined}
                    onChange={(e) => {
                      setToDay(e.target.value);
                      setVisible(PAGE);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
          <DrawerFooter>
            <Button
              variant="outline"
              onClick={clearFilters}
              disabled={activeFilterCount === 0}
            >
              Clear filters
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* One-line rows, windowed; tap to expand inline like the
          Transactions list - no fullscreen takeover. */}
      <div className="overflow-hidden rounded-md border">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No messages match this filter.
          </p>
        ) : (
          <ul className="max-h-[45vh] divide-y overflow-y-auto">
            {filtered.slice(0, visible).map((r) => {
              const firstTx = (r.txs ?? [])[0];
              const key = keys.get(r) ?? r.sourceId;
              const expanded = expandedKey === key;
              const txs = r.txs ?? [];
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 active:bg-muted"
                    onClick={() =>
                      setExpandedKey((prev) => (prev === key ? null : key))
                    }
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
                      <span className="shrink-0 text-xs tabular-nums">
                        {formatMoney(firstTx.amount)}
                      </span>
                    )}
                    <ChevronDown
                      className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
                        expanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {expanded && (
                    <div className="space-y-2 border-t border-border/60 bg-muted/40 px-3 py-2.5 text-[13px] select-text">
                      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background/60 p-2 font-mono text-xs">
                        {r.body || "(empty body)"}
                      </pre>
                      <AuditRow label="Provider ID" value={r.sourceId || "-"} mono />
                      <AuditRow label="Sender" value={r.address || "-"} />
                      <AuditRow
                        label="Received"
                        value={
                          r.dateMs
                            ? new Date(r.dateMs).toLocaleString()
                            : "-"
                        }
                      />
                      <AuditRow
                        label="Outcome"
                        value={`${r.kind}${r.error ? `: ${r.error}` : ""}`}
                      />
                      <p className="pt-1 text-xs font-medium text-muted-foreground">
                        Generated transactions ({txs.length})
                      </p>
                      {txs.length > 0 && (
                        <ul className="divide-y rounded-md border bg-background/40">
                          {txs.map((tx) => (
                            <li
                              key={tx.id}
                              className="min-w-0 space-y-0.5 px-3 py-2 text-xs"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="min-w-0 truncate font-mono">
                                  {tx.id}
                                </span>
                                <span className="shrink-0 tabular-nums">
                                  {formatMoney(tx.amount)}
                                </span>
                              </div>
                              <p className="wrap-break-words">
                                {tx.description}
                              </p>
                              <p className="text-muted-foreground">{tx.date}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
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
        {/* Sticky bottom bar for pagination */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:border-0 md:bg-transparent md:backdrop-blur-0"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-2">
            <span className="text-sm text-muted-foreground">
              {filtered.length} message{filtered.length === 1 ? "" : "s"}
            </span>
            {filtered.length > visible && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisible((v) => v + PAGE_STEP)}
              >
                Show more ({filtered.length - visible} hidden)
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-x-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${mono ? "font-mono" : ""} wrap-break-words`}>
        {value}
      </span>
    </div>
  );
}
