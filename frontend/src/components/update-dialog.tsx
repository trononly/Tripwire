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
import { ReleaseNotes } from "@/components/release-notes";
import { formatBytes } from "@/lib/format";

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
 * The update prompt: what version is available, the new release's notes as
 * the Changelog, and the update / later / skip actions. Downloading shows
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

	// The latest release is normally the last history entry; if the history
	// fetch failed or lags, append the release we already have so the newest
	// notes are never dropped.
	const entries = [...updater.history];
	if (
		entries.length > 0 &&
		!entries.some((entry) => entry.version === release.version)
	) {
		entries.push({
			version: release.version,
			title: release.title,
			notes: release.notes,
			htmlUrl: release.htmlUrl,
		});
	}
	const multiple = entries.length > 1;
	const shown = multiple ? entries : release.notes.trim() ? [release] : [];

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
						{current ? ` - you're on ${current}` : ""}.{" "}
						{release.apkSize > 0 && `Download ${formatBytes(release.apkSize)}.`}
					</DialogDescription>
				</DialogHeader>

				{shown.length > 0 && (
					<div>
						<p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Changelog
						</p>
						{multiple ? (
							<div className="max-h-56 space-y-4 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs/relaxed">
								{entries.map((entry, index) => (
									<section
										key={entry.version}
										className={
											index > 0 ? "space-y-1 border-t pt-4" : "space-y-1"
										}
									>
										<div className="flex items-center gap-2">
											<p className="text-xs font-semibold">
												Tripwire {entry.version}
											</p>
											{entry.version === release.version && (
												<span className="bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
													New
												</span>
											)}
										</div>
										<ReleaseNotes notes={entry.notes} />
									</section>
								))}
							</div>
						) : (
							<div className="max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs/relaxed">
								<ReleaseNotes notes={release.notes} />
							</div>
						)}
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
						The Android installer should now be open - confirm the install
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
