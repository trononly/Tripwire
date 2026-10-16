// Pure filtering for the SMS import audit list. Kept out of the component so
// the received-date window and the newest-first ordering are unit-testable
// without a DOM, and so the inspector stays a components-only module.
import type { SmsParseResult } from "../../bindings/mpesa-analyzer/models";

/** Kind bucket the audit list can filter by; "all" means no kind filter. */
export type KindFilter =
  | "all"
  | "imported"
  | "unsupported"
  | "malformed"
  | "invalid"
  | "non_transactional";

/** Local start-of-day ms for an `<input type="date">` value (YYYY-MM-DD). */
export function dayStartMs(value: string): number | null {
  const [y, m, d] = value.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** Local end-of-day ms (inclusive) for an `<input type="date">` value. */
export function dayEndMs(value: string): number | null {
  const [y, m, d] = value.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/**
 * Filter the audit list by kind, free text and an optional received-date
 * window (both bounds inclusive, as `YYYY-MM-DD` from a date input). Results
 * come back today-to-past (newest first) so the most recent message sits at
 * the top. A row with no received time only survives when no date window is
 * set; it then sinks to the bottom.
 */
export function filterSmsResults(
  results: SmsParseResult[],
  opts: {
    kind?: KindFilter;
    query?: string;
    from?: string;
    to?: string;
  } = {},
): SmsParseResult[] {
  const kind = opts.kind ?? "all";
  const q = (opts.query ?? "").trim().toLowerCase();
  const fromMs = opts.from ? dayStartMs(opts.from) : null;
  const toMs = opts.to ? dayEndMs(opts.to) : null;
  const matched = results.filter((r) => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (fromMs !== null || toMs !== null) {
      const at = r.dateMs ?? null;
      if (at === null) return false;
      if (fromMs !== null && at < fromMs) return false;
      if (toMs !== null && at > toMs) return false;
    }
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
  // Newest first; rows without a received time sink to the bottom while
  // keeping their original (received-time) order.
  return matched
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const am = a.r.dateMs ?? Number.NEGATIVE_INFINITY;
      const bm = b.r.dateMs ?? Number.NEGATIVE_INFINITY;
      return bm - am || a.i - b.i;
    })
    .map((x) => x.r);
}
