/**
 * Safe date formatting utilities that never produce "Invalid Date".
 * All functions handle null, undefined, empty strings, and malformed input gracefully.
 */

/** Safely format a "YYYY-MM-DD" (or ISO datetime) string to a short date label.
 * Returns "—" for invalid input. */
export function safeFormatDay(time: string | undefined | null): string {
  if (!time) return "—";
  const d = new Date(time.includes("T") ? time : `${time}T00:00:00Z`);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Safely format a date with year for tooltips. */
export function safeFormatFull(time: string | undefined | null): string {
  if (!time) return "—";
  const d = new Date(time.includes("T") ? time : `${time}T00:00:00Z`);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Safely format for x-axis ticks: "14 Oct" style. */
export function safeFormatTick(time: string | undefined | null): string {
  if (!time) return "";
  const d = new Date(time.includes("T") ? time : `${time}T00:00:00Z`);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Extract "YYYY-MM-DD" from any date string safely. */
export function safeDayOf(dateTime: string | undefined | null): string {
  if (!dateTime) return "";
  const d = new Date(dateTime);
  if (isNaN(d.getTime())) return "";
  return dateTime.slice(0, 10);
}
