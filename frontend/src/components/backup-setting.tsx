import { useCallback, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { Database, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	InspectBackup,
	PickBackupFile,
	PrepareBackup,
	RestoreBackup,
	SaveBackup,
} from "../../bindings/mpesa-analyzer/parseservice";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";
import {
	canExportDatabase,
	exportDatabase,
	type DatabaseExportResult,
} from "@/lib/sms-bridge";

/** Best-effort message for a rejected Wails call. */
function messageOf(err: unknown): string {
	if (err instanceof Error && err.message.trim()) return err.message;
	if (typeof err === "object" && err !== null && "message" in err) {
		const message = (err as { message?: unknown }).message;
		if (typeof message === "string" && message.trim()) return message;
	}
	const text = String(err ?? "").trim();
	return text && text !== "[object Object]"
		? text
		: "Something went wrong.";
}

function contents(summary: store.BackupSummary): string {
	const imports = `${summary.statements.toLocaleString()} ${
		summary.statements === 1 ? "import" : "imports"
	}`;
	const transactions = `${summary.transactions.toLocaleString()} ${
		summary.transactions === 1 ? "transaction" : "transactions"
	}`;
	return `${imports} · ${transactions}`;
}

/**
 * Settings -> Backup. The database is the whole product: statements, SMS
 * imports, favourites, categories and recurring payments. Exporting hands a
 * consistent snapshot to Android's document provider sheet (Drive, Downloads,
 * any file manager) or, on desktop, to the native save dialog. Restoring
 * picks a .db copy, validates it, and replaces the live store in one
 * transaction after a confirmation that names what it holds.
 */
export function BackupSetting() {
	const [saving, setSaving] = useState(false);
	const [picking, setPicking] = useState(false);
	const [restoring, setRestoring] = useState(false);
	const [pending, setPending] = useState<{
		path: string;
		summary: store.BackupSummary;
	} | null>(null);
	const saveBusy = useRef(false);

	const save = useCallback(async () => {
		if (saveBusy.current) return;
		saveBusy.current = true;
		setSaving(true);
		try {
			if (canExportDatabase()) {
				const backup = await PrepareBackup();
				if (!backup) {
					toast.error("Could not prepare the backup.");
					return;
				}
				await new Promise<void>((resolve, reject) => {
					const listener: { off?: () => void } = {};
					const timer = window.setTimeout(() => {
						listener.off?.();
						reject(new Error("The save sheet did not answer. Try again."));
					}, 5 * 60 * 1000);
					listener.off = Events.Once("common:export", (ev) => {
						window.clearTimeout(timer);
						listener.off?.();
						const data = (ev.data ?? {}) as DatabaseExportResult;
						if (data.cancelled) {
							resolve();
							return;
						}
						if (!data.ok) {
							reject(
								new Error(data.error || "Could not save the backup."),
							);
							return;
						}
						toast.success(
							`Backup saved as ${data.fileName || backup.fileName}.`,
						);
						resolve();
					});
					exportDatabase(backup.path, backup.fileName);
				});
				return;
			}

			const saved = await SaveBackup();
			// A cancelled save dialog is not an error.
			if (!saved) return;
			toast.success(`Backup saved as ${saved.fileName}.`);
		} catch (err) {
			toast.error(messageOf(err));
		} finally {
			saveBusy.current = false;
			setSaving(false);
		}
	}, []);

	const chooseRestore = useCallback(async () => {
		if (picking || saving || restoring) return;
		setPicking(true);
		try {
			const path = await PickBackupFile();
			if (!path) return;
			const summary = await InspectBackup(path);
			if (!summary) {
				toast.error("That file is not a Tripwire backup.");
				return;
			}
			setPending({ path, summary });
		} catch (err) {
			toast.error(messageOf(err));
		} finally {
			setPicking(false);
		}
	}, [picking, saving, restoring]);

	const confirmRestore = useCallback(async () => {
		if (!pending || restoring) return;
		setRestoring(true);
		try {
			await RestoreBackup(pending.path);
			toast.success("Backup restored.");
			// Every screen reads the store on mount; reload the shell so the
			// dashboard, history and wallet switcher all reflect the restore.
			window.setTimeout(() => window.location.reload(), 500);
		} catch (err) {
			toast.error(messageOf(err));
			setRestoring(false);
		}
	}, [pending, restoring]);

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Backup</CardTitle>
					<CardDescription>
						Save your data to Google Drive or your files.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" onClick={save} disabled={saving}>
							{saving ? (
								<Loader2 className="animate-spin motion-reduce:animate-none" />
							) : (
								<Database />
							)}
							{saving ? "Preparing…" : "Save a copy"}
						</Button>
						<Button
							variant="outline"
							onClick={chooseRestore}
							disabled={saving || picking || restoring}
						>
							{picking ? (
								<Loader2 className="animate-spin motion-reduce:animate-none" />
							) : (
								<RotateCcw />
							)}
							{picking ? "Choosing…" : "Restore"}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Dialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open && !restoring) setPending(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Restore backup</DialogTitle>
						<DialogDescription className="break-all">
							{pending?.summary.fileName}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2 text-sm">
						<div className="flex items-baseline justify-between gap-4">
							<span className="text-muted-foreground">Contains</span>
							<span className="text-right tabular-nums">
								{pending ? contents(pending.summary) : ""}
							</span>
						</div>
						<div className="flex items-baseline justify-between gap-4">
							<span className="text-muted-foreground">Replaces</span>
							<span className="text-right">
								Everything now in Tripwire
							</span>
						</div>
					</div>
					<p className="text-[13px] text-muted-foreground">
						This cannot be undone. Save a copy first if you may need the
						current data.
					</p>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setPending(null)}
							disabled={restoring}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={confirmRestore}
							disabled={restoring}
						>
							{restoring && (
								<Loader2 className="animate-spin motion-reduce:animate-none" />
							)}
							{restoring ? "Restoring…" : "Replace data"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
