import { useState } from "react";
import { Events } from "@wailsio/runtime";
import { toast } from "sonner";
import { ReceiptText, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AutomationOffPanel, useAutomationAvailable } from "@/components/automation-gate";
import AmountField from "@/components/amount-field";
import FavouriteStar from "@/components/favourite-star";
import FavouritesRow from "@/components/favourites-row";
import LipaFavouritesSheet from "@/components/lipa-favourites-sheet";
import { cn } from "@/lib/utils";
import {
  isActiveLipaFavourite,
  type LipaFavourite,
} from "@/lib/lipa-favourites";
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
import { useLipaFavourites } from "@/hooks/use-lipa-favourites";
import { vibrateIfEnabled } from "@/lib/motion-settings";


type LipaTab = "paybill" | "till";
const TABS: { id: LipaTab; label: string; icon: typeof ReceiptText }[] = [
  { id: "paybill", label: "Paybill", icon: ReceiptText },
  { id: "till", label: "Buy Goods", icon: ShoppingCart },
];

/** Lipa na M-PESA - Paybill (paybill + account + amount) / Buy Goods (till + amount). */
export default function Lipa() {
  const [tab, setTab] = useState<LipaTab>("paybill");
  const [paybill, setPaybill] = useState("");
  const [account, setAccount] = useState("");
  const [till, setTill] = useState("");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const auto = useAutomationAvailable();
  const qe = useQuickEntry();
  const fav = useLipaFavourites();

  const paybillOk =
    isValidPaybill(paybill) && isValidAccount(account) && isValidAmount(amount);
  const tillOk = isValidTill(till) && isValidAmount(amount);
  const valid = tab === "paybill" ? paybillOk : tillOk;
  const busy = qe.status === "starting" || qe.status === "step";

  const currentNumber = tab === "paybill" ? paybill : till;
  const currentAccount = tab === "paybill" ? account : "";
  const canSave =
    tab === "paybill"
      ? isValidPaybill(paybill) && isValidAccount(account)
      : isValidTill(till);
  const favouriteSaved = fav.favourites.some((f) =>
    isActiveLipaFavourite(f, tab, currentNumber, currentAccount),
  );

  function pickFavourite(f: LipaFavourite) {
    vibrateIfEnabled(8);
    if (f.kind === "till") {
      setTab("till");
      setTill(f.number);
      return;
    }
    setTab("paybill");
    setPaybill(f.number);
    setAccount(f.account);
  }

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
    // prompt for CALL_PHONE - nothing before it (FAB, form, panel) asks.
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
        <CardContent className="space-y-5">
          <FavouritesRow
            items={fav.favourites.map((f) => ({
              id: f.id,
              name: f.name,
              active: isActiveLipaFavourite(
                f,
                tab,
                currentNumber,
                currentAccount,
              ),
              onPick: () => pickFavourite(f),
            }))}
            emptyTitle="Save your regular bills"
            emptyHint="Add a paybill or till for one-tap filling"
            onManage={() => setFavOpen(true)}
          />

          {tab === "paybill" ? (
            <>
              <div className="space-y-1.5">
                <label
                  htmlFor="lipa-paybill"
                  className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Paybill number
                </label>
                <div className="relative">
                  <Input
                    id="lipa-paybill"
                    inputMode="numeric"
                    placeholder="123456"
                    value={paybill}
                    maxLength={7}
                    onChange={(e) => setPaybill(e.target.value.replace(/\D/g, ""))}
                    aria-invalid={touched && !isValidPaybill(paybill)}
                    className="h-11 pr-11 text-lg font-semibold tracking-wide tabular-nums"
                  />
                  <FavouriteStar
                    saved={favouriteSaved}
                    disabled={!canSave || fav.loading}
                    label="Save to favourites"
                    onClick={() =>
                      void fav.add("", "paybill", paybill, account)
                    }
                  />
                </div>
                {touched && !isValidPaybill(paybill) && (
                  <span className="text-xs text-destructive">
                    Enter a valid paybill number (4-7 digits).
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="lipa-account"
                  className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Account number
                </label>
                <Input
                  id="lipa-account"
                  placeholder="Account name or number"
                  value={account}
                  maxLength={20}
                  onChange={(e) => setAccount(e.target.value)}
                  aria-invalid={touched && !isValidAccount(account)}
                  className="h-11 text-base"
                />
                {touched && !isValidAccount(account) && (
                  <span className="text-xs text-destructive">
                    Enter an account name or number.
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <label
                htmlFor="lipa-till"
                className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Till number
              </label>
              <div className="relative">
                <Input
                  id="lipa-till"
                  inputMode="numeric"
                  placeholder="543210"
                  value={till}
                  maxLength={7}
                  onChange={(e) => setTill(e.target.value.replace(/\D/g, ""))}
                  aria-invalid={touched && !isValidTill(till)}
                  className="h-11 pr-11 text-lg font-semibold tracking-wide tabular-nums"
                />
                <FavouriteStar
                  saved={favouriteSaved}
                  disabled={!canSave || fav.loading}
                  label="Save to favourites"
                  onClick={() => void fav.add("", "till", till, "")}
                />
              </div>
              {touched && !isValidTill(till) && (
                <span className="text-xs text-destructive">
                  Enter a valid till number (5-7 digits).
                </span>
              )}
            </div>
          )}

          <AmountField
            id="lipa-amount"
            value={amount}
            onChange={setAmount}
            invalid={touched && !isValidAmount(amount)}
            error={
              touched && !isValidAmount(amount)
                ? "Enter an amount between 1 and 500,000."
                : undefined
            }
          />

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

      <LipaFavouritesSheet
        open={favOpen}
        onOpenChange={setFavOpen}
        favourites={fav.favourites}
        loading={fav.loading}
        defaultKind={tab}
        defaultNumber={currentNumber}
        defaultAccount={currentAccount}
        onAdd={fav.add}
        onRename={fav.rename}
        onRemove={fav.remove}
        onReorder={fav.reorder}
      />
    </div>
  );
}
