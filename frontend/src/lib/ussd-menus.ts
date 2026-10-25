// M-PESA *334# menu map - owner-confirmed 2026-10-13 (English handset).
// The app dials plain *334# (Safaricom drops stacked suffixes) and the
// Android automation service walks the live menus step by step, stopping at
// the PIN screen. Hardcoded option numbers below are the MVP: if Safaricom
// renumbers, update them here - no service changes needed.

export const USSD_MENUS = {
  root: "*334#",
  /** 1. Send money -> 1. Send to any network / 3. Pochi La Biashara */
  send: { rootOption: "1", sendAny: "1", pochi: "3" },
  /** 6. Lipa na M-PESA -> 1. Pay Bill / 2. Buy Goods and Services */
  lipa: { rootOption: "6", paybill: "1", till: "2" },
  /** Confirmation prompt after amount: 1 = Yes */
  confirmYes: "1",
} as const;

export type SendKind = "send" | "pochi";

/** One automation step: prompt contains ANY keyword → type input + Send. */
export interface UssdStep {
  match: string[];
  input: string;
}

/** Frontend-owned, versioned script handed to the automation service. */
export interface QuickEntryScript {
  version: 1;
  kind: "send" | "pochi" | "paybill" | "till";
  /** Armed window in seconds; the service disarms on expiry. */
  timeoutSec: number;
  steps: UssdStep[];
}

const DEFAULT_TIMEOUT_SEC = 90;

/** Normalize KE numbers to 0XXXXXXXXX (07../01..). Returns "" when invalid. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 14 && d.startsWith("00254")) {
    d = `0${d.slice(5)}`;
  } else if (d.length === 13 && d.startsWith("2540")) {
    // "+254 (0) 712 …"
    d = `0${d.slice(4)}`;
  } else if (d.length === 12 && d.startsWith("254")) {
    d = `0${d.slice(3)}`;
  } else if (d.length === 9 && /^[71]/.test(d)) {
    d = `0${d}`;
  }
  if (/^0[17]\d{8}$/.test(d)) return d;
  return "";
}

/** Till numbers are 5-7 digits on Safaricom. */
export function isValidTill(raw: string): boolean {
  return /^\d{5,7}$/.test(raw.replace(/[\s-]/g, ""));
}

/** Paybill (business) numbers are 4-7 digits. */
export function isValidPaybill(raw: string): boolean {
  return /^\d{4,7}$/.test(raw.replace(/[\s-]/g, ""));
}

/** Account names/numbers: non-empty, no USSD control chars. */
export function isValidAccount(raw: string): boolean {
  const t = raw.trim();
  return t.length > 0 && t.length <= 20 && !/[*#]/.test(t);
}

/** Whole-shilling amounts within M-PESA per-transaction limits. */
export function isValidAmount(raw: string): boolean {
  if (!/^\d+$/.test(raw.trim())) return false;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1 && n <= 500000;
}

/**
 * Send flow: root → Send money → any-network/Pochi → phone → amount →
 * PIN (service stops, user types it) → 1 (Yes) to confirm.
 */
export function buildSendScript(
  kind: SendKind,
  phone: string,
  amount: string,
): QuickEntryScript | null {
  const p = normalizePhone(phone);
  const a = amount.trim();
  if (!p || !isValidAmount(a)) return null;
  const sub =
    kind === "pochi" ? USSD_MENUS.send.pochi : USSD_MENUS.send.sendAny;
  const subMatch =
    kind === "pochi" ? ["pochi la biashara", "pochi"] : ["any network"];
  return {
    version: 1,
    kind,
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    steps: [
      { match: ["send money"], input: USSD_MENUS.send.rootOption },
      { match: subMatch, input: sub },
      { match: ["phone", "number", "namba"], input: p },
      { match: ["amount", "kiasi"], input: String(Number(a)) },
      { match: ["yes", "confirm", "thibitisha"], input: USSD_MENUS.confirmYes },
    ],
  };
}

/** Paybill flow: root → Lipa → Pay Bill → business → account → amount → PIN → 1. */
export function buildPaybillScript(
  business: string,
  account: string,
  amount: string,
): QuickEntryScript | null {
  const b = business.replace(/[\s-]/g, "");
  const acc = account.trim();
  const a = amount.trim();
  if (!isValidPaybill(b) || !isValidAccount(acc) || !isValidAmount(a)) {
    return null;
  }
  return {
    version: 1,
    kind: "paybill",
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    steps: [
      { match: ["lipa na m-pesa", "lipa"], input: USSD_MENUS.lipa.rootOption },
      { match: ["pay bill", "paybill"], input: USSD_MENUS.lipa.paybill },
      { match: ["business", "paybill number", "biashara"], input: b },
      { match: ["account", "akaunti"], input: acc },
      { match: ["amount", "kiasi"], input: String(Number(a)) },
      { match: ["yes", "confirm", "thibitisha"], input: USSD_MENUS.confirmYes },
    ],
  };
}

/** Till flow: root → Lipa → Buy Goods → till → amount → PIN → 1. */
export function buildTillScript(
  till: string,
  amount: string,
): QuickEntryScript | null {
  const t = till.replace(/[\s-]/g, "");
  const a = amount.trim();
  if (!isValidTill(t) || !isValidAmount(a)) return null;
  return {
    version: 1,
    kind: "till",
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    steps: [
      { match: ["lipa na m-pesa", "lipa"], input: USSD_MENUS.lipa.rootOption },
      { match: ["buy goods", "till", "nunua"], input: USSD_MENUS.lipa.till },
      { match: ["till number", "till"], input: t },
      { match: ["amount", "kiasi"], input: String(Number(a)) },
      { match: ["yes", "confirm", "thibitisha"], input: USSD_MENUS.confirmYes },
    ],
  };
}

/**
 * Same rule the service applies live: given a full USSD prompt, return the
 * option number before the matched label ("3. Pochi…" + ["pochi"] → "3").
 * Null when nothing matches - the service aborts instead of guessing.
 */
