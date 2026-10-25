# Release notes

One file per release, named after the version without the `tripwire-` prefix:

```text
release-notes/0.9.7.md
```

`release.yml` publishes this file **verbatim** as the GitHub Release body.
The in-app **What's new** card and the Changelog dialog render that body, so
the file is what users read.

## Writing them

1. Draft from the merged PRs since the previous tag:

   ```
   node scripts/draft-release-notes.mjs tripwire-0.9.7
   ```

   The draft pulls the `## What's new` bullets from each merged PR and falls
   back to the PR title. It writes the file and refuses to overwrite one that
   already exists unless you pass `--force`.

2. Edit the file. Group related changes, drop internal details and
   duplicates, and order by what users care about. The draft is a starting
   point, not the final copy.

3. Commit the file through a PR (because `main` is protected), then tag the
   merge commit:

   ```
   git switch -c release/0.9.7-notes
   git add release-notes/0.9.7.md
   git commit -m "docs: release notes for 0.9.7"
   gh pr create --title "Release notes for 0.9.7" \
     --body "## What's new
   - Release notes for 0.9.7" --label skip-release-notes
   # merge once CI is green
   git switch main && git pull --ff-only
   git tag -a tripwire-0.9.7 -m "Tripwire 0.9.7"
   git push origin tripwire-0.9.7
   ```

The release workflow fails if the file is missing, empty, or has no
`## What's new` section. Do not publish from the GitHub UI and do not
re-enable `generate_release_notes`: both bypass this file.

## Shape

```markdown
## What's new
- Top Counterparties remembers whether you last viewed Money in or Money out
- Reduced motion now stops the pulsating Pay menu icons

**Full Changelog**: https://github.com/trononly/Tripwire/compare/tripwire-0.9.6...tripwire-0.9.7
```

Keep the heading exactly `## What's new`; both CI and the release workflow
look for it.
