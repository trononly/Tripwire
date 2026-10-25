import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CupSoda,
  FileText,
  Monitor,
  Moon,
  MessageSquareText,
  Smartphone,
  Sun,
  Tags,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  HAPTICS_KEY,
  REDUCE_MOTION_KEY,
  setSetting,
  useHapticsEnabled,
  useReduceMotionEnabled,
} from "@/lib/motion-settings";
import { setPrivacyMode, usePrivacyMode } from "@/lib/privacy-mode";
import { cn } from "@/lib/utils";
import { simName } from "@/components/sim-switcher";
import { useKonamiCode } from "@/hooks/use-konami-code";
import {
  hasPhoneStatePermission,
  isAndroidBridge,
  type SmsPermissions,
} from "@/lib/sms-bridge";
import { SODA_URL, openExternalUrl } from "@/lib/external-url";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";
import type { Updater } from "@/hooks/use-updater";
import { ChangelogButton } from "@/components/changelog-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex gap-2">
      {themes.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant={theme === value ? "default" : "outline"}
          onClick={() => setTheme(value)}
        >
          <Icon />
          {label}
        </Button>
      ))}
    </div>
  );
}

/** Android only: which dataset the analysis runs over. Statements show the
 * PDF history; SMS shows the phone's imported M-Pesa messages. */
function ModeSelector({
  mode,
  onModeChange,
}: {
  mode: "statements" | "sms";
  onModeChange: (mode: "statements" | "sms") => void;
}) {
  const options = [
    {
      value: "statements" as const,
      label: "Statements",
      icon: FileText,
    },
    {
      value: "sms" as const,
      label: "SMS",
      icon: MessageSquareText,
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onModeChange(value)}
          className={cn(
            "flex min-h-14 min-w-0 items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent/50",
            mode === value && "border-primary bg-accent",
          )}
        >
          <Icon className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 text-sm font-medium">{label}</span>
        </button>
      ))}
    </div>
  );
}

function MotionSettings() {
  const reduceMotion = useReduceMotionEnabled();
  const haptics = useHapticsEnabled();
  const toggle = (on: boolean, key: string, label: string) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">{label}</span>
      <Button
        variant={on ? "default" : "outline"}
        size="sm"
        aria-pressed={on}
        onClick={() => setSetting(key, !on)}
      >
        {on ? "On" : "Off"}
      </Button>
    </div>
  );
  return (
    <div className="space-y-2">
      {toggle(reduceMotion, REDUCE_MOTION_KEY, "Reduce motion")}
      {toggle(haptics, HAPTICS_KEY, "Haptics")}
    </div>
  );
}

/** Privacy Mode: blurs every balance figure behind a tap-to-reveal veil. */
function PrivacySetting() {
  const on = usePrivacyMode();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">Privacy Mode</span>
        <Button
          variant={on ? "default" : "outline"}
          size="sm"
          aria-pressed={on}
          onClick={() => setPrivacyMode(!on)}
        >
          {on ? "On" : "Off"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Blurs balances and chart figures. Tap a card or figure to reveal it.
      </p>
    </div>
  );
}

