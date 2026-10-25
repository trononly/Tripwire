export function formatMoney(cents: number): string {
  const value = cents / 100;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Compact form for ranges and tight spaces: "KSh 2,450" (no decimals). */
export function formatMoneyShort(cents: number): string {
  const value = cents / 100;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Group a whole-shilling input from the right: "1234567" -> "1,234,567".
 * Non-digits are dropped, so it doubles as the input mask for amount fields
 * while the raw digits stay in state for validation and the USSD script.
 */
export function formatAmountInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Display a Kenyan mobile number as "0712 345 678" while typing. Keeps the
 * leading 0, accepts a pasted +254/254 prefix, and drops anything past the
 * ten significant digits.
 */
export function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length >= 12) {
    digits = `0${digits.slice(3)}`;
  }
  digits = digits.slice(0, 10);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

/**
 * Human-readable file size. Uses decimal MB/KB so the update prompt matches
 * the size GitHub and the browser show for the release asset (an APK is
 * 15.7 MB on disk, not 15.0 MiB).
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${Math.max(1, Math.round(n / 1_000))} KB`;
  return `${Math.round(n)} B`;
}

// "2026-04-28 19:55:42" -> "28 Apr"
export function formatDay(iso: string): string {
  const d = new Date(iso.replace(" ", "T"));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// "2026-04-28 19:55:42" -> "28 Apr 2026"
export function formatFullDate(iso: string): string {
  const d = new Date(iso.replace(" ", "T"));
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// "2026-W18" -> "18 Apr"; "2026-04" -> "Apr 2026"; "2026-04-28" -> "28 Apr"
export function formatBucketLabel(label: string): string {
  if (label.includes("W")) {
    const [year, week] = label.split("-W");
    // ISO week start: Jan 4 is always in week 1.
    const jan4 = new Date(Date.UTC(Number(year), 0, 4));
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (Number(week) - 1) * 7);
    return monday.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  }
  if (/^\d{4}-\d{2}$/.test(label)) {
    const [y, m] = label.split("-");
    return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return formatDay(label);
}
