<!--
Thanks for the PR. Three things make reviews and releases quick:
  1. A short summary of what changed and why.
  2. A user-facing PR title - it is the merge line and the fallback if the
     section below is missing.
  3. A "What's new" section (below). This is REQUIRED and CI checks it.

Why this matters here: releases publish a committed
`release-notes/<version>.md` file, not GitHub's auto-generated notes. The
bullets below are the raw material the release manager drafts from, groups,
and edits before tagging, so write them as plain sentences users can read.

If the PR has no user-facing change (dependency bump, CI-only work, etc.),
add the `skip-release-notes` label instead of inventing a bullet.
-->

## Summary
<!-- One or two sentences: what this PR does and why. -->

## What's new
<!-- REQUIRED. One plain-language bullet per user-facing change. Example:
     - Top Counterparties now remembers whether you last viewed Money in or Money out
     - Animations only play when the section is actually on screen
-->
-

## Testing
<!-- How you verified it: commands run, devices checked, edge cases. -->
- [ ] `go test ./...` passes
- [ ] `cd frontend && pnpm exec tsc --noEmit` passes
- [ ] `cd frontend && pnpm test` passes
- [ ] `node --test scripts/draft-release-notes.test.mjs` passes
