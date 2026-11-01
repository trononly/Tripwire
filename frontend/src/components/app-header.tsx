import { Eye, EyeOff, MessageSquareText } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { HistorySheet } from "@/components/history-sheet";
import { SimSwitcher } from "@/components/sim-switcher";
import { BrandMark } from "@/components/brand-mark";
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
	historyOpen: boolean;
	activeId: string | null;
	setHistoryOpen: (open: boolean) => void;
	setImportOpen: (open: boolean) => void;
	onActivate: (id: string) => void;
	onDelete: (id: string) => void;
	onSwitchSim: (meta: store.StatementMeta) => void;
}

/** Quick Privacy Mode switch: blurs balances until each figure is tapped. */
function PrivacyToggle() {
	const on = usePrivacyMode();
	return (
		<Button
			size="icon-sm"
			variant="ghost"
			aria-pressed={on}
			aria-label={on ? "Turn off Privacy Mode" : "Turn on Privacy Mode"}
			title={on ? "Privacy Mode: on" : "Privacy Mode: off"}
			onClick={() => setPrivacyMode(!on)}
			data-compact
		>
			{on ? <EyeOff /> : <Eye />}
		</Button>
	);
}

/**
 * Sticky top bar. It carries the statement scope and the two capabilities
 * that must be one tap away (privacy and the SMS inbox), not a global
 * Import button: importing belongs to the screen that needs it.
 */
export function AppHeader(props: AppHeaderProps) {
	const {
		statements,
		mode,
		isAndroid,
		smsMetas,
		smsRecordId,
		simNumbers,
		historyOpen,
		activeId,
		setHistoryOpen,
		setImportOpen,
		onActivate,
		onDelete,
		onSwitchSim,
	} = props;
	const navigate = useNavigate();

	return (
		<header className="sticky top-0 z-40 border-b border-border bg-background">
			<div style={{ height: "var(--safe-top,env(safe-area-inset-top))" }} />
			<div className="flex h-14 items-center justify-between gap-2 px-4">
				<div className="flex min-w-0 items-center gap-2">
					<SidebarTrigger className="hidden lg:inline-flex" />
					{/* One brand only: the sidebar owns it from lg up. */}
					<BrandMark className="size-6 shrink-0 lg:hidden" />
					<span className="hidden text-lg font-bold tracking-tight text-foreground sm:inline lg:hidden">
						Tripwire
					</span>
				</div>

				<div className="flex min-w-0 items-center gap-1.5">
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
					{/* SMS mode owns its own import action on the SMS screen.
					    This icon is the way back to that screen from anywhere. */}
					{isAndroid && (
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Open SMS import"
							title="SMS import"
							onClick={() => navigate("/sms")}
							data-compact
						>
							<MessageSquareText />
						</Button>
					)}
					{isAndroid && mode === "sms" && (
						<SimSwitcher
							sims={smsMetas}
							activeId={smsRecordId}
							numbers={simNumbers}
							onSwitch={onSwitchSim}
						/>
					)}
				</div>
			</div>
		</header>
	);
}
