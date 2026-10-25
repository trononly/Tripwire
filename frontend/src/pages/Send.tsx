import { useState } from "react";
import { Events } from "@wailsio/runtime";
import { toast } from "sonner";
import { Send as SendIcon, Star, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AutomationOffPanel, useAutomationAvailable } from "@/components/automation-gate";
import FavouritesRow from "@/components/favourites-row";
import FavouritesSheet from "@/components/favourites-sheet";
import { cn } from "@/lib/utils";
import {
  buildSendScript,
  isValidAmount,
  normalizePhone,
  type SendKind,
} from "@/lib/ussd-menus";
import {
  isAndroidBridge,
  openUssdAutomationSettings,
} from "@/lib/sms-bridge";
import { useQuickEntry } from "@/hooks/use-quick-entry";
import { useFavourites } from "@/hooks/use-favourites";
import { vibrateIfEnabled } from "@/lib/motion-settings";

const TABS: { id: SendKind; label: string; icon: typeof SendIcon }[] = [
  { id: "send", label: "Send Money", icon: SendIcon },
  { id: "pochi", label: "Pochi La Biashara", icon: Store },
];

/**
 * Send Money / Pochi La Biashara - number + amount. The automation service
 * fills the *334# menus step by step; the PIN stays in the phone dialog.
 */
export default function Send() {
  const [tab, setTab] = useState<SendKind>("send");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const auto = useAutomationAvailable();
  const qe = useQuickEntry();
  const fav = useFavourites();

  const phoneOk = normalizePhone(phone) !== "";
  const amountOk = isValidAmount(amount);
  const valid = phoneOk && amountOk;
  const busy = qe.status === "starting" || qe.status === "step";
  const favouriteSaved =
    phoneOk &&
    fav.favourites.some((f) => normalizePhone(f.phone) === normalizePhone(phone));

  function handleSend() {
    setTouched(true);
    if (!valid) {
      toast.error("Enter a valid number and amount.");
      return;
    }
    const script = buildSendScript(tab, phone, amount);
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
        Send to any network or to Pochi La Biashara.
      </p>

      {/* Top switcher: Send Money / Pochi */}
      <div
        className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
        role="tablist"
      >
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
          <FavouritesRow
            favourites={fav.favourites}
            phone={phone}
            onPick={(p) => {
              vibrateIfEnabled(8);
              setPhone(p);
            }}
            onManage={() => setFavOpen(true)}
          />
          <div className="h-px bg-border" />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="send-phone" className="text-sm font-medium">
                Phone number
              </label>
              {favouriteSaved ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                  <Star className="size-3.5 fill-current" aria-hidden />
                  Saved
                </span>
              ) : phoneOk && !fav.loading ? (
                <button
                  type="button"
                  onClick={() => void fav.add("", phone)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Star className="size-3.5" aria-hidden />
                  Save to favourites
                </button>
              ) : null}
            </div>
            <Input
              id="send-phone"
              inputMode="tel"
              placeholder="07XX XXX XXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={touched && !phoneOk}
            />
            {touched && !phoneOk && (
              <span className="block text-xs text-destructive">
                Enter a valid Safaricom number (07.. / 01..).
              </span>
            )}
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Amount (KSh)</span>
            <Input
              inputMode="numeric"
              placeholder="500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={touched && !amountOk}
            />
            {touched && !amountOk && (
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
              <SendIcon className="size-4" />
              {tab === "pochi" ? "Send to Pochi" : "Send"}
            </Button>
          ) : (
            <AutomationOffPanel />
          )}

        </CardContent>
      </Card>

      <FavouritesSheet
        open={favOpen}
        onOpenChange={setFavOpen}
        favourites={fav.favourites}
        loading={fav.loading}
        picking={fav.picking}
        canPick={fav.canPick}
        defaultPhone={phoneOk ? normalizePhone(phone) : ""}
        onAdd={fav.add}
        onRename={fav.rename}
        onRemove={fav.remove}
        onPickContact={fav.pickFromContacts}
      />
    </div>
  );
}


