<!--
Thanks for the PR. Three things make reviews and releases quick:
  1. A short summary of what changed and why.
  2. A user-facing PR title - this is what ships as the release-note line.
  3. A "What's new" section (below) restating it. This is REQUIRED.

Why this matters here: releases are published from `tripwire-*` tags with
GitHub's auto-generated notes, and those notes are built from merged PR
titles (and labels), not PR bodies. The in-app "What's new" card and the
update dialog render that generated body, so the PR title is the text users
read. Write it as a plain sentence, then mirror it in the section below.
-->

## Summary
<!-- One or two sentences: what this PR does and why. -->

## What's new
<!-- REQUIRED. Restate the user-facing PR title here; plain language, no
     jargon, one line per change. Example:
     - Top Counterparties now remembers whether you last viewed Money in or Money out
     - Animations only play when the section is actually on screen
-->
-

## Testing
<!-- How you verified it: commands run, devices checked, edge cases. -->
- [ ] `go test ./...` passes
- [ ] `cd frontend && pnpm exec tsc --noEmit` passes
- [ ] `cd frontend && pnpm test` passes
