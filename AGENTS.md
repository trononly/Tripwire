# Agent guide

Tripwire is a Wails v3 app: a Go backend plus an embedded React/TypeScript
frontend (`frontend/`). Before changing anything, read `README.md` for the
architecture and the dev/test commands.

## Pull requests

Every PR **must** have a user-facing title and include a `## What's new`
section in its description, and the agent must call it out in its final
summary. CI checks that the section has at least one bullet. For maintenance
PRs with no user-facing change, add the `skip-release-notes` label instead.

The `## What's new` bullets are the raw material for the release. They are
not published automatically: the final notes are curated and committed as
`release-notes/<version>.md` before the tag is pushed.

The release flow is:

1. Draft from the merged PRs in the tag range:

   ```
   node scripts/draft-release-notes.mjs tripwire-1.2.3
   ```

2. Edit `release-notes/1.2.3.md`. Group related changes, drop duplicates,
   and order by what users care about. The draft is a starting point, not
   the final copy.

3. Commit the notes file to `main`, then tag that commit:

   ```
   git add release-notes/1.2.3.md
   git commit -m "docs: release notes for 1.2.3"
   git tag tripwire-1.2.3
   git push origin main --tags
   ```

The release workflow publishes `release-notes/<version>.md` verbatim as the
GitHub Release body, which is exactly what the in-app **What's new** /
Changelog dialog renders. It fails the release if the file is missing,
empty, or has no `## What's new` section. Do not publish from the GitHub UI
and do not re-enable `generate_release_notes`; both bypass this flow.

The PR title still matters: it is the merge line, the fallback when a PR has
no section, and the text reviewers see first. Write it as a user-facing
sentence, not a commit-style code. So a title like `Remember the last Top
Counterparties direction`, plus:

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
