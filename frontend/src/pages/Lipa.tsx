import { useState } from "react";
import { Events } from "@wailsio/runtime";
import { toast } from "sonner";
import { ReceiptText, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AutomationOffPanel, useAutomationAvailable } from "@/components/automation-gate";
import { cn } from "@/lib/utils";
import {
  buildPaybillScript,
  buildTillScript,
  isValidAccount,
  isValidAmount,
  isValidPaybill,
  isValidTill,
} from "@/lib/ussd-menus";
import {
  isAndroidBridge,
  openUssdAutomationSettings,
} from "@/lib/sms-bridge";
import { useQuickEntry } from "@/hooks/use-quick-entry";


type LipaTab = "paybill" | "till";
const TABS: { id: LipaTab; label: string; icon: typeof ReceiptText }[] = [
  { id: "paybill", label: "Paybill", icon: ReceiptText },
  { id: "till", label: "Buy Goods", icon: ShoppingCart },
];

/** Lipa na M-PESA — Paybill (paybill + account + amount) / Buy Goods (till + amount). */
export default function Lipa() {
  const [tab, setTab] = useState<LipaTab>("paybill");
  const [paybill, setPaybill] = useState("");
  const [account, setAccount] = useState("");
  const [till, setTill] = useState("");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const auto = useAutomationAvailable();
  const qe = useQuickEntry();

  const paybillOk =
    isValidPaybill(paybill) && isValidAccount(account) && isValidAmount(amount);
  const tillOk = isValidTill(till) && isValidAmount(amount);
  const valid = tab === "paybill" ? paybillOk : tillOk;
  const busy = qe.status === "starting" || qe.status === "step";

  function handleSend() {
    setTouched(true);
    if (!valid) {
      toast.error("Fill in all fields correctly.");
      return;
    }
    const script =
      tab === "paybill"
        ? buildPaybillScript(paybill, account, amount)
        : buildTillScript(till, amount);
    if (!script) {
      toast.error("Invalid details.");
      return;
    }
    if (!isAndroidBridge()) {
      toast.info("Guided payments need the Android app.");
      return;
    }
    if (!auto.available) {
      auto.recheck();
      toast.error("Turn on M-Pesa automation first.", {
        action: { label: "Open settings", onClick: openUssdAutomationSettings },
      });
      return;
    }
    // From here on a dial happens, so this is the first point that may
    // prompt for CALL_PHONE — nothing before it (FAB, form, panel) asks.
    Events.Once("common:ussd", (ev) => {
      const data = ev.data as { ok: boolean; error?: string };
      if (!data?.ok) {
        toast.error(
          data?.error === "call permission denied"
            ? "Call permission was denied."
            : data?.error === "automation disabled"
              ? "Automation was switched off."
              : "Could not start the transaction.",
        );
      }
    });
    qe.start(script);
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <p className="text-sm text-muted-foreground">
        Pay a bill or buy goods with till.
      </p>

      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-sm px-2 py-2 text-xs font-medium transition-colors",
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {tab === "paybill" ? (
            <>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Paybill number</span>
                <Input
                  inputMode="numeric"
                  placeholder="123456"
                  value={paybill}
                  onChange={(e) => setPaybill(e.target.value)}
                  aria-invalid={touched && !isValidPaybill(paybill)}
                />
                {touched && !isValidPaybill(paybill) && (
                  <span className="text-xs text-destructive">
                    Enter a valid paybill number (4-7 digits).
                  </span>
                )}
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Account number</span>
                <Input
                  placeholder="Account name or number"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  aria-invalid={touched && !isValidAccount(account)}
                />
              </label>
            </>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Till number</span>
              <Input
                inputMode="numeric"
                placeholder="543210"
                value={till}
                onChange={(e) => setTill(e.target.value)}
                aria-invalid={touched && !isValidTill(till)}
              />
              {touched && !isValidTill(till) && (
                <span className="text-xs text-destructive">
                  Enter a valid till number (5-7 digits).
                </span>
              )}
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Amount (KSh)</span>
            <Input
              inputMode="numeric"
              placeholder="1000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={touched && !isValidAmount(amount)}
            />
            {touched && !isValidAmount(amount) && (
              <span className="text-xs text-destructive">
                Enter an amount between 1 and 500,000.
              </span>
            )}
          </label>
          {auto.available ? (
            <Button
              className="w-full"
              size="lg"
              onClick={handleSend}
              disabled={busy}
            >
              <ReceiptText className="size-4" />
              {tab === "paybill" ? "Pay Bill" : "Buy Goods"}
            </Button>
          ) : (
            <AutomationOffPanel />
          )}

        </CardContent>
      </Card>
    </div>
  );
}
