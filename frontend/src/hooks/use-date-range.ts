import { useCallback, useMemo, useState } from "react";

export type RangeKey = "7" | "30" | "90" | "ytd" | "all" | "custom";

export interface DateRange {
  start: string; // "YYYY-MM-DD"
  end: string;   // "YYYY-MM-DD"
}

const RANGE_KEY = "mpesa-analyzer.range";

/** Get today's date as "YYYY-MM-DD" in UTC. */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Check if a "YYYY-MM-DD" string is a valid date. */
function isValidDay(day: string): boolean {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !isNaN(d.getTime());
}

/** Subtract N days from a "YYYY-MM-DD" string, return "YYYY-MM-DD".
 * Returns empty string for invalid input. */
function subtractDays(day: string, days: number): string {
  if (!isValidDay(day)) return "";
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Get "YYYY-MM-DD" for January 1st of the year containing `day`. */
function startOfYear(day: string): string {
  return `${day.slice(0, 4)}-01-01`;
}

/** Compute the {start, end} for a given preset key and the latest dataset day.
 * If latestDay is invalid, falls back to "all" behavior. */
export function computeRange(
  key: RangeKey,
  latestDay: string,
  customRange?: DateRange | null,
): DateRange {
  const today = todayUTC();
  // If no valid latest day, fall back to "all" for any bounded range
  if (!isValidDay(latestDay)) {
    return { start: "0000-01-01", end: today };
  }
  switch (key) {
    case "7":
      return { start: subtractDays(latestDay, 7), end: latestDay };
    case "30":
      return { start: subtractDays(latestDay, 30), end: latestDay };
    case "90":
      return { start: subtractDays(latestDay, 90), end: latestDay };
    case "ytd":
      return { start: startOfYear(latestDay), end: latestDay };
    case "custom":
      if (customRange) return customRange;
      return { start: subtractDays(latestDay, 30), end: latestDay };
    case "all":
    default:
      return { start: "0000-01-01", end: today };
  }
}

/** Human-readable label for the range. */
export function rangeLabel(key: RangeKey, range: DateRange): string {
  switch (key) {
    case "7":
      return "Last 7 Days";
    case "30":
      return "Last 30 Days";
    case "90":
      return "Last 90 Days";
    case "ytd":
      return "Year to Date";
    case "custom": {
      const fmt = (d: string) => {
        if (!isValidDay(d)) return d || "?";
        return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        });
      };
      return `Custom (${fmt(range.start)} – ${fmt(range.end)})`;
    }
    case "all":
    default:
      return "All Time";
  }
}

export function useDateRange(latestDay: string) {
  const [rangeKey, setRangeKeyState] = useState<RangeKey>(() => {
    try {
      const s = localStorage.getItem(RANGE_KEY);
      return (s as RangeKey) || "30";
    } catch {
      return "30";
    }
  });
  const [customRange, setCustomRange] = useState<DateRange | null>(null);

  const setRangeKey = useCallback((key: RangeKey) => {
    setRangeKeyState(key);
    try {
      localStorage.setItem(RANGE_KEY, key);
    } catch {
      /* private mode */
    }
  }, []);

  const setCustom = useCallback(
    (range: DateRange) => {
      setCustomRange(range);
      setRangeKey("custom");
    },
    [setRangeKey],
  );

  const range = useMemo(
    () => computeRange(rangeKey, latestDay, customRange),
    [rangeKey, latestDay, customRange],
  );

  const label = useMemo(
    () => rangeLabel(rangeKey, range),
    [rangeKey, range],
  );

  return { rangeKey, range, label, setRangeKey, setCustom };
}
