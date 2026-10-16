import { Eye, EyeOff, FileUp, MessageSquareText } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { HistorySheet } from "@/components/history-sheet";
import { SimSwitcher } from "@/components/sim-switcher";
import { setPrivacyMode, usePrivacyMode } from "@/lib/privacy-mode";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";
import type { DataMode } from "@/lib/data-mode";

export interface AppHeaderProps {
	statements: store.StatementMeta[];
	mode: DataMode;
	isAndroid: boolean;
	smsMetas: store.StatementMeta[];
	smsRecordId: string | null;
	simNumbers: Record<string, string>;
	smsImporting: boolean;
	historyOpen: boolean;
	activeId: string | null;
	setHistoryOpen: (open: boolean) => void;
	setImportOpen: (open: boolean) => void;
	onActivate: (id: string) => void;
	onDelete: (id: string) => void;
	onSwitchSim: (meta: store.StatementMeta) => void;
	onImportSms: () => void;
}

/** Quick Privacy Mode switch: blurs balances until each figure is tapped. */
function PrivacyToggle() {
	const on = usePrivacyMode();
	return (
		<Button
			size="icon"
			variant="ghost"
			aria-pressed={on}
			aria-label={on ? "Turn off Privacy Mode" : "Turn on Privacy Mode"}
			title={on ? "Privacy Mode: on" : "Privacy Mode: off"}
			onClick={() => setPrivacyMode(!on)}
		>
			{on ? <EyeOff /> : <Eye />}
		</Button>
	);
}

/** Sticky top bar: brand, history, and the mode-matched import action. */
export function AppHeader(props: AppHeaderProps) {
	const {
		statements,
		mode,
		isAndroid,
		smsMetas,
		smsRecordId,
		simNumbers,
		smsImporting,
		historyOpen,
		activeId,
		setHistoryOpen,
		setImportOpen,
		onActivate,
		onDelete,
		onSwitchSim,
		onImportSms,
	} = props;
	return (
		<header className="sticky top-0 z-40 border-b border-border bg-background">
			<div style={{ height: "env(safe-area-inset-top)" }} />
			<div className="flex h-14 items-center justify-between gap-2 px-4">
				<div className="flex items-center gap-2">
					<SidebarTrigger className="hidden md:inline-flex" />
					<img src="/tripwire.svg" alt="Tripwire" className="w-6 h-6" />
					<span className="font-bold text-lg text-foreground">Tripwire</span>
				</div>

				<div className="flex items-center gap-2">
					{(statements.length > 0 || smsMetas.length > 0) && (
						<PrivacyToggle />
					)}
					{statements.length > 0 && mode === "statements" && (
						<HistorySheet
							statements={statements}
							activeId={activeId}
							open={historyOpen}
							onOpenChange={setHistoryOpen}
							onActivate={onActivate}
							onDelete={onDelete}
							onImport={() => setImportOpen(true)}
						/>
					)}
					{/* The header import matches the data mode: statements on
					    desktop and in statements mode, M-Pesa SMS in SMS mode.
					    A second SIM adds a wallet switcher beside it. */}
					{isAndroid && mode === "sms" && (
						<SimSwitcher
							sims={smsMetas}
							activeId={smsRecordId}
							numbers={simNumbers}
							onSwitch={onSwitchSim}
						/>
					)}
					{isAndroid && mode === "sms" ? (
						<Button
							size="sm"
							variant="ghost"
							onClick={onImportSms}
							disabled={smsImporting}
						>
							<MessageSquareText />
							<span className="hidden sm:inline">
								{smsImporting ? "Reading…" : "Import SMS"}
							</span>
							<span className="sm:hidden">SMS</span>
						</Button>
					) : (
						<Button size="sm" onClick={() => setImportOpen(true)}>
							<FileUp />
							<span className="hidden sm:inline">Import Statement</span>
							<span className="sm:hidden">Import</span>
						</Button>
					)}
				</div>
			</div>
		</header>
	);
}
