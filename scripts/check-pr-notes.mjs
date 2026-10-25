#!/usr/bin/env node
// Fails a PR whose description has no non-empty `## What's new` section.
// Used by ci.yml; the release workflow still has a fallback to the PR title.
//
// Skip the check by adding the `skip-release-notes` label for maintenance
// PRs that genuinely have no user-facing change (dependency bumps, etc.).

import { extractWhatsNew } from "./draft-release-notes.mjs";

const labels = (process.env.PR_LABELS ?? "")
	.split(",")
	.map((label) => label.trim())
	.filter(Boolean);

if (labels.includes("skip-release-notes")) {
	console.log("Skipping release-notes check (skip-release-notes label).");
	process.exit(0);
}

const bullets = extractWhatsNew(process.env.PR_BODY ?? "");
if (bullets.length === 0) {
	console.error(
		[
			"PR description needs a non-empty '## What's new' section.",
			"",
			"Add one bullet per user-facing change, for example:",
			"",
			"## What's new",
			"- Top Counterparties remembers whether you last viewed Money in or Money out",
			"",
			"If the PR has no user-facing change, add the 'skip-release-notes' label.",
		].join("\n"),
	);
	process.exit(1);
}

console.log(`What's new: ${bullets.length} bullet(s).`);