export default function Settings({
  mode,
  onModeChange,
  isAndroid,
  smsPermissions,
  statements,
  statementTxCount,
  smsTxCount,
  activeSmsId,
  onSwitchSim,
  numbers,
  onRefreshSimNames,
  onRequestSimNames,
  onTestArrival,
  updater,
}: {
  mode: "statements" | "sms";
  onModeChange: (mode: "statements" | "sms") => void;
  isAndroid: boolean;
  smsPermissions: SmsPermissions;
  statements: store.StatementMeta[];
  statementTxCount: number;
  smsTxCount: number;
  /** SMS record currently feeding SMS mode; null when none loaded. */
  activeSmsId: string | null;
  /** Switch SMS mode to another SIM's wallet. */
  onSwitchSim: (meta: store.StatementMeta) => void;
  /** Phone numbers by SIM key, shown as subtext when set. */
  numbers: Record<string, string>;
  /** Re-resolve carrier names when phone-state access is granted. */
  onRefreshSimNames: () => void;
  /** Ask for phone-state access (SIM names/numbers). Tap-only. */
  onRequestSimNames: () => void;
  /** Debug-only: replay the arrival announcement without moving money. */
  onTestArrival: () => void;
  updater: Updater;
}) {
  const debug = useKonamiCode();
  const toastedRef = useRef(debug.unlocked);
  useEffect(() => {
    if (debug.unlocked && !toastedRef.current) {
      toastedRef.current = true;
      toast.success("Debug unlocked");
    } else if (!debug.unlocked && toastedRef.current) {
      toastedRef.current = false;
      toast("Debug hidden");
    }
  }, [debug.unlocked]);
  const smsRecords = statements.filter((s) => s.source === "sms");
  const statementRecords = statements.filter((s) => s.source !== "sms");
  // Opening Settings re-resolves carrier names for wallets imported
  // without phone-state access - but only when that access is already
  // granted. Read-only: never prompts.
  useEffect(() => {
    onRefreshSimNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Phone-state grant state behind the "Show SIM names" opt-in. Rechecks
  // on return from the permission prompt so the button hides itself.
  const [phoneState, setPhoneState] = useState(hasPhoneStatePermission);
  useEffect(() => {
    const recheck = () => setPhoneState(hasPhoneStatePermission());
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);
  const bridge = isAndroidBridge();
  const grantLabel = (granted: boolean) =>
    !bridge ? "n/a" : granted ? "granted" : "not granted";
  return (
    <div className="space-y-6">
      <div onClick={debug.tap} className="select-none" aria-hidden="true" />
      {isAndroid && (
        <Card>
          <CardHeader>
            <CardTitle>Data mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ModeSelector mode={mode} onModeChange={onModeChange} />
            <Button asChild variant="ghost" size="sm">
              <Link to="/sms">
                <MessageSquareText />
                SMS import details
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {/* Every SIM the inbox import detected, one wallet each. Shown even
          for a single SIM so it is visible that detection worked; tapping
          switches the wallet Dashboard/Transactions/Insights analyze. */}
      {isAndroid && smsRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Wallet SIM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {smsRecords.map((sim) => {
              const isActive = sim.id === activeSmsId;
              const number = numbers[sim.simId ?? ""];
              return (
                <button
                  key={sim.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onSwitchSim(sim)}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent/50",
                    isActive && "border-primary bg-accent",
                  )}
                >
                  <Smartphone
                    className={cn(
                      "size-5 shrink-0",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {simName(sim)}
                    </span>
                    {number && (
                      <span className="block truncate text-xs text-muted-foreground tabular-nums">
                        {number}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {sim.txCount.toLocaleString()} txs
                  </span>
                </button>
              );
            })}
            {/* Installs that denied the phone-state half of the import
                prompt get one tap-only path to real SIM names/numbers. */}
            {!phoneState && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onRequestSimNames}
              >
                <Smartphone />
                Show SIM names
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Support</CardTitle>
          <CardDescription>
            Tripwire is free and open source. Tips keep it that way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => openExternalUrl(SODA_URL)}>
            <CupSoda />
            Buy me a soda
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Label transactions with your own emoji categories, on top of the
            M-Pesa ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/categories">
              <Tags />
              Manage categories
              <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ThemeSelector />
          <MotionSettings />
          <PrivacySetting />
        </CardContent>
      </Card>
      {debug.unlocked && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Debug</CardTitle>
            <CardDescription>
              Hidden diagnostics. Nothing here leaves the device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 font-mono text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Platform</dt>
                <dd>{isAndroid ? "Android" : "Desktop"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Read SMS</dt>
                <dd>{grantLabel(smsPermissions.read)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Receive SMS</dt>
                <dd>{grantLabel(smsPermissions.receive)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Call phone</dt>
                <dd>{grantLabel(smsPermissions.call)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Data mode</dt>
                <dd>{mode}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Statements</dt>
                <dd>
                  {statementRecords.length} records ·{" "}
                  {statementTxCount.toLocaleString()} txs loaded
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">SMS imports</dt>
                <dd>
                  {smsRecords.length} records · {smsTxCount.toLocaleString()}{" "}
                  txs loaded
                </dd>
              </div>
            </dl>
            {isAndroid && (
              <Button
                variant="outline"
                size="sm"
                onClick={onTestArrival}
                className="mt-3"
              >
                Test arrival announcement
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {isAndroid && (
        <Card>
          <CardHeader>
            <CardTitle>App updates</CardTitle>
            <CardDescription>
              {updater.current
                ? `Tripwire ${updater.current} installed`
                : "Tripwire"}
              {updater.status === "checking"
                ? " - checking…"
                : updater.status === "available" && updater.release
                  ? ` - ${updater.release.version} ready`
                  : updater.status === "up-to-date"
                    ? " - you're up to date"
                    : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {updater.status === "error" && updater.error && (
              <p className="text-sm text-destructive">{updater.error}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updater.check(true)}
                disabled={updater.status === "checking"}
              >
                {updater.status === "checking"
                  ? "Checking…"
                  : "Check for updates"}
              </Button>
              <ChangelogButton />
              {updater.status === "available" && updater.release && (
                <Button size="sm" onClick={updater.reopen}>
                  View update
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
