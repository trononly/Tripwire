import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ReleaseNotes } from "@/components/release-notes";
import { useChangelog } from "@/hooks/use-changelog";
import { openExternalUrl } from "@/lib/external-url";

/**
 * "Changelog" button plus the dialog it opens: the release notes for the
 * build that is currently installed, read from cache when present and fetched
 * from GitHub once otherwise. Lives beside "Check for updates".
 */
export function ChangelogButton() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button variant="outline" size="sm" onClick={() => setOpen(true)}>
				Changelog
			</Button>
			{/* Always mounted so open/close animate; the notes are only
			    fetched once the dialog has been opened. */}
			<ChangelogDialog open={open} onOpenChange={setOpen} />
		</>
	);
}

function ChangelogDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { version, release, loading, error, refresh } = useChangelog(open);
	const shown = release?.version || version;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles className="size-4 text-primary" />
						Changelog
					</DialogTitle>
					<DialogDescription>
						{shown ? `Tripwire ${shown}` : "Tripwire"}
					</DialogDescription>
				</DialogHeader>

				{loading && !release && (
					<p className="text-sm text-muted-foreground">
						Loading changelog…
					</p>
				)}
				{error && !release && (
					<p className="text-sm text-destructive">{error}</p>
				)}
				{!loading && !error && !release && (
					<p className="text-sm text-muted-foreground">
						No changelog found for this build.
					</p>
				)}
				{release &&
					(release.notes.trim() !== "" ? (
						<div className="max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs/relaxed">
							<ReleaseNotes notes={release.notes} />
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							This release has no notes.
						</p>
					))}

				<div className="flex flex-wrap justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={refresh}
						disabled={loading}
					>
						{loading ? "Refreshing…" : "Refresh"}
					</Button>
					{release?.htmlUrl && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => openExternalUrl(release.htmlUrl)}
						>
							Releases page
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
