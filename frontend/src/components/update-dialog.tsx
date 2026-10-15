import { ArrowUpCircle, Download, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { Updater } from "@/hooks/use-updater";

function formatBytes(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "";
	const mb = n / (1024 * 1024);
	return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function ProgressBar({ received, total }: { received: number; total: number }) {
	const pct =
		total > 0 ? Math.min(100, Math.max(0, (received / total) * 100)) : 0;
	return (
		<div
			className="h-2 w-full overflow-hidden rounded-full bg-muted"
			role="progressbar"
			aria-valuenow={Math.round(pct)}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<div
				className="h-full rounded-full bg-primary transition-[width]"
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}

/**
 * The update prompt: what version is available, the release notes as
 * "What's new", and the update / later / skip actions. Downloading shows
 * progress; once the APK is handed to the system installer the user
 * finishes in the Android install sheet.
 */
export function UpdateDialog({ updater }: { updater: Updater }) {
	const {
		status,
		visible,
		current,
		release,
		progress,
		error,
		needsInstallPermission,
	} = updater;
	if (!release) return null;

	const downloading = status === "downloading";
	const failed = status === "error";
	const installed = status === "ready";

	return (
		<Dialog
			open={visible}
			onOpenChange={(open) => {
				if (!open && !downloading) updater.dismiss();
			}}
		>
			<DialogContent showCloseButton={!downloading}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ArrowUpCircle className="size-4 text-primary" />
						{installed ? "Update downloaded" : `Update to ${release.version}`}
					</DialogTitle>
					<DialogDescription>
						Tripwire {release.version} is available
						{current ? ` — you're on ${current}` : ""}.{" "}
						{release.apkSize > 0 && `Download ${formatBytes(release.apkSize)}.`}
					</DialogDescription>
				</DialogHeader>

				{release.notes.trim() !== "" && (
					<div>
						<p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
							What&apos;s new
						</p>
						<div className="max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs/relaxed whitespace-pre-wrap">
							{release.notes.trim()}
						</div>
					</div>
				)}

				{downloading && progress && (
					<div className="space-y-1.5">
						<ProgressBar received={progress.received} total={progress.total} />
						<p className="text-xs text-muted-foreground">
							Downloading… {formatBytes(progress.received)}
							{progress.total > 0 && ` of ${formatBytes(progress.total)}`}
						</p>
					</div>
				)}

				{needsInstallPermission && !downloading && (
					<p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs/relaxed">
						Android blocked the install. Turn on{" "}
						<strong>Allow from this source</strong> for Tripwire in system
						settings, then come back and tap Update again.
					</p>
				)}

				{failed && error && (
					<p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs/relaxed">
						{error}{" "}
						You can also install it by hand from the releases page.
					</p>
				)}

				{installed && (
					<p className="text-xs/relaxed text-muted-foreground">
						The Android installer should now be open — confirm the install
						there to finish. If you missed it, tap Update again.
					</p>
				)}

				<DialogFooter>
					{needsInstallPermission && !downloading ? (
						<>
							<Button variant="ghost" size="sm" onClick={updater.dismiss}>
								Later
							</Button>
							<Button size="sm" onClick={updater.openInstallSettings}>
								<ExternalLink />
								Allow installs
							</Button>
						</>
					) : downloading ? (
						<Button variant="ghost" size="sm" disabled>
							<Download />
							Downloading…
						</Button>
					) : installed ? (
						<>
							<Button variant="ghost" size="sm" onClick={updater.dismiss}>
								Close
							</Button>
							<Button size="sm" onClick={updater.download}>
								<Download />
								Open installer again
							</Button>
						</>
					) : failed ? (
						<>
							<Button variant="ghost" size="sm" onClick={updater.openReleasePage}>
								<ExternalLink />
								Releases page
							</Button>
							<Button size="sm" onClick={updater.download}>
								<Download />
								Retry
							</Button>
						</>
					) : (
						<>
							<Button variant="ghost" size="sm" onClick={updater.skip}>
								Skip version
							</Button>
							<Button variant="outline" size="sm" onClick={updater.dismiss}>
								Later
							</Button>
							<Button size="sm" onClick={updater.download}>
								<Download />
								Update
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
