/**
 * Safe date formatting utilities that never produce "Invalid Date".
 * All functions handle null, undefined, empty strings, and malformed input gracefully.
 *
 * Backend timestamps are "2006-01-02 15:04:05" (space-separated, local wall
 * time) or plain "YYYY-MM-DD" days. Normalize with the same convention as
 * lib/format.ts (space -> "T", parsed as local time) so every caller agrees.
 */

/** Normalize a backend timestamp to something `new Date` parses reliably. */
function toDate(time: string): Date | null {
  const s = time.trim().replace(" ", "T");
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return isNaN(d.getTime()) ? null : d;
}

/** Safely format a "YYYY-MM-DD" (or backend datetime) string to a short date label.
 * Returns "—" for invalid input. */
export function safeFormatDay(time: string | undefined | null): string {
  if (!time) return "—";
  const d = toDate(time);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** Safely format a date with year for tooltips. */
export function safeFormatFull(time: string | undefined | null): string {
  if (!time) return "—";
  const d = toDate(time);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Safely format for x-axis ticks: "14 Oct" style. */
export function safeFormatTick(time: string | undefined | null): string {
  if (!time) return "";
  const d = toDate(time);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** Extract "YYYY-MM-DD" from any date string safely. */
export function safeDayOf(dateTime: string | undefined | null): string {
  if (!dateTime) return "";
  const d = toDate(dateTime);
  if (!d) return "";
  return dateTime.slice(0, 10);
}
