// Which SIM a guided payment should dial on.
//
// *334# opens the menu of whichever line answers it (M-PESA on Safaricom,
// Airtel Money on Airtel, T-Kash on Telkom), and a dual-SIM phone either
// uses its default call line or shows a "Call with SIM 1 / SIM 2" chooser
// that the armed automation never gets past. The wallet switcher already is
// the user's own line choice, so payments reuse it: the SIM the active
// wallet came from is the SIM to dial. That is true whatever the carrier
// label says - Airtel/Telkom menu automation is not implemented yet, but
// opening the line the user picked still shows that wallet's real menu.

import type { StatementMeta } from "../../bindings/mpesa-analyzer/internal/store/models";

/**
 * The SIM key ("sim-0" / "sub-12") to pin a payment to, or null to let the
 * native bridge choose a line (Safaricom, then the only SIM). Only SMS
 * wallets carry a SIM; statement imports deliberately return null.
 */
export function paySimKey(
  meta: Pick<StatementMeta, "source" | "simId" | "simLabel"> | null | undefined,
): string | null {
  if (!meta || meta.source !== "sms") return null;
  return meta.simId?.trim() || null;
}
