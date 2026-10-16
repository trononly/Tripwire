import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ReleaseNotes } from "@/components/release-notes";
import { useWhatsNew } from "@/hooks/use-whats-new";
import { openExternalUrl } from "@/lib/external-url";

/**
 * "What's new" for the installed build: the release notes for this exact
 * version, served from the local cache when present and fetched from the
 * GitHub release once otherwise. Android-only (that is where versions and
 * updates exist).
 */
export function WhatsNewCard() {
	const { version, release, loading, error, cached, refresh } = useWhatsNew();

	const heading = release
		? release.title || `Tripwire ${release.version}`
		: version
			? `Tripwire ${version}`
			: "Tripwire";

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Sparkles className="size-4 text-primary" />
					What&apos;s new
				</CardTitle>
				<CardDescription>
					{heading}
					{cached ? " · cached" : ""}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{loading && !release && (
					<p className="text-sm text-muted-foreground">
						Loading release notes…
					</p>
				)}
				{error && !release && (
					<p className="text-sm text-destructive">{error}</p>
				)}
				{!loading && !error && !release && (
					<p className="text-sm text-muted-foreground">
						No release notes found for this build.
					</p>
				)}
				{release &&
					(release.notes.trim() !== "" ? (
						<div className="max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs/relaxed">
							<ReleaseNotes notes={release.notes} />
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							This release has no notes.
						</p>
					))}
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={refresh}
						disabled={loading}
					>
						{loading ? "Refreshing…" : "Refresh"}
					</Button>
					{release?.htmlUrl && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => openExternalUrl(release.htmlUrl)}
						>
							Releases page
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
