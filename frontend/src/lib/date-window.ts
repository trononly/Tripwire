// Small date-window helpers shared by the dashboard range filter and the
// Insights bills scoping. Days are "YYYY-MM-DD" strings and compare
// lexicographically; cutoffs anchor to the dataset's own newest day, not
// today, because imported datasets are often historical.

/** Latest "YYYY-MM-DD" in a list of "2006-01-02 15:04:05" timestamps. */
export function maxDayOf(dates: string[]): string {
  let max = "";
  for (const d of dates) {
    const day = d.slice(0, 10);
    if (day > max) max = day;
  }
  return max;
}

/** The day `days-1` days before `latest` ("YYYY-MM-DD"), UTC arithmetic. */
export function cutoffDay(latest: string, days: number): string {
  const ms = Date.parse(`${latest}T00:00:00Z`) - (days - 1) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}
