# Agent guide

Tripwire is a Wails v3 app: a Go backend plus an embedded React/TypeScript
frontend (`frontend/`). Before changing anything, read `README.md` for the
architecture and the dev/test commands.

## Pull requests

Every PR **must** include a `## What's new` section in its description, and
the agent must call it out in its final summary.

How the shipped notes are actually built: releases are published from
`tripwire-*` tags and the workflow runs `generate_release_notes: true`, so
GitHub builds the notes from the **merged PR titles** (and labels) - not the
PR body. The line users read in the in-app **What's new** card and the update
dialog is your **PR title**, so write it as a user-facing sentence rather than
a commit-style code. The `## What's new` section restates it for reviewers.

So a title like `Remember the last Top Counterparties direction`, plus:

```text
## What's new
- Top Counterparties remembers whether you last viewed Money in or Money out
- Reduced motion now stops the pulsating Pay menu icons
- Animations only play when their section is on screen
```

The `.github/PULL_REQUEST_TEMPLATE.md` mirrors this. `gh pr create` does not
apply the template automatically, so pass the `## What's new` section in
`--body` yourself and set the user-facing line with `--title`.

## Checks before opening a PR

```
go test ./...
cd frontend && pnpm exec tsc --noEmit && pnpm test
```
