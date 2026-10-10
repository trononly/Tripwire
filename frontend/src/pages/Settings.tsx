import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  FileText,
  Monitor,
  Moon,
  MessageSquareText,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useKonamiCode } from "@/hooks/use-konami-code";
import { isAndroidBridge, type SmsPermissions } from "@/lib/sms-bridge";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";
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

export default function Settings({
  mode,
  onModeChange,
  isAndroid,
  smsPermissions,
  statements,
  statementTxCount,
  smsTxCount,
  onTestArrival,
}: {
  mode: "statements" | "sms";
  onModeChange: (mode: "statements" | "sms") => void;
  isAndroid: boolean;
  smsPermissions: SmsPermissions;
  statements: store.StatementMeta[];
  statementTxCount: number;
  smsTxCount: number;
  /** Debug-only: replay the arrival announcement without moving money. */
  onTestArrival: () => void;
}) {
  const debug = useKonamiCode();
  const smsRecords = statements.filter((s) => s.source === "sms");
  const statementRecords = statements.filter((s) => s.source !== "sms");
  const bridge = isAndroidBridge();
  const grantLabel = (granted: boolean) =>
    !bridge ? "n/a" : granted ? "granted" : "not granted";
  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight select-none"
          onClick={debug.tap}
        >
          Settings
        </h1>
      </div>
      {isAndroid && (
        <Card>
          <CardHeader>
            <CardTitle>Data mode</CardTitle>
            <CardDescription>
              Importing a statement or SMS switches this automatically.
            </CardDescription>
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
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
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
                  {smsRecords.length} records ·{" "}
                  {smsTxCount.toLocaleString()} txs loaded
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
    </div>
  );
}
